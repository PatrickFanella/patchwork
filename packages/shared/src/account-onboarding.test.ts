import { describe, expect, it } from 'vitest';
import {
    CURRENT_POLICY_VERSION,
    acceptPolicyConsentSchema,
    accountPreferenceSchema,
    defaultAccountPreferences,
    requiredPolicyDocuments,
} from './account-onboarding.js';

describe('account onboarding contracts', () => {
    it('requires the current policy, every document, and an 18+ assertion', () => {
        expect(
            acceptPolicyConsentSchema.parse({
                policyVersion: CURRENT_POLICY_VERSION,
                asserted18OrOlder: true,
                acceptedDocuments: [...requiredPolicyDocuments],
            }),
        ).toBeDefined();
        expect(
            acceptPolicyConsentSchema.safeParse({
                policyVersion: 'stale',
                asserted18OrOlder: true,
                acceptedDocuments: [...requiredPolicyDocuments],
            }).success,
        ).toBe(false);
        expect(
            acceptPolicyConsentSchema.safeParse({
                policyVersion: CURRENT_POLICY_VERSION,
                asserted18OrOlder: false,
                acceptedDocuments: [...requiredPolicyDocuments],
            }).success,
        ).toBe(false);
        expect(
            acceptPolicyConsentSchema.safeParse({
                policyVersion: CURRENT_POLICY_VERSION,
                asserted18OrOlder: true,
                acceptedDocuments: ['terms-of-use'],
            }).success,
        ).toBe(false);
    });

    it('accepts privacy-safe defaults and rejects exact-location preferences', () => {
        expect(accountPreferenceSchema.parse(defaultAccountPreferences)).toEqual(
            defaultAccountPreferences,
        );
        expect(
            accountPreferenceSchema.safeParse({
                ...defaultAccountPreferences,
                location: {
                    sharing: 'exact',
                    noPermanentAddress: false,
                },
            }).success,
        ).toBe(false);
    });

    it('maps the legacy privacy and visibility pair to one canonical audience', () => {
        expect(
            accountPreferenceSchema.parse({
                privacy: 'community',
                visibility: 'authenticated',
                notifications: defaultAccountPreferences.notifications,
                language: 'en',
                location: defaultAccountPreferences.location,
            }),
        ).toMatchObject({ audience: 'authenticated' });
    });
});
