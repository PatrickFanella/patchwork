import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrganizationPaymentsService } from './organization-payments-service.js';
import { GENERAL_FUND_RECIPIENT_ID, SupportService } from './support-service.js';
import { FakeStripe } from './testing/fake-stripe.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const tierVersion = '00000000-0000-4000-8000-000000000101';
const owner = 'did:plc:recognitionowner';

const migration = (name: string) =>
    readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');

describe('supporter recognition', () => {
    const schema = `recognition_${randomUUID().replaceAll('-', '')}`;
    const adminPool = new Pool({ connectionString: databaseUrl });
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    let support: SupportService;
    let organizations: OrganizationPaymentsService;
    let sequence = 0;

    const subscribe = async (
        donorDid: string,
        options: { recipientId?: string; status?: string; pausedReason?: string } = {},
    ) => {
        sequence += 1;
        await pool.query(
            `INSERT INTO supporter_subscriptions (
                subscription_id, recipient_id, tier_version_id, donor_did, stripe_subscription_id,
                status, paused_reason, livemode, stripe_state_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW(), NOW(), NOW())`,
            [
                randomUUID(), options.recipientId ?? GENERAL_FUND_RECIPIENT_ID, tierVersion, donorDid,
                `sub_1Recognition${sequence}`, options.status ?? 'active', options.pausedReason ?? null,
            ],
        );
    };

    const give = async (donorDid: string, recipientId: string, succeededAt: string) => {
        sequence += 1;
        await pool.query(
            `INSERT INTO donations (
                donation_id, recipient_id, donor_did, stripe_checkout_session_id, amount_minor,
                currency, status, livemode, created_at, updated_at, succeeded_at
            ) VALUES ($1, $2, $3, $4, 1000, 'usd', 'succeeded', FALSE, $5, $5, $5)`,
            [randomUUID(), recipientId, donorDid, `cs_test_1Recognition${sequence}`, succeededAt],
        );
    };

    const recognize = (donorDid: string, settings: Partial<Record<'badgeVisible' | 'listedPublicly' | 'shareNameWithRecipient', boolean>>) =>
        support.updateRecognition(donorDid, {
            badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false, ...settings,
        });

    const organizationRecipient = async () => {
        const organizationId = randomUUID();
        const recipientId = randomUUID();
        await pool.query(
            `INSERT INTO organizations (
                organization_id, slug, name, description, origin, non_endorsement_label,
                created_by_did, created_at, updated_at
            ) VALUES ($1, $2, 'Corner Fridge', 'Community fridge', 'visitor-created', 'Listed.', $3, NOW(), NOW())`,
            [organizationId, `fridge-${organizationId.slice(0, 8)}`, owner],
        );
        await pool.query(
            `INSERT INTO organization_memberships (
                organization_id, member_did, role, status, invited_by_did, joined_at, updated_at
            ) VALUES ($1, $2, 'owner', 'active', $2, NOW(), NOW())`,
            [organizationId, owner],
        );
        await pool.query(
            `INSERT INTO payment_recipients (
                recipient_id, kind, organization_id, display_name, stripe_account_id,
                charges_enabled, status, created_at, updated_at
            ) VALUES ($1, 'organization', $2, 'Corner Fridge', $3, TRUE, 'active', NOW(), NOW())`,
            [recipientId, organizationId, `acct_1${organizationId.replaceAll('-', '').slice(0, 16)}`],
        );
        return { organizationId, recipientId };
    };

    beforeAll(async () => {
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        for (const name of [
            '0016_organizations_and_stewardship.sql',
            '0017_verification_and_exact_public_addresses.sql',
            '0040_donations_and_supporter_tiers.sql',
            '0041_general_fund_checkout.sql',
            '0042_organization_payment_recipients.sql',
        ]) {
            await pool.query(await migration(name));
        }
    });

    afterAll(async () => {
        await pool.end();
        await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
        await adminPool.end();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE supporter_subscriptions, donations, supporter_recognition CASCADE');
        await pool.query(`DELETE FROM payment_recipients WHERE kind = 'organization'`);
        await pool.query('DELETE FROM organizations');
        const stripe = new FakeStripe();
        const mode = { paymentsMode: 'test' as const, publicWebOrigin: 'https://patchwork.example.test' };
        support = new SupportService(pool, stripe, { ...mode, receipt: { mode: 'non-deductible' } });
        organizations = new OrganizationPaymentsService(pool, stripe, mode);
    });

    it('starts with every recognition setting off and saves explicit choices only', async () => {
        await expect(support.getAccountSupport('did:plc:new')).resolves.toMatchObject({
            isSupporter: false,
            recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false },
        });
        for (const body of [
            { badgeVisible: true },
            { badgeVisible: 'yes', listedPublicly: false, shareNameWithRecipient: false },
            { badgeVisible: true, listedPublicly: false, shareNameWithRecipient: false, amount: true },
        ]) {
            await expect(support.updateRecognition('did:plc:new', body))
                .rejects.toMatchObject({ code: 'INVALID_SUPPORT_REQUEST' });
        }
        await recognize('did:plc:new', { badgeVisible: true });
        await subscribe('did:plc:new');
        await expect(support.getAccountSupport('did:plc:new')).resolves.toMatchObject({
            isSupporter: true,
            recognition: { badgeVisible: true, listedPublicly: false, shareNameWithRecipient: false },
        });
    });

    it('shows a badge only for opted-in donors with an active, unpaused monthly gift', async () => {
        const fridge = await organizationRecipient();
        await recognize('did:plc:active', { badgeVisible: true });
        await subscribe('did:plc:active');
        await recognize('did:plc:orgonly', { badgeVisible: true });
        await subscribe('did:plc:orgonly', { recipientId: fridge.recipientId });
        await recognize('did:plc:hidden', {});
        await subscribe('did:plc:hidden');
        await recognize('did:plc:overdue', { badgeVisible: true });
        await subscribe('did:plc:overdue', { status: 'past_due' });
        await recognize('did:plc:paused', { badgeVisible: true });
        await subscribe('did:plc:paused', { pausedReason: 'recipient-ineligible' });
        await recognize('did:plc:cancelled', { badgeVisible: true });
        await subscribe('did:plc:cancelled', { status: 'canceled' });
        await recognize('did:plc:onetime', { badgeVisible: true });
        await give('did:plc:onetime', GENERAL_FUND_RECIPIENT_ID, new Date().toISOString());

        expect(await support.listBadgeHolders([
            'did:plc:active', 'did:plc:active', 'did:plc:orgonly', 'did:plc:hidden', 'did:plc:overdue',
            'did:plc:paused', 'did:plc:cancelled', 'did:plc:onetime', 'not-a-did', 'did:plc:unknown',
        ])).toEqual(['did:plc:active', 'did:plc:orgonly']);

        // Turning the badge off removes it immediately.
        await recognize('did:plc:active', { badgeVisible: false });
        expect(await support.listBadgeHolders(['did:plc:active'])).toEqual([]);
    });

    it('lists only opted-in general-fund monthly supporters, ordered by DID', async () => {
        const fridge = await organizationRecipient();
        await recognize('did:plc:zeta', { listedPublicly: true });
        await subscribe('did:plc:zeta');
        await recognize('did:plc:alpha', { listedPublicly: true });
        await subscribe('did:plc:alpha');
        await recognize('did:plc:orgsupporter', { listedPublicly: true });
        await subscribe('did:plc:orgsupporter', { recipientId: fridge.recipientId });
        await recognize('did:plc:private', { badgeVisible: true });
        await subscribe('did:plc:private');
        expect(await support.listPublicSupporters()).toEqual(['did:plc:alpha', 'did:plc:zeta']);
    });

    it('shows organizations only the names donors chose to share, without amounts', async () => {
        const fridge = await organizationRecipient();
        const other = await organizationRecipient();
        await recognize('did:plc:monthlyshare', { shareNameWithRecipient: true });
        await subscribe('did:plc:monthlyshare', { recipientId: fridge.recipientId });
        await recognize('did:plc:giftshare', { shareNameWithRecipient: true });
        await give('did:plc:giftshare', fridge.recipientId, new Date().toISOString());
        await recognize('did:plc:oldgift', { shareNameWithRecipient: true });
        await give('did:plc:oldgift', fridge.recipientId, '2024-01-01T00:00:00Z');
        await recognize('did:plc:noshare', { badgeVisible: true });
        await subscribe('did:plc:noshare', { recipientId: fridge.recipientId });
        await recognize('did:plc:otherorg', { shareNameWithRecipient: true });
        await subscribe('did:plc:otherorg', { recipientId: other.recipientId });

        const status = await organizations.getStatus(owner, fridge.organizationId);
        expect(status.namedSupporterDids).toEqual(['did:plc:giftshare', 'did:plc:monthlyshare']);
        expect(status.activeMonthlySupporters).toBe(2);
    });
});
