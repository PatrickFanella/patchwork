import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountPrivacyService } from '../account-privacy-service.js';
import { OrganizationPaymentsService } from './organization-payments-service.js';
import { PaymentLifecycleService } from './payment-lifecycle-service.js';
import { PaymentModerationService } from './payment-moderation-service.js';
import { StripeApiError, type StripeSubscription } from './stripe-gateway.js';
import { GENERAL_FUND_RECIPIENT_ID } from './support-service.js';
import { FakeStripe } from './testing/fake-stripe.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const tierVersion = '00000000-0000-4000-8000-000000000101';
const donor = 'did:plc:lifecycledonor';
const otherDonor = 'did:plc:lifecycleother';
const moderator = 'did:plc:lifecyclemoderator';
const owner = 'did:plc:lifecycleowner';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// Deactivation and export read indexer and moderation tables too, so this
// suite uses the public schema that the integration runner fully migrates,
// like the account privacy suite. Database suites run one file at a time.
describe('payment lifecycle', () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const dids = [donor, otherDonor, moderator, 'did:plc:secondmoderator'];
    let stripe: FakeStripe;
    let lifecycle: PaymentLifecycleService;
    let moderation: PaymentModerationService;
    let privacy: AccountPrivacyService;
    let sequence = 0;

    const stripeSubscription = (id: string): StripeSubscription => ({
        id, status: 'active', livemode: false, customer: 'cus_1Lifecycle', cancelAtPeriodEnd: false,
        currentPeriodEnd: 1_796_000_000, collectionPaused: false, metadata: {},
    });

    const subscribe = async (
        donorDid: string | null,
        options: { recipientId?: string; status?: string; cancelAtPeriodEnd?: boolean; updatedAt?: string } = {},
    ) => {
        sequence += 1;
        const subscriptionId = randomUUID();
        const stripeId = `sub_1Lifecycle${sequence}`;
        await pool.query(
            `INSERT INTO supporter_subscriptions (
                subscription_id, recipient_id, tier_version_id, donor_did, stripe_subscription_id,
                status, cancel_at_period_end, livemode, stripe_state_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW(), NOW(), COALESCE($8::timestamptz, NOW()))`,
            [
                subscriptionId, options.recipientId ?? GENERAL_FUND_RECIPIENT_ID, tierVersion, donorDid,
                stripeId, options.status ?? 'active', options.cancelAtPeriodEnd ?? false, options.updatedAt ?? null,
            ],
        );
        return { subscriptionId, stripeId };
    };

    const give = async (donorDid: string | null, createdAt = new Date().toISOString()) => {
        sequence += 1;
        await pool.query(
            `INSERT INTO donations (
                donation_id, recipient_id, donor_did, stripe_checkout_session_id,
                stripe_payment_intent_id, amount_minor, currency, status, livemode,
                created_at, updated_at, succeeded_at
            ) VALUES ($1, $2, $3, $4, $5, 2500, 'usd', 'succeeded', FALSE, $6, $6, $6)`,
            [randomUUID(), GENERAL_FUND_RECIPIENT_ID, donorDid, `cs_test_1Lifecycle${sequence}`, `pi_1Lifecycle${sequence}`, createdAt],
        );
    };

    const checkoutSession = async (donorDid: string | null, status: string, updatedAt = new Date().toISOString()) => {
        sequence += 1;
        await pool.query(
            `INSERT INTO payment_checkout_sessions (
                checkout_id, client_key, request_hash, recipient_id, mode, amount_minor, currency,
                donor_did, stripe_checkout_session_id, status, livemode, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'one-time', 2500, 'usd', $5, $6, $7, FALSE, $8, $8)`,
            [
                randomUUID(), randomUUID(), hash(String(sequence)), GENERAL_FUND_RECIPIENT_ID, donorDid,
                `cs_test_1Checkout${sequence}`, status, updatedAt,
            ],
        );
    };

    const organizationRecipient = async (name: string) => {
        const organizationId = randomUUID();
        const recipientId = randomUUID();
        const accountId = `acct_1${organizationId.replaceAll('-', '').slice(0, 16)}`;
        await pool.query(
            `INSERT INTO organizations (
                organization_id, slug, name, description, origin, non_endorsement_label,
                created_by_did, created_at, updated_at
            ) VALUES ($1, $2, $3, 'Mutual aid', 'visitor-created', 'Listed.', $4, NOW(), NOW())`,
            [organizationId, `org-${organizationId.slice(0, 8)}`, name, owner],
        );
        await pool.query(
            `INSERT INTO payment_recipients (
                recipient_id, kind, organization_id, display_name, stripe_account_id,
                charges_enabled, status, created_at, updated_at
            ) VALUES ($1, 'organization', $2, $3, $4, TRUE, 'active', NOW(), NOW())`,
            [recipientId, organizationId, name, accountId],
        );
        return { organizationId, recipientId, accountId };
    };

    const notifications = async () =>
        (await pool.query<{ recipient_did: string; notification_type: string }>(
            'SELECT recipient_did, notification_type FROM notification_intents ORDER BY created_at',
        )).rows;

    const reset = async () => {
        await pool.query(
            `TRUNCATE payment_commands, supporter_subscriptions, donations, donor_accounts,
                      payment_checkout_sessions, supporter_recognition, payment_audit_events,
                      payment_webhook_events CASCADE`,
        );
        await pool.query(`DELETE FROM payment_recipients WHERE kind = 'organization'`);
        await pool.query('DELETE FROM organizations WHERE created_by_did = $1', [owner]);
        await pool.query('DELETE FROM notification_intents WHERE recipient_did = ANY($1)', [dids]);
        await pool.query('DELETE FROM account_deactivations WHERE did_hash = ANY($1)', [dids.map(hash)]);
    };

    beforeAll(async () => {
        // Other suites truncate shared tables with CASCADE, which can empty the
        // migration seeds, so restore the general fund and the tier used here.
        await pool.query(
            `INSERT INTO supporter_tiers (tier_key, sort_order, active, created_at, updated_at)
             VALUES ('tier-1', 1, TRUE, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        );
        await pool.query(
            `INSERT INTO supporter_tier_versions (
                tier_version_id, tier_key, version, name_key, description_key,
                amount_minor, currency, current, created_at
             ) VALUES ($1, 'tier-1', 1, 'support.tiers.tier1.name', 'support.tiers.tier1.description',
                       500, 'usd', TRUE, NOW())
             ON CONFLICT DO NOTHING`,
            [tierVersion],
        );
        await pool.query(
            `INSERT INTO payment_recipients (recipient_id, kind, display_name, status, created_at, updated_at)
             VALUES ($1, 'general-fund', 'Patchwork general fund', 'active', NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [GENERAL_FUND_RECIPIENT_ID],
        );
    });

    afterAll(async () => {
        await reset();
        await pool.end();
    });

    beforeEach(async () => {
        await reset();
        stripe = new FakeStripe();
        lifecycle = new PaymentLifecycleService(pool, stripe);
        moderation = new PaymentModerationService(pool);
        privacy = new AccountPrivacyService(pool);
    });

    it('deactivation ends monthly gifts at period end and keeps gift records without the donor', async () => {
        const fridge = await organizationRecipient('Corner Fridge');
        const general = await subscribe(donor);
        const organization = await subscribe(donor, { recipientId: fridge.recipientId, status: 'past_due' });
        await subscribe(donor, { status: 'canceled' });
        await subscribe(donor, { cancelAtPeriodEnd: true });
        const others = await subscribe(otherDonor);
        await give(donor);
        await give(otherDonor);
        await checkoutSession(donor, 'complete');
        await pool.query(
            `INSERT INTO donor_accounts (donor_account_id, donor_did, recipient_id, stripe_customer_id, created_at, updated_at)
             VALUES ($1, $2, $3, 'cus_1Lifecycle', NOW(), NOW())`,
            [randomUUID(), donor, GENERAL_FUND_RECIPIENT_ID],
        );
        await pool.query(
            `INSERT INTO supporter_recognition (donor_did, badge_visible, listed_publicly, share_name_with_recipient, updated_at)
             VALUES ($1, TRUE, TRUE, TRUE, NOW()), ($2, TRUE, FALSE, FALSE, NOW())`,
            [donor, otherDonor],
        );

        const result = await privacy.deactivate(donor, randomUUID());
        expect(result).toMatchObject({
            removed: { supporterRecognition: 1 },
            revoked: { monthlyGifts: 2 },
            retained: { paymentDonations: 1, paymentSubscriptions: 4 },
        });
        for (const table of ['donations', 'supporter_subscriptions', 'payment_checkout_sessions', 'donor_accounts', 'supporter_recognition']) {
            const left = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE donor_did = $1`, [donor]);
            expect(left.rows[0].count, table).toBe(0);
        }
        const kept = await pool.query('SELECT COUNT(*)::int AS count FROM donations');
        expect(kept.rows[0].count).toBe(2);
        await expect(pool.query('SELECT donor_did FROM supporter_recognition')).resolves.toMatchObject({
            rows: [{ donor_did: otherDonor }],
        });

        stripe.setSubscription(stripeSubscription(general.stripeId));
        stripe.setSubscription(stripeSubscription(organization.stripeId), { accountId: fridge.accountId });
        await expect(lifecycle.runCommandSweep()).resolves.toEqual({ completed: 2, retried: 0, deadLettered: 0 });
        expect(stripe.cancelCalls).toEqual(expect.arrayContaining([
            { subscriptionId: general.stripeId, idempotencyKey: `patchwork-cancel-${general.subscriptionId}` },
            {
                subscriptionId: organization.stripeId,
                idempotencyKey: `patchwork-cancel-${organization.subscriptionId}`,
                accountId: fridge.accountId,
            },
        ]));
        expect(stripe.cancelCalls).toHaveLength(2);
        const ending = await pool.query<{ stripe_subscription_id: string; cancel_at_period_end: boolean }>(
            `SELECT stripe_subscription_id, cancel_at_period_end FROM supporter_subscriptions
              WHERE stripe_subscription_id = ANY($1)`,
            [[general.stripeId, organization.stripeId, others.stripeId]],
        );
        expect(Object.fromEntries(ending.rows.map(row => [row.stripe_subscription_id, row.cancel_at_period_end]))).toEqual({
            [general.stripeId]: true, [organization.stripeId]: true, [others.stripeId]: false,
        });
        await expect(lifecycle.runCommandSweep()).resolves.toEqual({ completed: 0, retried: 0, deadLettered: 0 });
        // A repeated deactivation returns the stored receipt and queues nothing new.
        await expect(privacy.deactivate(donor, randomUUID())).resolves.toEqual(result);
        expect(await notifications()).toEqual([]);
    });

    it('retries Stripe outages, dead-letters rejected commands and requeues them', async () => {
        const subscriptions = [await subscribe(null), await subscribe(null), await subscribe(null)];
        const start = new Date('2026-10-31T12:00:00Z');
        for (const [index, subscription] of subscriptions.entries()) {
            await pool.query(
                `INSERT INTO payment_commands (command_id, kind, subscription_id, status, next_attempt_at, created_at)
                 VALUES ($1, 'cancel-at-period-end', $2, 'pending', $3, $3::timestamptz + ($4 * INTERVAL '1 second'))`,
                [randomUUID(), subscription.subscriptionId, start, index],
            );
        }
        // The first is unavailable, the second rejected, the third already gone from Stripe.
        stripe.setSubscription(stripeSubscription(subscriptions[0]!.stripeId));
        stripe.setSubscription(stripeSubscription(subscriptions[1]!.stripeId));
        stripe.cancelFailures.push(new StripeApiError('UNAVAILABLE', true), new StripeApiError('INVALID_REQUEST', false));
        await expect(lifecycle.runCommandSweep(25, start)).resolves.toEqual({ completed: 1, retried: 1, deadLettered: 1 });
        await expect(lifecycle.getOperatorMetrics(new Date(start.getTime() + 30_000))).resolves.toEqual({
            pendingCommands: 1, oldestPendingCommandSeconds: 30, deadLetterCommands: 1,
        });
        // The retry waits for its backoff.
        await expect(lifecycle.runCommandSweep(25, new Date(start.getTime() + 30_000)))
            .resolves.toEqual({ completed: 0, retried: 0, deadLettered: 0 });
        await expect(lifecycle.runCommandSweep(25, new Date(start.getTime() + 61_000)))
            .resolves.toEqual({ completed: 1, retried: 0, deadLettered: 0 });

        await expect(lifecycle.requeueCommands(new Date(start.getTime() + 62_000))).resolves.toBe(1);
        await expect(lifecycle.runCommandSweep(25, new Date(start.getTime() + 62_000)))
            .resolves.toEqual({ completed: 1, retried: 0, deadLettered: 0 });
        await expect(lifecycle.getOperatorMetrics()).resolves.toMatchObject({ pendingCommands: 0, deadLetterCommands: 0 });
        const keys = stripe.cancelCalls.map(call => call.idempotencyKey);
        expect(new Set(keys)).toEqual(new Set(subscriptions.map(row => `patchwork-cancel-${row.subscriptionId}`)));
    });

    it('waits without Stripe credentials instead of dropping queued commands', async () => {
        const subscription = await subscribe(null);
        await pool.query(
            `INSERT INTO payment_commands (command_id, kind, subscription_id, status, next_attempt_at, created_at)
             VALUES ($1, 'cancel-at-period-end', $2, 'pending', NOW(), NOW())`,
            [randomUUID(), subscription.subscriptionId],
        );
        const unconfigured = new PaymentLifecycleService(pool);
        await expect(unconfigured.runCommandSweep()).resolves.toEqual({ completed: 0, retried: 0, deadLettered: 0 });
        await expect(unconfigured.getOperatorMetrics()).resolves.toMatchObject({ pendingCommands: 1 });
    });

    it('exports only the account’s own giving, without Stripe identifiers', async () => {
        await subscribe(donor, { cancelAtPeriodEnd: true });
        await subscribe(otherDonor);
        await give(donor);
        await give(otherDonor);
        await pool.query(
            `INSERT INTO supporter_recognition (donor_did, badge_visible, listed_publicly, share_name_with_recipient, updated_at)
             VALUES ($1, TRUE, FALSE, TRUE, NOW())`,
            [donor],
        );
        const exported = await privacy.exportFor(donor);
        const support = (exported['data'] as Record<string, unknown>)['support'];
        expect(support).toEqual({
            donations: [expect.objectContaining({
                recipientName: 'Patchwork general fund', amountMinor: 2_500, currency: 'usd', status: 'succeeded',
            })],
            subscriptions: [expect.objectContaining({
                recipientName: 'Patchwork general fund', tierKey: 'tier-1', amountMinor: 500,
                status: 'active', cancelAtPeriodEnd: true, pausedReason: null,
            })],
            recognition: expect.objectContaining({ badgeVisible: true, listedPublicly: false, shareNameWithRecipient: true }),
        });
        const text = JSON.stringify(exported);
        for (const forbidden of ['cus_', 'sub_1', 'cs_test_', 'pi_1', 'acct_', otherDonor]) {
            expect(text).not.toContain(forbidden);
        }
        expect(exported['exclusions']).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'payment-processor' }),
        ]));
        await expect(privacy.exportFor('did:plc:nobody')).resolves.toMatchObject({
            data: { support: { donations: [], subscriptions: [], recognition: { badgeVisible: false, updatedAt: null } } },
        });
    });

    it('lets moderators suspend and restore organization fundraising with an audited reason', async () => {
        const fridge = await organizationRecipient('Corner Fridge');
        const pantry = await organizationRecipient('Pantry');
        const gift = await subscribe(donor, { recipientId: fridge.recipientId });
        stripe.setSubscription(stripeSubscription(gift.stripeId), { accountId: fridge.accountId });

        for (const body of [
            {}, { recipientId: fridge.recipientId }, { recipientId: fridge.recipientId, reason: '   ' },
            { recipientId: 'not-a-uuid', reason: 'Fraud' }, { recipientId: fridge.recipientId, reason: 'x', extra: 1 },
        ]) {
            await expect(moderation.suspend(moderator, body)).rejects.toMatchObject({ code: 'INVALID_MODERATION_REQUEST' });
        }
        await expect(moderation.suspend(moderator, { recipientId: GENERAL_FUND_RECIPIENT_ID, reason: 'No' }))
            .rejects.toMatchObject({ code: 'PAYMENT_RECIPIENT_NOT_FOUND' });
        await expect(moderation.restore(moderator, { recipientId: fridge.recipientId, reason: 'Early' }))
            .rejects.toMatchObject({ code: 'PAYMENT_RECIPIENT_NOT_SUSPENDED' });

        await expect(moderation.suspend(moderator, { recipientId: fridge.recipientId, reason: 'Fraud report 12' }))
            .resolves.toMatchObject({ status: 'suspended', suspensionReason: 'Fraud report 12', activeMonthlyGifts: 1 });
        await moderation.suspend('did:plc:secondmoderator', { recipientId: fridge.recipientId, reason: 'Again' });
        const listed = await moderation.listRecipients();
        expect(listed.map(row => [row.displayName, row.status])).toEqual([
            ['Corner Fridge', 'suspended'], ['Pantry', 'active'],
        ]);
        expect(listed[0]).toMatchObject({ suspensionReason: 'Fraud report 12' });

        // The next eligibility sweep pauses the gift and tells the donor.
        const organizations = new OrganizationPaymentsService(pool, stripe, {
            paymentsMode: 'test', publicWebOrigin: 'https://patchwork.example.test',
        });
        await expect(organizations.runEligibilitySweep()).resolves.toEqual({ paused: 1, failed: 0 });
        await expect(organizations.runEligibilitySweep()).resolves.toEqual({ paused: 0, failed: 0 });
        await expect(pool.query('SELECT paused_reason FROM supporter_subscriptions')).resolves.toMatchObject({
            rows: [{ paused_reason: 'recipient-suspended' }],
        });
        expect(await notifications()).toEqual([{ recipient_did: donor, notification_type: 'support_recipient_paused' }]);

        await expect(moderation.restore(moderator, { recipientId: fridge.recipientId, reason: 'Report resolved' }))
            .resolves.toMatchObject({ status: 'active', suspensionReason: null, activeMonthlyGifts: 0 });
        // Restoring does not resume paused gifts; that is an open owner decision.
        await expect(pool.query('SELECT paused_reason FROM supporter_subscriptions')).resolves.toMatchObject({
            rows: [{ paused_reason: 'recipient-suspended' }],
        });
        const audit = await pool.query<{ actor_did: string; action: string; details: Record<string, unknown> }>(
            'SELECT actor_did, action, details FROM payment_audit_events ORDER BY audit_id',
        );
        expect(audit.rows).toEqual([
            { actor_did: moderator, action: 'recipient-suspended', details: { reason: 'Fraud report 12', previousStatus: 'active' } },
            { actor_did: moderator, action: 'recipient-restored', details: { reason: 'Report resolved', restoredStatus: 'active' } },
        ]);

        // A deactivated moderator's DID is replaced on retained decisions.
        await moderation.suspend(moderator, { recipientId: pantry.recipientId, reason: 'Second report' });
        await privacy.deactivate(moderator, randomUUID());
        const marker = `deactivated:${hash(moderator)}`;
        await expect(pool.query('SELECT suspended_by_did FROM payment_recipients WHERE recipient_id = $1', [pantry.recipientId]))
            .resolves.toMatchObject({ rows: [{ suspended_by_did: marker }] });
        const actors = await pool.query('SELECT DISTINCT actor_did FROM payment_audit_events');
        expect(actors.rows).toEqual([{ actor_did: marker }]);

        await pool.query('DELETE FROM organizations WHERE organization_id = $1', [pantry.organizationId]);
        await expect(moderation.restore(moderator, { recipientId: pantry.recipientId, reason: 'Late' }))
            .rejects.toMatchObject({ code: 'PAYMENT_RECIPIENT_CLOSED' });
    });

    it('deletes payment records past retention and keeps active gifts', async () => {
        const now = new Date('2026-10-31T12:00:00Z');
        const eightYearsAgo = '2018-10-01T00:00:00Z';
        const hundredDaysAgo = '2026-07-23T00:00:00Z';
        await give(null, eightYearsAgo);
        await give(null, '2020-01-01T00:00:00Z');
        const ended = await subscribe(null, { status: 'canceled', updatedAt: eightYearsAgo });
        await pool.query(
            `INSERT INTO payment_commands (command_id, kind, subscription_id, status, next_attempt_at, created_at, completed_at)
             VALUES ($1, 'cancel-at-period-end', $2, 'done', $3, $3, $3)`,
            [randomUUID(), ended.subscriptionId, eightYearsAgo],
        );
        await subscribe(null, { status: 'active', updatedAt: eightYearsAgo });
        await subscribe(null, { status: 'canceled', updatedAt: '2025-01-01T00:00:00Z' });
        await checkoutSession(null, 'expired', hundredDaysAgo);
        await checkoutSession(null, 'open', now.toISOString());
        await checkoutSession(null, 'complete', hundredDaysAgo);
        for (const [id, status, processedAt] of [
            ['evt_1Old', 'processed', hundredDaysAgo], ['evt_1Recent', 'ignored', now.toISOString()],
            ['evt_1Waiting', 'pending', null],
        ] as const) {
            await pool.query(
                `INSERT INTO payment_webhook_events (
                    stripe_event_id, source, event_type, livemode, stripe_created_at, received_at,
                    status, next_attempt_at, processed_at
                ) VALUES ($1, 'platform', 'invoice.paid', FALSE, $2, $2, $3, $2, $4)`,
                [id, hundredDaysAgo, status, processedAt],
            );
        }
        await pool.query(
            `INSERT INTO payment_audit_events (recipient_id, actor_did, action, details, occurred_at)
             VALUES ($1, NULL, 'recipient-suspended', '{}'::jsonb, $2), ($1, NULL, 'recipient-restored', '{}'::jsonb, $3)`,
            [GENERAL_FUND_RECIPIENT_ID, eightYearsAgo, now],
        );

        await expect(lifecycle.runRetention(now)).resolves.toEqual({
            donations: 1, subscriptions: 1, checkoutSessions: 1, webhookEvents: 1, auditEvents: 1, commands: 1,
        });
        await expect(lifecycle.runRetention(now)).resolves.toEqual({
            donations: 0, subscriptions: 0, checkoutSessions: 0, webhookEvents: 0, auditEvents: 0, commands: 0,
        });
        const left = await pool.query<{ status: string }>('SELECT status FROM supporter_subscriptions ORDER BY status');
        expect(left.rows.map(row => row.status)).toEqual(['active', 'canceled']);
    });
});
