import type { Pool } from 'pg';
import {
    CURRENT_POLICY_VERSION,
    acceptPolicyConsentSchema,
    accountPreferenceSchema,
    defaultAccountPreferences,
    requiredPolicyDocuments,
    type AccountPreferences,
} from '@patchwork/shared';
import { PublicHttpError } from './http/error-response.js';

const toIso = (value: Date | string): string =>
    new Date(value).toISOString();

const consentExemptPaths = new Set([
    '/auth/session',
    '/auth/refresh',
    '/account/onboarding',
    '/account/consent',
    '/account/preferences',
    '/account/export',
    '/account/deactivate',
]);

export const isConsentExemptPath = (pathname: string): boolean =>
    consentExemptPaths.has(pathname);

export class AccountOnboardingService {
    constructor(private readonly pool: Pool) {}

    async statusFor(did: string): Promise<Record<string, unknown>> {
        const result = await this.pool.query<{
            accepted_at: Date | string;
        }>(
            `SELECT accepted_at FROM account_policy_consents
             WHERE did = $1 AND policy_version = $2
               AND asserted_18_or_older = TRUE`,
            [did, CURRENT_POLICY_VERSION],
        );
        return {
            policyVersion: CURRENT_POLICY_VERSION,
            requiredDocuments: [...requiredPolicyDocuments],
            consentRequired: result.rows.length === 0,
            acceptedAt:
                result.rows[0] ?
                    toIso(result.rows[0].accepted_at)
                :   null,
        };
    }

    async requireCurrentConsent(did: string): Promise<void> {
        const status = await this.statusFor(did);
        if (status['consentRequired'] === true) {
            throw new PublicHttpError(
                403,
                'CURRENT_POLICY_CONSENT_REQUIRED',
                'Current policy consent is required.',
            );
        }
    }

    async accept(
        did: string,
        input: unknown,
        acceptedAt = new Date(),
    ): Promise<Record<string, unknown>> {
        const consent = acceptPolicyConsentSchema.safeParse(input);
        if (!consent.success) {
            throw new PublicHttpError(
                400,
                'INVALID_POLICY_CONSENT',
                'Current policy consent and 18+ eligibility are required.',
            );
        }
        await this.pool.query(
            `INSERT INTO account_policy_consents (
                did, policy_version, asserted_18_or_older,
                accepted_documents, accepted_at
             ) VALUES ($1, $2, TRUE, $3::jsonb, $4)
             ON CONFLICT (did, policy_version) DO NOTHING`,
            [
                did,
                CURRENT_POLICY_VERSION,
                JSON.stringify(consent.data.acceptedDocuments),
                acceptedAt.toISOString(),
            ],
        );
        return this.statusFor(did);
    }

    async preferencesFor(did: string): Promise<AccountPreferences> {
        const result = await this.pool.query<{
            privacy: AccountPreferences['privacy'];
            notifications: AccountPreferences['notifications'];
            visibility: AccountPreferences['visibility'];
            language: AccountPreferences['language'];
            location: AccountPreferences['location'];
        }>(
            `SELECT privacy, notifications, visibility, language, location
             FROM account_preferences WHERE did = $1`,
            [did],
        );
        const row = result.rows[0];
        return row ? accountPreferenceSchema.parse(row)
        : structuredClone(defaultAccountPreferences);
    }

    async updatePreferences(
        did: string,
        input: unknown,
        changedAt = new Date(),
    ): Promise<AccountPreferences> {
        const preferences = accountPreferenceSchema.safeParse(input);
        if (!preferences.success) {
            throw new PublicHttpError(
                400,
                'INVALID_ACCOUNT_PREFERENCES',
                'The account preferences are invalid.',
            );
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const previous = await client.query<{
                privacy: string;
                notifications: unknown;
                visibility: string;
                language: string;
                location: unknown;
            }>(
                `SELECT privacy, notifications, visibility, language, location
                 FROM account_preferences WHERE did = $1 FOR UPDATE`,
                [did],
            );
            await client.query(
                `INSERT INTO account_preferences (
                    did, privacy, notifications, visibility, language,
                    location, created_at, updated_at
                 ) VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $7)
                 ON CONFLICT (did) DO UPDATE SET
                    privacy = EXCLUDED.privacy,
                    notifications = EXCLUDED.notifications,
                    visibility = EXCLUDED.visibility,
                    language = EXCLUDED.language,
                    location = EXCLUDED.location,
                    updated_at = EXCLUDED.updated_at`,
                [
                    did,
                    preferences.data.privacy,
                    JSON.stringify(preferences.data.notifications),
                    preferences.data.visibility,
                    preferences.data.language,
                    JSON.stringify(preferences.data.location),
                    changedAt.toISOString(),
                ],
            );
            await client.query(
                `INSERT INTO account_preference_audit (
                    did, previous_value, next_value, changed_at
                 ) VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
                [
                    did,
                    previous.rows[0] ?
                        JSON.stringify(previous.rows[0])
                    :   null,
                    JSON.stringify(preferences.data),
                    changedAt.toISOString(),
                ],
            );
            await client.query('COMMIT');
            return preferences.data;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
