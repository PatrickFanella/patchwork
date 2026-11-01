import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentWebhookService } from './payment-webhook-service.js';
import { StripeApiError, type StripeCheckoutSession, type StripeEvent, type StripeSubscription } from './stripe-gateway.js';
import { FakeStripe } from './testing/fake-stripe.js';
import { applyApiMigrations } from './testing/migrations.js';
import { SupportService, type SupportServiceOptions } from './support-service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const donorDid = 'did:plc:supportdonor';
const origin = 'https://patchwork.example.test';


describe('SupportService', () => {
    const schema = `support_${randomUUID().replaceAll('-', '')}`;
    const adminPool = new Pool({ connectionString: databaseUrl });
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    let stripe: FakeStripe;
    let service: SupportService;
    let webhooks: PaymentWebhookService;
    let eventSequence = 0;

    const options: SupportServiceOptions = {
        paymentsMode: 'test',
        publicWebOrigin: origin,
        receipt: { mode: 'non-deductible' },
    };

    /** Deliver an event as Stripe would, then run one sweep. */
    const deliver = async (type: string, object: Record<string, unknown>, account?: string) => {
        eventSequence += 1;
        const event: StripeEvent = {
            id: `evt_1Support${eventSequence}`,
            type,
            livemode: false,
            created: 1_793_400_000 + eventSequence,
            ...(account ? { account } : {}),
            data: { object },
        };
        stripe.events.set(event.id, event);
        await webhooks.receive({
            eventId: event.id,
            source: account ? 'connect' : 'platform',
            ...(account ? { accountId: account } : {}),
            type,
            livemode: false,
            created: event.created,
        });
        const result = await webhooks.runSweep(25, new Date(Date.now() + 1_000));
        expect(result.retried + result.deadLettered).toBe(0);
        return result;
    };

    const notifications = async () =>
        (await pool.query<{ recipient_did: string; notification_type: string; deduplication_key: string }>(
            `SELECT recipient_did, notification_type, deduplication_key
               FROM notification_intents ORDER BY created_at, deduplication_key`,
        )).rows;

    const completeSession = (
        url: string,
        changes: Partial<StripeCheckoutSession>,
    ): StripeCheckoutSession => {
        const { session, scope } = stripe.sessionByUrl(url);
        const completed = { ...session, status: 'complete' as const, ...changes };
        stripe.setSession(completed, scope);
        return completed;
    };

    beforeAll(async () => {
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        await applyApiMigrations(pool);
    });

    afterAll(async () => {
        await pool.end();
        await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
        await adminPool.end();
    });

    beforeEach(async () => {
        await pool.query(
            `TRUNCATE payment_webhook_events, payment_charge_states, donations, supporter_subscriptions,
                      donor_accounts, supporter_tier_prices, payment_checkout_sessions,
                      payment_audit_events, notification_intents, payment_commands CASCADE`,
        );
        await pool.query(`DELETE FROM payment_recipients WHERE kind = 'organization'`);
        await pool.query('DELETE FROM organizations');
        await pool.query('UPDATE supporter_tiers SET active = TRUE');
        stripe = new FakeStripe();
        service = new SupportService(pool, stripe, options);
        webhooks = new PaymentWebhookService(pool, stripe, { processors: service.processors() });
    });

    it('lists the placeholder ladder and the receipt wording mode', async () => {
        await expect(service.getOptions()).resolves.toEqual({
            paymentsEnabled: true,
            mode: 'test',
            currency: 'usd',
            receipt: { mode: 'non-deductible' },
            oneTime: { minMinor: 100, maxMinor: 1_000_000, suggestedMinor: [1_000, 2_500, 5_000] },
            tiers: [
                { key: 'tier-1', version: 1, nameKey: 'support.tiers.tier1.name', descriptionKey: 'support.tiers.tier1.description', amountMinor: 500, currency: 'usd' },
                { key: 'tier-2', version: 1, nameKey: 'support.tiers.tier2.name', descriptionKey: 'support.tiers.tier2.description', amountMinor: 1_500, currency: 'usd' },
                { key: 'tier-3', version: 1, nameKey: 'support.tiers.tier3.name', descriptionKey: 'support.tiers.tier3.description', amountMinor: 4_000, currency: 'usd' },
            ],
        });
    });

    it('creates a one-time Checkout with server-validated amounts and replays the same key', async () => {
        const clientKey = randomUUID();
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 2_500 };
        const first = await service.createCheckout({ body, clientKey });
        expect(first.url).toMatch(/^https:\/\/checkout\.stripe\.test\//u);
        const call = stripe.checkoutCalls[0]!;
        expect(call.idempotencyKey).toMatch(new RegExp(`^patchwork-checkout-${first.checkoutId}-[0-9a-f]{16}$`, 'u'));
        expect(call.params).toMatchObject({
            mode: 'payment',
            submit_type: 'donate',
            customer_creation: 'always',
            client_reference_id: first.checkoutId,
            success_url: `${origin}/support/thanks?checkout=${first.checkoutId}`,
            cancel_url: `${origin}/support/cancelled?checkout=${first.checkoutId}`,
            metadata: { patchwork_checkout_id: first.checkoutId, patchwork_recipient: 'general-fund' },
            line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 2_500 } }],
        });

        await expect(service.createCheckout({ body, clientKey })).resolves.toEqual(first);
        expect(stripe.checkoutCalls).toHaveLength(1);
        await expect(service.createCheckout({ body: { ...body, amountMinor: 2_600 }, clientKey }))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        await expect(service.createCheckout({ body, clientKey, donorDid }))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });

    it.each([
        { recipient: 'general-fund', mode: 'one-time', amountMinor: 99 },
        { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_000_001 },
        { recipient: 'general-fund', mode: 'one-time', amountMinor: 10.5 },
        { recipient: 'general-fund', mode: 'one-time', amountMinor: '2500' },
        { recipient: 'general-fund', mode: 'one-time' },
        { recipient: 'general-fund', mode: 'one-time', amountMinor: 500, tierKey: 'tier-1' },
        { recipient: 'general-fund', mode: 'monthly', amountMinor: 500 },
        { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-1', extra: true },
        { recipient: { organizationId: 'not-a-uuid' }, mode: 'one-time', amountMinor: 500 },
        { recipient: { organizationId: randomUUID(), extra: 1 }, mode: 'one-time', amountMinor: 500 },
        { recipient: 'general-fund', mode: 'weekly', tierKey: 'tier-1' },
    ])('rejects %j without calling Stripe', async body => {
        await expect(service.createCheckout({ body, clientKey: randomUUID() }))
            .rejects.toMatchObject({ code: 'INVALID_SUPPORT_REQUEST' });
        expect(stripe.checkoutCalls).toHaveLength(0);
    });

    it('refuses checkout when payments are off or the key is not a UUID', async () => {
        const off = new SupportService(pool, stripe, { ...options, paymentsMode: 'off' });
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 500 };
        await expect(off.createCheckout({ body, clientKey: randomUUID() }))
            .rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
        await expect(service.createCheckout({ body, clientKey: 'not-a-uuid' }))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
        expect((await off.getOptions()).paymentsEnabled).toBe(false);
    });

    it('retries a failed Stripe call with the same Stripe idempotency key', async () => {
        const clientKey = randomUUID();
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_000 };
        stripe.failNextCheckout = true;
        await expect(service.createCheckout({ body, clientKey }))
            .rejects.toMatchObject({ code: 'CHECKOUT_UNAVAILABLE' });
        const retried = await service.createCheckout({ body, clientKey });
        const keys = stripe.checkoutCalls.map(call => call.idempotencyKey);
        expect(keys).toHaveLength(2);
        expect(keys[0]).toMatch(new RegExp(`^patchwork-checkout-${retried.checkoutId}-`, 'u'));
        expect(keys[1]).toBe(keys[0]);
        await expect(service.getCheckoutStatus(retried.checkoutId)).resolves.toMatchObject({ status: 'open' });
    });

    it('uses a new Stripe key when a retry has different parameters', async () => {
        // The first attempt fails before any customer is known; the donor then
        // gains a customer from another gift, so the retry names it.
        const clientKey = randomUUID();
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_000 };
        stripe.failNextCheckout = true;
        await expect(service.createCheckout({ body, clientKey, donorDid })).rejects.toMatchObject({ code: 'CHECKOUT_UNAVAILABLE' });
        await pool.query(
            `INSERT INTO donor_accounts (donor_account_id, donor_did, recipient_id, stripe_customer_id, created_at, updated_at)
             VALUES ($1, $2, '00000000-0000-4000-8000-000000000001', 'cus_1Later', NOW(), NOW())`,
            [randomUUID(), donorDid],
        );
        await expect(service.createCheckout({ body, clientKey, donorDid })).resolves.toBeDefined();
        const [first, second] = stripe.checkoutCalls;
        expect(second!.params['customer']).toBe('cus_1Later');
        expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
    });

    it('drops a customer deleted or a Price archived in Stripe and retries once', async () => {
        await pool.query(
            `INSERT INTO donor_accounts (donor_account_id, donor_did, recipient_id, stripe_customer_id, created_at, updated_at)
             VALUES ($1, $2, '00000000-0000-4000-8000-000000000001', 'cus_1Deleted', NOW(), NOW())`,
            [randomUUID(), donorDid],
        );
        const monthly = { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-1' };
        // First Checkout records the Price, which the owner then archives.
        await service.createCheckout({ body: monthly, clientKey: randomUUID() });
        const archived = String((stripe.checkoutCalls[0]!.params['line_items'] as Array<Record<string, unknown>>)[0]!['price']);
        stripe.unusable.add('cus_1Deleted');
        stripe.unusable.add(archived);

        await expect(service.createCheckout({ body: monthly, clientKey: randomUUID(), donorDid })).resolves.toBeDefined();
        const retry = stripe.checkoutCalls.at(-1)!.params;
        expect(retry['customer']).toBeUndefined();
        const replacement = String((retry['line_items'] as Array<Record<string, unknown>>)[0]!['price']);
        expect(replacement).not.toBe(archived);
        await expect(pool.query('SELECT stripe_customer_id FROM donor_accounts WHERE donor_did = $1', [donorDid]))
            .resolves.toMatchObject({ rowCount: 0 });
        await expect(pool.query('SELECT stripe_price_id FROM supporter_tier_prices'))
            .resolves.toMatchObject({ rows: [{ stripe_price_id: replacement }] });

        // Any other rejection is not retried.
        const before = stripe.checkoutCalls.length;
        const rejecting = vi.spyOn(stripe, 'createCheckoutSession').mockRejectedValueOnce(new StripeApiError('INVALID_REQUEST', false));
        await expect(service.createCheckout({ body: monthly, clientKey: randomUUID() })).rejects.toMatchObject({ code: 'CHECKOUT_UNAVAILABLE' });
        expect(rejecting).toHaveBeenCalledTimes(1);
        expect(stripe.checkoutCalls.length).toBe(before);
        rejecting.mockRestore();
    });

    it('creates each monthly tier price once and rejects retired tiers', async () => {
        const body = { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-2' };
        await service.createCheckout({ body, clientKey: randomUUID() });
        await service.createCheckout({ body, clientKey: randomUUID() });
        expect(stripe.priceCalls).toHaveLength(1);
        expect(stripe.checkoutCalls[1]!.params).toMatchObject({
            mode: 'subscription',
            line_items: [{ quantity: 1, price: expect.stringMatching(/^price_/u) }],
            subscription_data: { metadata: { patchwork_recipient: 'general-fund' } },
        });
        expect(stripe.checkoutCalls[1]!.params['submit_type']).toBeUndefined();

        await pool.query(`UPDATE supporter_tiers SET active = FALSE WHERE tier_key = 'tier-3'`);
        await expect(service.createCheckout({
            body: { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-3' },
            clientKey: randomUUID(),
        })).rejects.toMatchObject({ code: 'TIER_UNAVAILABLE' });
    });

    it('records a paid gift from Checkout completion and reuses the donor customer', async () => {
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 2_500 };
        const checkout = await service.createCheckout({ body, clientKey: randomUUID(), donorDid });
        await expect(service.getCheckoutStatus(checkout.checkoutId)).resolves.toMatchObject({
            status: 'open',
            paymentStatus: null,
            recipientName: 'Patchwork general fund',
        });
        const session = completeSession(checkout.url, {
            paymentStatus: 'paid', customer: 'cus_1Donor', paymentIntent: 'pi_1Gift', amountTotal: 2_500,
        });
        await deliver('checkout.session.completed', { id: session.id });
        await deliver('checkout.session.completed', { id: session.id });
        // A redelivered completion does not send a second receipt notice.
        expect(await notifications()).toEqual([{
            recipient_did: donorDid, notification_type: 'support_receipt',
            deduplication_key: `support-receipt:${session.id}`,
        }]);

        await expect(service.getCheckoutStatus(checkout.checkoutId)).resolves.toMatchObject({
            status: 'complete',
            paymentStatus: 'succeeded',
        });
        const account = await service.getAccountSupport(donorDid);
        expect(account.manageable).toEqual([{ recipientId: '00000000-0000-4000-8000-000000000001', recipientName: 'Patchwork general fund' }]);
        expect(account.donations).toEqual([expect.objectContaining({
            amountMinor: 2_500, status: 'succeeded', recipientName: 'Patchwork general fund',
        })]);

        await service.createCheckout({ body, clientKey: randomUUID(), donorDid });
        expect(stripe.checkoutCalls[1]!.params).toMatchObject({ customer: 'cus_1Donor' });
        expect(stripe.checkoutCalls[1]!.params['customer_creation']).toBeUndefined();
        await expect(service.createPortalSession(donorDid)).resolves.toEqual({
            url: `https://billing.stripe.test/cus_1Donor?return=${encodeURIComponent(`${origin}/settings`)}`,
        });
    });

    it('keeps delayed payments pending until Stripe confirms or fails them', async () => {
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_000 };
        const confirmed = await service.createCheckout({ body, clientKey: randomUUID() });
        const failed = await service.createCheckout({ body, clientKey: randomUUID() });
        const confirmedSession = completeSession(confirmed.url, { paymentIntent: 'pi_1Later' });
        const failedSession = completeSession(failed.url, { paymentIntent: 'pi_1Failed' });
        await deliver('checkout.session.completed', { id: confirmedSession.id });
        await deliver('checkout.session.completed', { id: failedSession.id });
        expect((await service.getCheckoutStatus(confirmed.checkoutId)).paymentStatus).toBe('pending');

        stripe.setSession({ ...confirmedSession, paymentStatus: 'paid' });
        await deliver('checkout.session.async_payment_succeeded', { id: confirmedSession.id });
        await deliver('checkout.session.async_payment_failed', { id: failedSession.id });
        expect((await service.getCheckoutStatus(confirmed.checkoutId)).paymentStatus).toBe('succeeded');
        expect((await service.getCheckoutStatus(failed.checkoutId)).paymentStatus).toBe('failed');
        await expect(service.createCheckout({ body, clientKey: randomUUID() })).resolves.toBeDefined();
    });

    it('closes expired Checkouts so the same key cannot reopen them', async () => {
        const clientKey = randomUUID();
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_000 };
        const checkout = await service.createCheckout({ body, clientKey });
        const session = stripe.sessionByUrl(checkout.url).session;
        stripe.setSession({ ...session, status: 'expired' });
        await deliver('checkout.session.expired', { id: session.id });
        await expect(service.getCheckoutStatus(checkout.checkoutId)).resolves.toMatchObject({ status: 'expired' });
        await expect(service.createCheckout({ body, clientKey })).rejects.toMatchObject({ code: 'CHECKOUT_CLOSED' });
    });

    it('mirrors monthly subscriptions from Checkout, invoices, and subscription updates', async () => {
        const checkout = await service.createCheckout({
            body: { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-1' },
            clientKey: randomUUID(),
            donorDid,
        });
        const subscription: StripeSubscription = {
            id: 'sub_1Monthly',
            status: 'active',
            livemode: false,
            customer: 'cus_1Monthly',
            cancelAtPeriodEnd: false,
            currentPeriodEnd: 1_796_000_000,
            collectionPaused: false,
            metadata: { patchwork_checkout_id: checkout.checkoutId },
        };
        // Stripe may deliver the subscription event before checkout completion.
        stripe.setSubscription(subscription);
        await deliver('customer.subscription.created', { id: subscription.id });
        const session = completeSession(checkout.url, { subscription: subscription.id, customer: 'cus_1Monthly' });
        await deliver('checkout.session.completed', { id: session.id });

        let account = await service.getAccountSupport(donorDid);
        expect(account.subscriptions).toEqual([expect.objectContaining({
            tierKey: 'tier-1',
            amountMinor: 500,
            status: 'active',
            cancelAtPeriodEnd: false,
            currentPeriodEnd: new Date(1_796_000_000_000).toISOString(),
        })]);
        expect(account.manageable).toEqual([{ recipientId: '00000000-0000-4000-8000-000000000001', recipientName: 'Patchwork general fund' }]);

        stripe.setSubscription({ ...subscription, status: 'past_due' });
        await deliver('invoice.payment_failed', {
            id: 'in_1Failed',
            parent: { type: 'subscription_details', subscription_details: { subscription: subscription.id } },
        });
        expect((await service.getAccountSupport(donorDid)).subscriptions[0]?.status).toBe('past_due');
        expect((await notifications()).map(row => row.notification_type)).toEqual(['support_payment_failed']);

        stripe.setSubscription({
            ...subscription, cancelAtPeriodEnd: true, collectionPaused: true,
        });
        await deliver('invoice.paid', { id: 'in_1Legacy', subscription: subscription.id });
        account = await service.getAccountSupport(donorDid);
        expect(account.subscriptions[0]).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
        const paused = await pool.query('SELECT paused_reason FROM supporter_subscriptions');
        expect(paused.rows).toEqual([{ paused_reason: 'donor' }]);
        expect((await notifications()).map(row => row.deduplication_key).sort()).toEqual([
            'support-ending:sub_1Monthly:2026-11-30T00:53:20.000Z',
            'support-failed:in_1Failed',
            'support-receipt:in_1Legacy',
        ]);
        expect(new Set((await notifications()).map(row => row.recipient_did))).toEqual(new Set([donorDid]));

        // A write fetched before the stored state never replaces it.
        await pool.query(`UPDATE supporter_subscriptions SET stripe_state_at = '2999-01-01'`);
        stripe.setSubscription({ ...subscription, status: 'canceled' });
        await deliver('customer.subscription.deleted', { id: subscription.id });
        expect((await service.getAccountSupport(donorDid)).subscriptions[0]?.status).toBe('active');
    });

    it('announces an abrupt end once, and never notifies guests', async () => {
        const signedIn = await service.createCheckout({
            body: { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-2' },
            clientKey: randomUUID(),
            donorDid,
        });
        const guest = await service.createCheckout({
            body: { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-2' },
            clientKey: randomUUID(),
        });
        const base = {
            status: 'active' as const, livemode: false, cancelAtPeriodEnd: false,
            currentPeriodEnd: 1_796_000_000, collectionPaused: false,
        };
        for (const [checkout, id] of [[signedIn, 'sub_1Abrupt'], [guest, 'sub_1Guest']] as const) {
            stripe.setSubscription({ ...base, id, customer: `cus_1${id.slice(5)}`, metadata: { patchwork_checkout_id: checkout.checkoutId } });
            await deliver('customer.subscription.created', { id });
            await deliver('invoice.paid', { id: `in_1${id.slice(5)}`, subscription: id });
            stripe.setSubscription({ ...base, id, status: 'canceled', customer: `cus_1${id.slice(5)}`, metadata: { patchwork_checkout_id: checkout.checkoutId } });
            await deliver('customer.subscription.deleted', { id });
            await deliver('customer.subscription.deleted', { id });
        }
        expect((await notifications()).map(row => row.deduplication_key)).toEqual([
            'support-receipt:in_1Abrupt',
            'support-ending:sub_1Abrupt:ended',
        ]);
    });

    it('ends a monthly gift whose Checkout completes after the donor deactivated', async () => {
        const checkout = await service.createCheckout({
            body: { recipient: 'general-fund', mode: 'monthly', tierKey: 'tier-1' },
            clientKey: randomUUID(),
            donorDid,
        });
        // Deactivation removes the DID and flags the donor's checkouts.
        await pool.query(
            `UPDATE payment_checkout_sessions SET donor_did = NULL, donor_deactivated = TRUE WHERE donor_did = $1`,
            [donorDid],
        );
        stripe.setSubscription({
            id: 'sub_1AfterDeactivation', status: 'active', livemode: false, customer: 'cus_1After',
            cancelAtPeriodEnd: false, currentPeriodEnd: 1_796_000_000, collectionPaused: false,
            metadata: { patchwork_checkout_id: checkout.checkoutId },
        });
        await deliver('customer.subscription.created', { id: 'sub_1AfterDeactivation' });
        const queued = await pool.query(
            `SELECT c.kind, c.status, s.donor_did FROM payment_commands c
               JOIN supporter_subscriptions s ON s.subscription_id = c.subscription_id
              WHERE s.stripe_subscription_id = 'sub_1AfterDeactivation'`,
        );
        expect(queued.rows).toEqual([{ kind: 'cancel-at-period-end', status: 'pending', donor_did: null }]);
        await expect(pool.query('SELECT COUNT(*)::int AS count FROM donor_accounts')).resolves.toMatchObject({ rows: [{ count: 0 }] });
        expect(await notifications()).toEqual([]);
    });

    it('applies full refunds and dispute outcomes to one-time gifts', async () => {
        const checkout = await service.createCheckout({
            body: { recipient: 'general-fund', mode: 'one-time', amountMinor: 5_000 },
            clientKey: randomUUID(),
        });
        const session = completeSession(checkout.url, { paymentStatus: 'paid', paymentIntent: 'pi_1Disputed' });
        await deliver('checkout.session.completed', { id: session.id });

        stripe.setDispute({ id: 'dp_1Open', paymentIntent: 'pi_1Disputed', status: 'needs_response' });
        await deliver('charge.dispute.created', { id: 'dp_1Open' });
        expect((await service.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('disputed');
        stripe.setDispute({ id: 'dp_1Open', paymentIntent: 'pi_1Disputed', status: 'won' });
        await deliver('charge.dispute.closed', { id: 'dp_1Open' });
        expect((await service.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('succeeded');

        stripe.setCharge({ id: 'ch_1Partial', paymentIntent: 'pi_1Disputed', refunded: false });
        await deliver('charge.refunded', { id: 'ch_1Partial' });
        expect((await service.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('succeeded');
        stripe.setCharge({ id: 'ch_1Partial', paymentIntent: 'pi_1Disputed', refunded: true });
        await deliver('charge.refunded', { id: 'ch_1Partial' });
        expect((await service.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('refunded');
    });

    it('applies a dispute or refund that Stripe sends before the Checkout completion', async () => {
        // A charge can be disputed or refunded within seconds, and those events
        // are older than checkout.session.completed, so they are applied first.
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 1_500 };
        const disputed = await service.createCheckout({ body, clientKey: randomUUID(), donorDid });
        const refunded = await service.createCheckout({ body, clientKey: randomUUID() });
        stripe.setDispute({ id: 'dp_1Early', paymentIntent: 'pi_1EarlyDispute', status: 'needs_response' });
        await deliver('charge.dispute.created', { id: 'dp_1Early' });
        stripe.setCharge({ id: 'ch_1EarlyRefund', paymentIntent: 'pi_1EarlyRefund', refunded: true });
        await deliver('charge.refunded', { id: 'ch_1EarlyRefund' });

        const disputedSession = completeSession(disputed.url, { paymentStatus: 'paid', paymentIntent: 'pi_1EarlyDispute' });
        await deliver('checkout.session.completed', { id: disputedSession.id });
        const refundedSession = completeSession(refunded.url, { paymentStatus: 'paid', paymentIntent: 'pi_1EarlyRefund' });
        await deliver('checkout.session.completed', { id: refundedSession.id });
        expect((await service.getCheckoutStatus(disputed.checkoutId)).paymentStatus).toBe('disputed');
        expect((await service.getCheckoutStatus(refunded.checkoutId)).paymentStatus).toBe('refunded');
        // A gift that was disputed before it was recorded gets no receipt.
        expect(await notifications()).toEqual([]);

        // A dispute that later closes in the organization's favour restores the gift.
        stripe.setDispute({ id: 'dp_1Early', paymentIntent: 'pi_1EarlyDispute', status: 'won' });
        await deliver('charge.dispute.closed', { id: 'dp_1Early' });
        expect((await service.getCheckoutStatus(disputed.checkoutId)).paymentStatus).toBe('succeeded');
    });

    it('ignores Checkouts, subscriptions, and connected-account events that are not Patchwork general-fund gifts', async () => {
        const retrieveCheckoutSession = vi.spyOn(stripe, 'retrieveCheckoutSession');
        stripe.setSession({
            id: 'cs_test_1Foreign', url: null, status: 'complete', paymentStatus: 'paid',
            mode: 'payment', livemode: false, paymentIntent: 'pi_1Foreign',
        });
        await deliver('checkout.session.completed', { id: 'cs_test_1Foreign' });
        stripe.setSubscription({
            id: 'sub_1Foreign', status: 'active', livemode: false, cancelAtPeriodEnd: false,
            collectionPaused: false, metadata: {},
        });
        await deliver('customer.subscription.updated', { id: 'sub_1Foreign' });
        await deliver('checkout.session.completed', { id: 'cs_test_1Connected' }, 'acct_1Org');
        expect(retrieveCheckoutSession).toHaveBeenCalledTimes(1);
        expect((await pool.query('SELECT 1 FROM donations')).rowCount).toBe(0);
        expect((await pool.query('SELECT 1 FROM supporter_subscriptions')).rowCount).toBe(0);
    });

    it('requires history before opening the Customer Portal', async () => {
        await expect(service.createPortalSession(donorDid)).rejects.toMatchObject({ code: 'NO_SUPPORT_ACCOUNT' });
        await expect(service.getCheckoutStatus('not-a-uuid')).rejects.toMatchObject({ code: 'CHECKOUT_NOT_FOUND' });
        await expect(service.getCheckoutStatus(randomUUID())).rejects.toMatchObject({ code: 'CHECKOUT_NOT_FOUND' });
        await expect(service.getAccountSupport(donorDid)).resolves.toEqual({
            donations: [], subscriptions: [], manageable: [], isSupporter: false,
            recognition: { badgeVisible: false, listedPublicly: false, shareNameWithRecipient: false },
        });
    });
});
