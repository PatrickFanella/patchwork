import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrganizationPaymentsService } from './organization-payments-service.js';
import { PaymentWebhookService } from './payment-webhook-service.js';
import type { StripeEvent, StripeSubscription } from './stripe-gateway.js';
import { SupportService } from './support-service.js';
import { FakeStripe } from './testing/fake-stripe.js';
import { applyApiMigrations } from './testing/migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'https://patchwork.example.test';
const owner = 'did:plc:orgowner';
const admin = 'did:plc:orgadmin';
const steward = 'did:plc:orgsteward';
const donor = 'did:plc:orgdonor';


describe('organization payments', () => {
    const schema = `orgpay_${randomUUID().replaceAll('-', '')}`;
    const adminPool = new Pool({ connectionString: databaseUrl });
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    let stripe: FakeStripe;
    let support: SupportService;
    let organizations: OrganizationPaymentsService;
    let webhooks: PaymentWebhookService;
    let eventSequence = 0;

    const createOrganization = async (originKind: 'visitor-created' | 'synthetic' = 'visitor-created') => {
        const organizationId = randomUUID();
        await pool.query(
            `INSERT INTO organizations (
                organization_id, slug, name, description, origin, non_endorsement_label,
                created_by_did, created_at, updated_at
            ) VALUES ($1, $2, 'Westside Pantry', 'Food pantry', $3, 'Listed for reference.', $4, NOW(), NOW())`,
            [organizationId, `pantry-${organizationId.slice(0, 8)}`, originKind, owner],
        );
        for (const [member, role] of [[owner, 'owner'], [admin, 'admin'], [steward, 'steward']] as const) {
            await pool.query(
                `INSERT INTO organization_memberships (
                    organization_id, member_did, role, status, invited_by_did, joined_at, updated_at
                ) VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())`,
                [organizationId, member, role, owner],
            );
        }
        return organizationId;
    };

    const verify = async (organizationId: string, expiresAt = '2999-01-01T00:00:00Z') => {
        const applicationId = randomUUID();
        await pool.query(
            `INSERT INTO verification_applications (
                application_id, applicant_did, subject_type, organization_id, subject_ref,
                status, submitted_at, decided_at, expires_at, updated_at
            ) VALUES ($1, $2, 'organization', $3::uuid, $5, 'approved', NOW(), NOW(), $4, NOW())`,
            [applicationId, owner, organizationId, expiresAt, organizationId],
        );
        return applicationId;
    };

    /** Verified organization with completed Stripe onboarding. */
    const onboardedOrganization = async () => {
        const organizationId = await createOrganization();
        await verify(organizationId);
        await organizations.startOnboarding(owner, organizationId);
        const accountId = (await pool.query<{ stripe_account_id: string }>(
            'SELECT stripe_account_id FROM payment_recipients WHERE organization_id = $1',
            [organizationId],
        )).rows[0]!.stripe_account_id;
        stripe.accounts.set(accountId, {
            id: accountId, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
        });
        await deliver('account.updated', { id: accountId }, accountId);
        return { organizationId, accountId };
    };

    const deliver = async (type: string, object: Record<string, unknown>, account?: string) => {
        eventSequence += 1;
        const event: StripeEvent = {
            id: `evt_1Org${eventSequence}`,
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
            `TRUNCATE payment_webhook_events, payment_charge_states, donations, supporter_subscriptions, donor_accounts,
                      supporter_tier_prices, payment_checkout_sessions, payment_audit_events CASCADE`,
        );
        await pool.query(`DELETE FROM payment_recipients WHERE kind = 'organization'`);
        await pool.query('DELETE FROM organizations');
        stripe = new FakeStripe();
        const mode = { paymentsMode: 'test' as const, publicWebOrigin: origin };
        support = new SupportService(pool, stripe, { ...mode, receipt: { mode: 'non-deductible' } });
        organizations = new OrganizationPaymentsService(pool, stripe, mode);
        webhooks = new PaymentWebhookService(pool, stripe, { processors: support.processors() });
    });

    it('lets only owners and admins of verified, non-synthetic organizations start onboarding', async () => {
        const organizationId = await createOrganization();
        await expect(organizations.startOnboarding(steward, organizationId))
            .rejects.toMatchObject({ code: 'ORGANIZATION_PAYMENTS_FORBIDDEN' });
        await expect(organizations.startOnboarding(donor, organizationId))
            .rejects.toMatchObject({ code: 'ORGANIZATION_PAYMENTS_FORBIDDEN' });
        await expect(organizations.startOnboarding(owner, randomUUID()))
            .rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
        await expect(organizations.startOnboarding(owner, organizationId))
            .rejects.toMatchObject({ code: 'ORGANIZATION_NOT_VERIFIED' });

        const synthetic = await createOrganization('synthetic');
        await verify(synthetic);
        await expect(organizations.startOnboarding(owner, synthetic))
            .rejects.toMatchObject({ code: 'ORGANIZATION_PAYMENTS_UNAVAILABLE' });
        const off = new OrganizationPaymentsService(pool, stripe, { paymentsMode: 'off', publicWebOrigin: origin });
        await verify(organizationId);
        await expect(off.startOnboarding(owner, organizationId))
            .rejects.toMatchObject({ code: 'ORGANIZATION_PAYMENTS_UNAVAILABLE' });
        expect(stripe.accountCalls).toEqual([]);
    });

    it('creates one connected account and returns fresh onboarding links', async () => {
        const organizationId = await createOrganization();
        await verify(organizationId);
        await expect(organizations.getStatus(owner, organizationId)).resolves.toMatchObject({
            status: 'not-started', verified: true, eligible: false, dashboardUrl: null,
        });
        const first = await organizations.startOnboarding(owner, organizationId);
        const second = await organizations.startOnboarding(admin, organizationId);
        expect(first.url).toMatch(/^https:\/\/connect\.stripe\.test\/setup\/acct_/u);
        expect(second).toEqual(first);
        expect(stripe.accountCalls).toHaveLength(1);
        expect(stripe.accountCalls[0]!.businessName).toBe('Westside Pantry');
        expect(stripe.linkCalls[0]).toMatchObject({
            refreshUrl: `${origin}/organizations?payments=${organizationId}&onboarding=refresh`,
            returnUrl: `${origin}/organizations?payments=${organizationId}&onboarding=return`,
        });
        await expect(organizations.getStatus(owner, organizationId)).resolves.toMatchObject({
            status: 'onboarding', chargesEnabled: false, eligible: false,
            dashboardUrl: 'https://dashboard.stripe.com/',
        });
        const audit = await pool.query('SELECT action, actor_did FROM payment_audit_events ORDER BY audit_id');
        expect(audit.rows.map(row => row.action)).toEqual([
            'recipient-created', 'onboarding-link-created', 'onboarding-link-created',
        ]);
        await expect(organizations.getStatus(steward, organizationId))
            .rejects.toMatchObject({ code: 'ORGANIZATION_PAYMENTS_FORBIDDEN' });
    });

    it('activates the recipient when Stripe enables charges, from the return visit or account.updated', async () => {
        const organizationId = await createOrganization();
        await verify(organizationId);
        await organizations.startOnboarding(owner, organizationId);
        const accountId = stripe.accountCalls.length ? [...stripe.accounts.keys()][0]! : '';
        stripe.accounts.set(accountId, { id: accountId, chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true });
        await expect(organizations.getStatus(owner, organizationId)).resolves.toMatchObject({
            status: 'active', chargesEnabled: true, payoutsEnabled: false, eligible: true,
        });
        expect(await support.listEligibleOrganizations([organizationId, randomUUID(), 'bad'])).toEqual([organizationId]);

        stripe.accounts.set(accountId, { id: accountId, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: true });
        await deliver('account.updated', { id: accountId }, accountId);
        await expect(organizations.getStatus(owner, organizationId)).resolves.toMatchObject({
            status: 'active', chargesEnabled: false, eligible: false,
        });
        expect(await support.listEligibleOrganizations([organizationId])).toEqual([]);
    });

    it('charges gifts directly on the organization account and records them from Connect events only', async () => {
        const { organizationId, accountId } = await onboardedOrganization();
        const checkout = await support.createCheckout({
            body: { recipient: { organizationId }, mode: 'one-time', amountMinor: 2_000 },
            clientKey: randomUUID(),
            donorDid: donor,
        });
        expect(stripe.checkoutCalls[0]).toMatchObject({
            accountId,
            params: {
                metadata: { patchwork_recipient: `organization:${organizationId}` },
                line_items: [{ price_data: { product_data: { name: 'Gift to Westside Pantry' } } }],
            },
        });
        expect(stripe.checkoutCalls[0]!.params['application_fee_amount']).toBeUndefined();
        const { session } = stripe.sessionByUrl(checkout.url);
        const completed = { ...session, status: 'complete' as const, paymentStatus: 'paid' as const, customer: 'cus_1OrgDonor', paymentIntent: 'pi_1OrgGift' };
        stripe.setSession(completed, { accountId });

        // A platform delivery naming the same session does not touch the organization's gift.
        stripe.setSession(completed);
        await deliver('checkout.session.completed', { id: session.id });
        expect((await pool.query('SELECT 1 FROM donations')).rowCount).toBe(0);

        await deliver('checkout.session.completed', { id: session.id }, accountId);
        await expect(support.getCheckoutStatus(checkout.checkoutId)).resolves.toMatchObject({
            status: 'complete', paymentStatus: 'succeeded', recipientName: 'Westside Pantry',
        });
        const account = await support.getAccountSupport(donor);
        expect(account.manageable).toEqual([expect.objectContaining({ recipientName: 'Westside Pantry' })]);
        const portal = await support.createPortalSession(donor, account.manageable[0]!.recipientId);
        expect(portal.url).toContain(`billing.stripe.test/${accountId}/cus_1OrgDonor`);
        await expect(support.createPortalSession(donor)).rejects.toMatchObject({ code: 'NO_SUPPORT_ACCOUNT' });

        // A refund delivered from another organization's account is ignored.
        const other = await onboardedOrganization();
        stripe.setCharge({ id: 'ch_1Org', paymentIntent: 'pi_1OrgGift', refunded: true }, { accountId: other.accountId });
        await deliver('charge.refunded', { id: 'ch_1Org' }, other.accountId);
        expect((await support.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('succeeded');
        stripe.setCharge({ id: 'ch_1Org', paymentIntent: 'pi_1OrgGift', refunded: true }, { accountId });
        await deliver('charge.refunded', { id: 'ch_1Org' }, accountId);
        expect((await support.getCheckoutStatus(checkout.checkoutId)).paymentStatus).toBe('refunded');
    });

    it('creates monthly prices on the organization account and reports totals to its admins', async () => {
        const { organizationId, accountId } = await onboardedOrganization();
        const checkout = await support.createCheckout({
            body: { recipient: { organizationId }, mode: 'monthly', tierKey: 'tier-2' },
            clientKey: randomUUID(),
            donorDid: donor,
        });
        expect(stripe.priceCalls).toEqual([expect.objectContaining({ accountId })]);
        const subscription: StripeSubscription = {
            id: 'sub_1OrgMonthly', status: 'active', livemode: false, customer: 'cus_1OrgMonthly',
            cancelAtPeriodEnd: false, currentPeriodEnd: 1_796_000_000, collectionPaused: false,
            metadata: { patchwork_checkout_id: checkout.checkoutId },
        };
        stripe.setSubscription(subscription, { accountId });
        await deliver('customer.subscription.created', { id: subscription.id }, accountId);

        const oneTime = await support.createCheckout({
            body: { recipient: { organizationId }, mode: 'one-time', amountMinor: 3_000 },
            clientKey: randomUUID(),
        });
        const { session } = stripe.sessionByUrl(oneTime.url);
        stripe.setSession({ ...session, status: 'complete', paymentStatus: 'paid', paymentIntent: 'pi_1Totals' }, { accountId });
        await deliver('checkout.session.completed', { id: session.id }, accountId);

        const status = await organizations.getStatus(admin, organizationId);
        expect(status).toMatchObject({ activeMonthlySupporters: 1, monthlyRecurringMinor: 1_500 });
        expect(status.months).toEqual([
            { month: new Date().toISOString().slice(0, 7), giftCount: 1, giftTotalMinor: 3_000 },
        ]);
        expect(JSON.stringify(status)).not.toContain(donor);
    });

    it('refuses new gifts when verification lapses, is revoked, or the recipient is suspended', async () => {
        const body = (organizationId: string) => ({
            body: { recipient: { organizationId }, mode: 'one-time', amountMinor: 1_000 },
            clientKey: randomUUID(),
        });
        const expired = await onboardedOrganization();
        await pool.query(
            `UPDATE verification_applications SET expires_at = NOW() - INTERVAL '1 minute' WHERE organization_id = $1`,
            [expired.organizationId],
        );
        await expect(support.createCheckout(body(expired.organizationId)))
            .rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });

        const revoked = await onboardedOrganization();
        await pool.query(`UPDATE verification_applications SET status = 'revoked' WHERE organization_id = $1`, [revoked.organizationId]);
        await expect(support.createCheckout(body(revoked.organizationId)))
            .rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });

        const suspended = await onboardedOrganization();
        await pool.query(
            `UPDATE payment_recipients SET status = 'suspended', suspension_reason = 'Fraud report under review',
                    suspended_by_did = 'did:plc:moderator'
              WHERE organization_id = $1`,
            [suspended.organizationId],
        );
        await expect(support.createCheckout(body(suspended.organizationId)))
            .rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
        await expect(organizations.startOnboarding(owner, suspended.organizationId))
            .rejects.toMatchObject({ code: 'PAYMENT_RECIPIENT_SUSPENDED' });
        await expect(support.createCheckout(body(randomUUID())))
            .rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
        expect(await support.listEligibleOrganizations([
            expired.organizationId, revoked.organizationId, suspended.organizationId,
        ])).toEqual([]);
    });

    it('pauses monthly gifts to ineligible organizations once, and retries Stripe failures', async () => {
        const { organizationId, accountId } = await onboardedOrganization();
        const checkout = await support.createCheckout({
            body: { recipient: { organizationId }, mode: 'monthly', tierKey: 'tier-1' },
            clientKey: randomUUID(),
        });
        const subscription: StripeSubscription = {
            id: 'sub_1Pause', status: 'active', livemode: false, cancelAtPeriodEnd: false,
            collectionPaused: false, metadata: { patchwork_checkout_id: checkout.checkoutId },
        };
        stripe.setSubscription(subscription, { accountId });
        await deliver('customer.subscription.created', { id: subscription.id }, accountId);
        expect(await organizations.runEligibilitySweep()).toEqual({ paused: 0, failed: 0 });

        await pool.query(`UPDATE verification_applications SET status = 'revoked' WHERE organization_id = $1`, [organizationId]);
        stripe.failPauses = true;
        expect(await organizations.runEligibilitySweep()).toEqual({ paused: 0, failed: 1 });
        stripe.failPauses = false;
        expect(await organizations.runEligibilitySweep()).toEqual({ paused: 1, failed: 0 });
        expect(stripe.pauseCalls.at(-1)).toMatchObject({ subscriptionId: 'sub_1Pause', accountId });
        expect(await organizations.runEligibilitySweep()).toEqual({ paused: 0, failed: 0 });

        // The pause round-trips through Stripe without being mistaken for a donor pause.
        await deliver('customer.subscription.updated', { id: subscription.id }, accountId);
        expect((await pool.query('SELECT paused_reason FROM supporter_subscriptions')).rows)
            .toEqual([{ paused_reason: 'recipient-ineligible' }]);
        await expect(organizations.getStatus(owner, organizationId)).resolves.toMatchObject({
            activeMonthlySupporters: 0, eligible: false,
        });
    });

    it('keeps payment history and pauses gifts when the organization is deleted', async () => {
        const { organizationId, accountId } = await onboardedOrganization();
        const checkout = await support.createCheckout({
            body: { recipient: { organizationId }, mode: 'monthly', tierKey: 'tier-1' },
            clientKey: randomUUID(),
            donorDid: donor,
        });
        stripe.setSubscription({
            id: 'sub_1Deleted', status: 'active', livemode: false, customer: 'cus_1Deleted',
            cancelAtPeriodEnd: false, collectionPaused: false,
            metadata: { patchwork_checkout_id: checkout.checkoutId },
        }, { accountId });
        await deliver('customer.subscription.created', { id: 'sub_1Deleted' }, accountId);

        await pool.query('DELETE FROM organizations WHERE organization_id = $1', [organizationId]);
        const recipient = await pool.query(
            'SELECT status, organization_id, display_name FROM payment_recipients WHERE stripe_account_id = $1',
            [accountId],
        );
        expect(recipient.rows).toEqual([{ status: 'closed', organization_id: null, display_name: 'Westside Pantry' }]);
        expect(await organizations.runEligibilitySweep()).toEqual({ paused: 1, failed: 0 });
        const account = await support.getAccountSupport(donor);
        expect(account.subscriptions).toEqual([expect.objectContaining({ recipientName: 'Westside Pantry' })]);
        // Donors can still reach the Customer Portal to cancel.
        await expect(support.createPortalSession(donor, account.manageable[0]!.recipientId))
            .resolves.toMatchObject({ url: expect.stringContaining(accountId) });
    });
});
