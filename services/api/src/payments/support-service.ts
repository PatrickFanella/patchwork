import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { notifyDonor } from './payment-notifications.js';
import type { PaymentEventProcessor } from './payment-webhook-service.js';
import {
    activeSupporterSubscriptionSql,
    eligibleOrganizationRecipientSql,
} from './recipient-eligibility.js';
import {
    StripeApiError,
    stripeIdOf,
    stripeIdPatterns,
    type StripeAccountScope,
    type StripeCheckoutSession,
    type StripeEvent,
    type StripeFormValue,
    type StripeGateway,
    type StripeSubscription,
} from './stripe-gateway.js';

export const GENERAL_FUND_RECIPIENT_ID = '00000000-0000-4000-8000-000000000001';
export const ONE_TIME_MIN_MINOR = 100;
export const ONE_TIME_MAX_MINOR = 1_000_000;
export const SUGGESTED_ONE_TIME_MINOR = [1_000, 2_500, 5_000] as const;

export type SupportServiceErrorCode =
    | 'PAYMENTS_DISABLED'
    | 'INVALID_SUPPORT_REQUEST'
    | 'IDEMPOTENCY_KEY_INVALID'
    | 'IDEMPOTENCY_KEY_REUSED'
    | 'RECIPIENT_UNAVAILABLE'
    | 'TIER_UNAVAILABLE'
    | 'CHECKOUT_CLOSED'
    | 'CHECKOUT_NOT_FOUND'
    | 'CHECKOUT_UNAVAILABLE'
    | 'NO_SUPPORT_ACCOUNT';

export class SupportServiceError extends Error {
    constructor(readonly code: SupportServiceErrorCode) {
        super(code);
        this.name = 'SupportServiceError';
    }
}

export interface SupportServiceOptions {
    paymentsMode: 'off' | 'test' | 'live';
    publicWebOrigin: string;
    receipt: {
        mode: 'non-deductible' | 'charitable';
        legalName?: string;
        ein?: string;
    };
}

export interface SupportTier {
    key: string;
    version: number;
    nameKey: string;
    descriptionKey: string;
    amountMinor: number;
    currency: 'usd';
}

export interface SupportOptions {
    paymentsEnabled: boolean;
    mode: 'off' | 'test' | 'live';
    currency: 'usd';
    receipt: SupportServiceOptions['receipt'];
    oneTime: { minMinor: number; maxMinor: number; suggestedMinor: number[] };
    tiers: SupportTier[];
}

export interface CheckoutStatus {
    checkoutId: string;
    mode: 'one-time' | 'monthly';
    amountMinor: number;
    currency: 'usd';
    recipientName: string;
    /** creating/open until Stripe confirms; complete once the donor paid or subscribed. */
    status: 'creating' | 'open' | 'complete' | 'expired' | 'failed';
    paymentStatus: string | null;
}

export interface AccountSupport {
    donations: Array<{
        donationId: string;
        recipientName: string;
        amountMinor: number;
        currency: 'usd';
        status: string;
        createdAt: string;
    }>;
    subscriptions: Array<{
        subscriptionId: string;
        recipientName: string;
        tierKey: string;
        nameKey: string;
        amountMinor: number;
        currency: 'usd';
        status: string;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    }>;
    /** Recipients whose Stripe Customer Portal this donor can open. */
    manageable: Array<{ recipientId: string; recipientName: string }>;
    /** True while the donor has an active, unpaused monthly gift. */
    isSupporter: boolean;
    recognition: SupporterRecognition;
}

export interface SupporterRecognition {
    badgeVisible: boolean;
    listedPublicly: boolean;
    shareNameWithRecipient: boolean;
}

const recognitionSchema = z
    .object({
        badgeVisible: z.boolean(),
        listedPublicly: z.boolean(),
        shareNameWithRecipient: z.boolean(),
    })
    .strict();

const didPattern = /^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$/u;



interface ResolvedRecipient {
    recipientId: string;
    displayName: string;
    /** Undefined for the general fund, which charges on the platform account. */
    stripeAccountId?: string;
    organizationId?: string;
}

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const uuidPatternSource =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const checkoutRequestSchema = z
    .object({
        recipient: z.union([
            z.literal('general-fund'),
            z.object({ organizationId: z.string().regex(uuidPatternSource) }).strict(),
        ]),
        mode: z.enum(['one-time', 'monthly']),
        amountMinor: z
            .number()
            .int()
            .min(ONE_TIME_MIN_MINOR)
            .max(ONE_TIME_MAX_MINOR)
            .optional(),
        tierKey: z
            .string()
            .max(60)
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u)
            .optional(),
    })
    .strict()
    .refine(value =>
        value.mode === 'one-time' ?
            value.amountMinor !== undefined && value.tierKey === undefined
        :   value.tierKey !== undefined && value.amountMinor === undefined,
    );


const checkoutEventTypes = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
] as const;
const subscriptionEventTypes = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
] as const;
const invoiceEventTypes = ['invoice.paid', 'invoice.payment_failed'] as const;
const disputeEventTypes = [
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
] as const;
const subscriptionStatuses = new Set([
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused',
]);

const processorError = (code: string): Error =>
    Object.assign(new Error(code), { code });

const iso = (value: Date | string | null): string | null =>
    value === null ? null : new Date(value).toISOString();

const inTransaction = async <T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
};

interface EventRecipient {
    recipientId: string;
    scope: StripeAccountScope;
}

interface CheckoutRow {
    checkout_id: string;
    request_hash: string;
    recipient_id: string;
    mode: 'one-time' | 'monthly';
    amount_minor: number;
    tier_version_id: string | null;
    donor_did: string | null;
    checkout_url: string | null;
    status: CheckoutStatus['status'];
    livemode: boolean;
}

export class SupportService {
    constructor(
        private readonly pool: Pool,
        private readonly gateway: StripeGateway,
        private readonly options: SupportServiceOptions,
    ) {}

    private get livemode(): boolean {
        return this.options.paymentsMode === 'live';
    }

    async listTiers(): Promise<SupportTier[]> {
        const result = await this.pool.query<{
            tier_key: string;
            version: number;
            name_key: string;
            description_key: string;
            amount_minor: number;
        }>(
            `SELECT t.tier_key, v.version, v.name_key, v.description_key, v.amount_minor
               FROM supporter_tiers t
               JOIN supporter_tier_versions v ON v.tier_key = t.tier_key AND v.current
              WHERE t.active
              ORDER BY t.sort_order, t.tier_key`,
        );
        return result.rows.map(row => ({
            key: row.tier_key,
            version: row.version,
            nameKey: row.name_key,
            descriptionKey: row.description_key,
            amountMinor: row.amount_minor,
            currency: 'usd',
        }));
    }

    async getOptions(): Promise<SupportOptions> {
        return {
            paymentsEnabled: this.options.paymentsMode !== 'off',
            mode: this.options.paymentsMode,
            currency: 'usd',
            receipt: this.options.receipt,
            oneTime: {
                minMinor: ONE_TIME_MIN_MINOR,
                maxMinor: ONE_TIME_MAX_MINOR,
                suggestedMinor: [...SUGGESTED_ONE_TIME_MINOR],
            },
            tiers: await this.listTiers(),
        };
    }

    async createCheckout(
        input: { body: unknown; clientKey: string; donorDid?: string },
        now = new Date(),
    ): Promise<{ checkoutId: string; url: string }> {
        if (this.options.paymentsMode === 'off') {
            throw new SupportServiceError('PAYMENTS_DISABLED');
        }
        if (!uuidPattern.test(input.clientKey)) {
            throw new SupportServiceError('IDEMPOTENCY_KEY_INVALID');
        }
        const parsed = checkoutRequestSchema.safeParse(input.body);
        if (!parsed.success) {
            throw new SupportServiceError('INVALID_SUPPORT_REQUEST');
        }
        const request = parsed.data;
        const requestHash = createHash('sha256')
            .update(JSON.stringify([
                input.donorDid ?? null,
                typeof request.recipient === 'string' ?
                    request.recipient
                :   `organization:${request.recipient.organizationId}`,
                request.mode,
                request.amountMinor ?? null,
                request.tierKey ?? null,
            ]))
            .digest('hex');

        const prepared = await inTransaction(this.pool, async client => {
            const existing = await client.query<CheckoutRow>(
                `SELECT checkout_id, request_hash, recipient_id, mode, amount_minor,
                        tier_version_id, donor_did, checkout_url, status, livemode
                   FROM payment_checkout_sessions
                  WHERE client_key = $1
                  FOR UPDATE`,
                [input.clientKey],
            );
            const row = existing.rows[0];
            if (row) {
                if (row.request_hash !== requestHash) {
                    throw new SupportServiceError('IDEMPOTENCY_KEY_REUSED');
                }
                if (row.status === 'open' && row.checkout_url) {
                    return { row, replay: true as const };
                }
                if (row.status === 'complete' || row.status === 'expired') {
                    throw new SupportServiceError('CHECKOUT_CLOSED');
                }
                return { row, replay: false as const };
            }
            const recipient = await this.resolveRecipient(client, request.recipient);
            if (!recipient) throw new SupportServiceError('RECIPIENT_UNAVAILABLE');
            let amountMinor = request.amountMinor;
            let tierVersionId: string | null = null;
            if (request.mode === 'monthly') {
                const tier = await client.query<{
                    tier_version_id: string;
                    amount_minor: number;
                }>(
                    `SELECT v.tier_version_id, v.amount_minor
                       FROM supporter_tiers t
                       JOIN supporter_tier_versions v
                         ON v.tier_key = t.tier_key AND v.current
                      WHERE t.tier_key = $1 AND t.active`,
                    [request.tierKey],
                );
                if (!tier.rows[0]) throw new SupportServiceError('TIER_UNAVAILABLE');
                amountMinor = tier.rows[0].amount_minor;
                tierVersionId = tier.rows[0].tier_version_id;
            }
            const inserted = await client.query<CheckoutRow>(
                `INSERT INTO payment_checkout_sessions (
                    checkout_id, client_key, request_hash, recipient_id, mode,
                    amount_minor, currency, tier_version_id, donor_did, status,
                    livemode, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, 'usd', $7, $8, 'creating', $9, $10, $10)
                RETURNING checkout_id, request_hash, recipient_id, mode, amount_minor,
                          tier_version_id, donor_did, checkout_url, status, livemode`,
                [
                    randomUUID(), input.clientKey, requestHash,
                    recipient.recipientId, request.mode, amountMinor,
                    tierVersionId, input.donorDid ?? null, this.livemode, now,
                ],
            );
            return { row: inserted.rows[0]!, replay: false as const };
        });
        if (prepared.replay) {
            return { checkoutId: prepared.row.checkout_id, url: prepared.row.checkout_url! };
        }

        const row = prepared.row;
        let session: StripeCheckoutSession;
        try {
            // Recheck on every attempt: eligibility can lapse between retries.
            const recipient = await this.recipientById(row.recipient_id, true);
            if (!recipient) throw new SupportServiceError('RECIPIENT_UNAVAILABLE');
            const params = await this.checkoutParams(row, recipient);
            session = await this.gateway.createCheckoutSession(
                params,
                `patchwork-checkout-${row.checkout_id}`,
                { accountId: recipient.stripeAccountId },
            );
            if (!session.url || session.livemode !== this.livemode || session.status !== 'open') {
                throw new StripeApiError('INVALID_RESPONSE', false);
            }
        } catch (error) {
            await this.pool.query(
                `UPDATE payment_checkout_sessions SET status = 'failed', updated_at = $2
                  WHERE checkout_id = $1 AND status IN ('creating', 'failed')`,
                [row.checkout_id, now],
            );
            if (error instanceof SupportServiceError) throw error;
            throw new SupportServiceError('CHECKOUT_UNAVAILABLE');
        }
        await this.pool.query(
            `UPDATE payment_checkout_sessions
                SET stripe_checkout_session_id = $2, checkout_url = $3,
                    status = 'open', updated_at = $4
              WHERE checkout_id = $1 AND status IN ('creating', 'failed')`,
            [row.checkout_id, session.id, session.url, now],
        );
        return { checkoutId: row.checkout_id, url: session.url! };
    }

    /** Resolve a requested recipient that can receive new gifts now. */
    private async resolveRecipient(
        client: PoolClient,
        requested: 'general-fund' | { organizationId: string },
    ): Promise<ResolvedRecipient | undefined> {
        if (requested === 'general-fund') {
            const result = await client.query<{ display_name: string; status: string }>(
                'SELECT display_name, status FROM payment_recipients WHERE recipient_id = $1',
                [GENERAL_FUND_RECIPIENT_ID],
            );
            const row = result.rows[0];
            return row?.status === 'active' ?
                    { recipientId: GENERAL_FUND_RECIPIENT_ID, displayName: row.display_name }
                :   undefined;
        }
        const result = await client.query<{
            recipient_id: string;
            name: string;
            stripe_account_id: string;
            organization_id: string;
        }>(
            `SELECT r.recipient_id, o.name, r.stripe_account_id, o.organization_id
               FROM payment_recipients r
               JOIN organizations o ON o.organization_id = r.organization_id
              WHERE r.organization_id = $1 AND ${eligibleOrganizationRecipientSql}`,
            [requested.organizationId],
        );
        const row = result.rows[0];
        return row ?
                {
                    recipientId: row.recipient_id,
                    displayName: row.name,
                    stripeAccountId: row.stripe_account_id,
                    organizationId: row.organization_id,
                }
            :   undefined;
    }

    private async recipientById(
        recipientId: string,
        requireEligible: boolean,
    ): Promise<ResolvedRecipient | undefined> {
        if (recipientId === GENERAL_FUND_RECIPIENT_ID) {
            const client = await this.pool.connect();
            try {
                return requireEligible ?
                        await this.resolveRecipient(client, 'general-fund')
                    :   { recipientId, displayName: 'Patchwork general fund' };
            } finally {
                client.release();
            }
        }
        const result = await this.pool.query<{
            recipient_id: string;
            display_name: string;
            stripe_account_id: string | null;
            organization_id: string | null;
            eligible: boolean;
        }>(
            `SELECT r.recipient_id, COALESCE(o.name, r.display_name) AS display_name,
                    r.stripe_account_id, r.organization_id,
                    COALESCE(o.organization_id IS NOT NULL AND ${eligibleOrganizationRecipientSql}, FALSE) AS eligible
               FROM payment_recipients r
               LEFT JOIN organizations o ON o.organization_id = r.organization_id
              WHERE r.recipient_id = $1`,
            [recipientId],
        );
        const row = result.rows[0];
        if (!row?.stripe_account_id || (requireEligible && !row.eligible)) return undefined;
        return {
            recipientId: row.recipient_id,
            displayName: row.display_name,
            stripeAccountId: row.stripe_account_id,
            ...(row.organization_id ? { organizationId: row.organization_id } : {}),
        };
    }

    /** Organization IDs (from the given list) that can receive gifts now. */
    async listEligibleOrganizations(organizationIds: readonly string[]): Promise<string[]> {
        const ids = [...new Set(organizationIds)].filter(id => uuidPattern.test(id)).slice(0, 100);
        if (ids.length === 0 || this.options.paymentsMode === 'off') return [];
        const result = await this.pool.query<{ organization_id: string }>(
            `SELECT o.organization_id
               FROM payment_recipients r
               JOIN organizations o ON o.organization_id = r.organization_id
              WHERE r.organization_id = ANY($1::uuid[]) AND ${eligibleOrganizationRecipientSql}`,
            [ids],
        );
        return result.rows.map(row => row.organization_id).sort();
    }

    private async checkoutParams(
        row: CheckoutRow,
        recipient: ResolvedRecipient,
    ): Promise<Record<string, StripeFormValue>> {
        const origin = this.options.publicWebOrigin;
        const metadata = {
            patchwork_checkout_id: row.checkout_id,
            patchwork_recipient:
                recipient.organizationId ? `organization:${recipient.organizationId}` : 'general-fund',
        };
        const customer = row.donor_did ?
            await this.customerFor(row.donor_did, row.recipient_id)
        :   undefined;
        const common = {
            success_url: `${origin}/support/thanks?checkout=${row.checkout_id}`,
            cancel_url: `${origin}/support/cancelled?checkout=${row.checkout_id}`,
            client_reference_id: row.checkout_id,
            metadata,
            ...(customer ? { customer } : {}),
        };
        if (row.mode === 'one-time') {
            return {
                ...common,
                mode: 'payment',
                submit_type: 'donate',
                ...(customer ? {} : { customer_creation: 'always' }),
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: row.amount_minor,
                        product_data: {
                            name: recipient.organizationId ?
                                `Gift to ${recipient.displayName}`.slice(0, 250)
                            :   'Gift to the Patchwork general fund',
                        },
                    },
                }],
                payment_intent_data: { metadata },
            };
        }
        const priceId = await this.ensureMonthlyPrice(row.tier_version_id!, recipient);
        return {
            ...common,
            mode: 'subscription',
            line_items: [{ quantity: 1, price: priceId }],
            subscription_data: { metadata },
        };
    }

    private async customerFor(donorDid: string, recipientId: string): Promise<string | undefined> {
        const result = await this.pool.query<{ stripe_customer_id: string }>(
            `SELECT stripe_customer_id FROM donor_accounts
              WHERE donor_did = $1 AND recipient_id = $2`,
            [donorDid, recipientId],
        );
        return result.rows[0]?.stripe_customer_id;
    }

    private async ensureMonthlyPrice(tierVersionId: string, recipient: ResolvedRecipient): Promise<string> {
        const { recipientId } = recipient;
        const lookup = () =>
            this.pool.query<{ stripe_price_id: string }>(
                `SELECT stripe_price_id FROM supporter_tier_prices
                  WHERE tier_version_id = $1 AND recipient_id = $2`,
                [tierVersionId, recipientId],
            );
        const existing = await lookup();
        if (existing.rows[0]) return existing.rows[0].stripe_price_id;
        const version = await this.pool.query<{
            tier_key: string;
            version: number;
            amount_minor: number;
        }>(
            `SELECT tier_key, version, amount_minor FROM supporter_tier_versions
              WHERE tier_version_id = $1`,
            [tierVersionId],
        );
        const tier = version.rows[0];
        if (!tier) throw new SupportServiceError('TIER_UNAVAILABLE');
        const price = await this.gateway.createMonthlyPrice(
            {
                amountMinor: tier.amount_minor,
                currency: 'usd',
                productName: `${recipient.organizationId ? recipient.displayName : 'Patchwork general fund'} monthly support (${tier.tier_key} v${tier.version})`.slice(0, 250),
                metadata: {
                    patchwork_tier_version_id: tierVersionId,
                    patchwork_recipient_id: recipientId,
                },
            },
            `patchwork-price-${tierVersionId}-${recipientId}`,
            { accountId: recipient.stripeAccountId },
        );
        await this.pool.query(
            `INSERT INTO supporter_tier_prices (tier_version_id, recipient_id, stripe_price_id, created_at)
             VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
            [tierVersionId, recipientId, price.id],
        );
        return (await lookup()).rows[0]?.stripe_price_id ?? price.id;
    }

    async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatus> {
        if (!uuidPattern.test(checkoutId)) throw new SupportServiceError('CHECKOUT_NOT_FOUND');
        const result = await this.pool.query<{
            checkout_id: string;
            mode: 'one-time' | 'monthly';
            amount_minor: number;
            status: CheckoutStatus['status'];
            display_name: string;
            donation_status: string | null;
            subscription_status: string | null;
        }>(
            `SELECT c.checkout_id, c.mode, c.amount_minor, c.status, r.display_name,
                    d.status AS donation_status, s.status AS subscription_status
               FROM payment_checkout_sessions c
               JOIN payment_recipients r ON r.recipient_id = c.recipient_id
               LEFT JOIN donations d ON d.stripe_checkout_session_id = c.stripe_checkout_session_id
               LEFT JOIN supporter_subscriptions s ON s.checkout_id = c.checkout_id
              WHERE c.checkout_id = $1`,
            [checkoutId],
        );
        const row = result.rows[0];
        if (!row) throw new SupportServiceError('CHECKOUT_NOT_FOUND');
        return {
            checkoutId: row.checkout_id,
            mode: row.mode,
            amountMinor: row.amount_minor,
            currency: 'usd',
            recipientName: row.display_name,
            status: row.status,
            paymentStatus: row.donation_status ?? row.subscription_status,
        };
    }

    /**
     * Portal access stays available with payments off, and for recipients
     * that are no longer eligible, so donors can always cancel.
     */
    async createPortalSession(
        donorDid: string,
        recipientId = GENERAL_FUND_RECIPIENT_ID,
    ): Promise<{ url: string }> {
        if (!uuidPattern.test(recipientId)) throw new SupportServiceError('NO_SUPPORT_ACCOUNT');
        const customer = await this.customerFor(donorDid, recipientId);
        const recipient = customer ? await this.recipientById(recipientId, false) : undefined;
        if (!customer || !recipient) throw new SupportServiceError('NO_SUPPORT_ACCOUNT');
        try {
            return await this.gateway.createBillingPortalSession(
                { customer, returnUrl: `${this.options.publicWebOrigin}/settings` },
                { accountId: recipient.stripeAccountId },
            );
        } catch {
            throw new SupportServiceError('CHECKOUT_UNAVAILABLE');
        }
    }

    async getAccountSupport(donorDid: string): Promise<AccountSupport> {
        const [donations, subscriptions, recognition, supporter, accounts] = await Promise.all([
            this.pool.query<{
                donation_id: string;
                display_name: string;
                amount_minor: number;
                status: string;
                created_at: Date;
            }>(
                `SELECT d.donation_id, r.display_name, d.amount_minor, d.status, d.created_at
                   FROM donations d
                   JOIN payment_recipients r ON r.recipient_id = d.recipient_id
                  WHERE d.donor_did = $1
                  ORDER BY d.created_at DESC, d.donation_id
                  LIMIT 100`,
                [donorDid],
            ),
            this.pool.query<{
                subscription_id: string;
                display_name: string;
                tier_key: string;
                name_key: string;
                amount_minor: number;
                status: string;
                current_period_end: Date | null;
                cancel_at_period_end: boolean;
            }>(
                `SELECT s.subscription_id, r.display_name, v.tier_key, v.name_key,
                        v.amount_minor, s.status, s.current_period_end, s.cancel_at_period_end
                   FROM supporter_subscriptions s
                   JOIN payment_recipients r ON r.recipient_id = s.recipient_id
                   JOIN supporter_tier_versions v ON v.tier_version_id = s.tier_version_id
                  WHERE s.donor_did = $1
                  ORDER BY s.created_at DESC, s.subscription_id
                  LIMIT 100`,
                [donorDid],
            ),
            this.recognitionFor(donorDid),
            this.pool.query(
                `SELECT 1 FROM supporter_subscriptions s
                  WHERE s.donor_did = $1 AND ${activeSupporterSubscriptionSql} LIMIT 1`,
                [donorDid],
            ),
            this.pool.query<{ recipient_id: string; display_name: string }>(
                `SELECT a.recipient_id, COALESCE(o.name, r.display_name) AS display_name
                   FROM donor_accounts a
                   JOIN payment_recipients r ON r.recipient_id = a.recipient_id
                   LEFT JOIN organizations o ON o.organization_id = r.organization_id
                  WHERE a.donor_did = $1
                  ORDER BY r.kind DESC, display_name, a.recipient_id`,
                [donorDid],
            ),
        ]);
        return {
            donations: donations.rows.map(row => ({
                donationId: row.donation_id,
                recipientName: row.display_name,
                amountMinor: row.amount_minor,
                currency: 'usd',
                status: row.status,
                createdAt: iso(row.created_at)!,
            })),
            subscriptions: subscriptions.rows.map(row => ({
                subscriptionId: row.subscription_id,
                recipientName: row.display_name,
                tierKey: row.tier_key,
                nameKey: row.name_key,
                amountMinor: row.amount_minor,
                currency: 'usd',
                status: row.status,
                currentPeriodEnd: iso(row.current_period_end),
                cancelAtPeriodEnd: row.cancel_at_period_end,
            })),
            manageable: accounts.rows.map(row => ({
                recipientId: row.recipient_id,
                recipientName: row.display_name,
            })),
            isSupporter: (supporter.rowCount ?? 0) > 0,
            recognition,
        };
    }

    private async recognitionFor(donorDid: string): Promise<SupporterRecognition> {
        const result = await this.pool.query<{
            badge_visible: boolean;
            listed_publicly: boolean;
            share_name_with_recipient: boolean;
        }>(
            `SELECT badge_visible, listed_publicly, share_name_with_recipient
               FROM supporter_recognition WHERE donor_did = $1`,
            [donorDid],
        );
        const row = result.rows[0];
        return {
            badgeVisible: row?.badge_visible ?? false,
            listedPublicly: row?.listed_publicly ?? false,
            shareNameWithRecipient: row?.share_name_with_recipient ?? false,
        };
    }

    /** Every setting is opt-in and can be changed at any time, with or without a current gift. */
    async updateRecognition(donorDid: string, body: unknown, now = new Date()): Promise<SupporterRecognition> {
        const parsed = recognitionSchema.safeParse(body);
        if (!parsed.success) throw new SupportServiceError('INVALID_SUPPORT_REQUEST');
        const value = parsed.data;
        await this.pool.query(
            `INSERT INTO supporter_recognition (
                donor_did, badge_visible, listed_publicly, share_name_with_recipient, updated_at
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (donor_did) DO UPDATE SET
                badge_visible = EXCLUDED.badge_visible,
                listed_publicly = EXCLUDED.listed_publicly,
                share_name_with_recipient = EXCLUDED.share_name_with_recipient,
                updated_at = EXCLUDED.updated_at`,
            [donorDid, value.badgeVisible, value.listedPublicly, value.shareNameWithRecipient, now],
        );
        return value;
    }

    /** DIDs, from the given list, that show a supporter badge now. */
    async listBadgeHolders(dids: readonly string[]): Promise<string[]> {
        const candidates = [...new Set(dids)].filter(did => didPattern.test(did) && did.length <= 2048).slice(0, 100);
        if (candidates.length === 0) return [];
        const result = await this.pool.query<{ donor_did: string }>(
            `SELECT r.donor_did FROM supporter_recognition r
              WHERE r.donor_did = ANY($1::text[]) AND r.badge_visible
                AND EXISTS (
                    SELECT 1 FROM supporter_subscriptions s
                     WHERE s.donor_did = r.donor_did AND ${activeSupporterSubscriptionSql}
                )
              ORDER BY r.donor_did`,
            [candidates],
        );
        return result.rows.map(row => row.donor_did);
    }

    /**
     * Public list of general-fund monthly supporters who chose to be listed.
     * Sorted by DID so the order reveals neither tier nor tenure.
     */
    async listPublicSupporters(limit = 200): Promise<string[]> {
        const result = await this.pool.query<{ donor_did: string }>(
            `SELECT r.donor_did FROM supporter_recognition r
              WHERE r.listed_publicly
                AND EXISTS (
                    SELECT 1 FROM supporter_subscriptions s
                     WHERE s.donor_did = r.donor_did
                       AND s.recipient_id = $1
                       AND ${activeSupporterSubscriptionSql}
                )
              ORDER BY r.donor_did
              LIMIT $2`,
            [GENERAL_FUND_RECIPIENT_ID, limit],
        );
        return result.rows.map(row => row.donor_did);
    }

    /**
     * Webhook processors. Platform events apply to the general fund; Connect
     * events apply only to the recipient that owns the delivering account,
     * and every object is re-fetched from that same account.
     */
    processors(): Map<string, PaymentEventProcessor> {
        const scoped = (
            processor: (event: StripeEvent, client: PoolClient, recipient: EventRecipient) => Promise<void>,
        ): PaymentEventProcessor =>
            async (event, client) => {
                const recipient = await this.recipientForEvent(client, event);
                if (recipient) await processor(event, client, recipient);
            };
        const processors = new Map<string, PaymentEventProcessor>();
        for (const type of checkoutEventTypes) {
            processors.set(type, scoped((event, client, recipient) => this.applyCheckoutEvent(event, client, recipient)));
        }
        for (const type of [...subscriptionEventTypes, ...invoiceEventTypes]) {
            processors.set(type, scoped((event, client, recipient) => this.applySubscriptionEvent(event, client, recipient)));
        }
        processors.set('charge.refunded', scoped((event, client, recipient) => this.applyRefund(event, client, recipient)));
        for (const type of disputeEventTypes) {
            processors.set(type, scoped((event, client, recipient) => this.applyDispute(event, client, recipient)));
        }
        processors.set('account.updated', (event, client) => this.applyAccountUpdate(event, client));
        return processors;
    }

    private async recipientForEvent(client: PoolClient, event: StripeEvent): Promise<EventRecipient | undefined> {
        if (!event.account) return { recipientId: GENERAL_FUND_RECIPIENT_ID, scope: {} };
        const result = await client.query<{ recipient_id: string }>(
            'SELECT recipient_id FROM payment_recipients WHERE stripe_account_id = $1',
            [event.account],
        );
        const row = result.rows[0];
        return row ? { recipientId: row.recipient_id, scope: { accountId: event.account } } : undefined;
    }

    /** Mirror onboarding progress; suspended and closed recipients keep their status. */
    private async applyAccountUpdate(event: StripeEvent, client: PoolClient): Promise<void> {
        if (!event.account) return;
        const account = await this.gateway.retrieveConnectedAccount(event.account);
        await client.query(
            `UPDATE payment_recipients SET
                charges_enabled = $2, payouts_enabled = $3, details_submitted = $4,
                status = CASE WHEN status = 'onboarding' AND $2 THEN 'active' ELSE status END,
                account_synced_at = NOW(), updated_at = NOW()
              WHERE stripe_account_id = $1 AND kind = 'organization'`,
            [account.id, account.chargesEnabled, account.payoutsEnabled, account.detailsSubmitted],
        );
    }

    private async applyCheckoutEvent(
        event: StripeEvent,
        client: PoolClient,
        recipient: EventRecipient,
    ): Promise<void> {
        const sessionId = stripeIdOf(event.data.object['id'], stripeIdPatterns.checkoutSession);
        if (!sessionId) throw processorError('INVALID_EVENT_OBJECT');
        const session = await this.gateway.retrieveCheckoutSession(sessionId, recipient.scope);
        const found = await client.query<CheckoutRow>(
            `SELECT checkout_id, request_hash, recipient_id, mode, amount_minor,
                    tier_version_id, donor_did, checkout_url, status, livemode
               FROM payment_checkout_sessions
              WHERE stripe_checkout_session_id = $1 AND recipient_id = $2
              FOR UPDATE`,
            [session.id, recipient.recipientId],
        );
        const row = found.rows[0];
        if (!row) return; // Not a Patchwork Checkout.
        const now = new Date();
        await client.query(
            `UPDATE payment_checkout_sessions
                SET status = $2, checkout_url = CASE WHEN $2 = 'open' THEN checkout_url END,
                    updated_at = $3
              WHERE checkout_id = $1`,
            [row.checkout_id, session.status, now],
        );
        if (session.status !== 'complete') return;
        if (row.donor_did && session.customer) {
            await this.recordDonorAccount(client, row.donor_did, row.recipient_id, session.customer, now);
        }
        if (row.mode === 'one-time') {
            const status =
                session.paymentStatus === 'paid' ? 'succeeded'
                : event.type === 'checkout.session.async_payment_failed' ? 'failed'
                : 'pending';
            const donation = await client.query<{ status: string }>(
                `INSERT INTO donations (
                    donation_id, recipient_id, donor_did, stripe_checkout_session_id,
                    stripe_payment_intent_id, amount_minor, currency, status, livemode,
                    created_at, updated_at, succeeded_at
                ) VALUES ($1, $2, $3, $4, $5, $6, 'usd',
                          -- A refund or dispute applied before this completion wins.
                          CASE WHEN $7 = 'succeeded' THEN COALESCE((
                              SELECT CASE WHEN c.refunded THEN 'refunded'
                                          WHEN c.dispute_open THEN 'disputed' END
                                FROM payment_charge_states c
                               WHERE c.stripe_payment_intent_id = $5 AND c.recipient_id = $2
                          ), $7) ELSE $7 END,
                          $8, $9, $9,
                          CASE WHEN $7 = 'succeeded' THEN $9::timestamptz END)
                ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET
                    stripe_payment_intent_id =
                        COALESCE(donations.stripe_payment_intent_id, EXCLUDED.stripe_payment_intent_id),
                    status = CASE WHEN donations.status = 'pending'
                                  THEN EXCLUDED.status ELSE donations.status END,
                    succeeded_at = COALESCE(donations.succeeded_at, EXCLUDED.succeeded_at),
                    updated_at = EXCLUDED.updated_at
                RETURNING status`,
                [
                    randomUUID(), row.recipient_id, row.donor_did, session.id,
                    session.paymentIntent ?? null,
                    session.amountTotal ?? row.amount_minor,
                    status, session.livemode, now,
                ],
            );
            const recorded = donation.rows[0]?.status;
            if (recorded === 'succeeded') {
                await notifyDonor(client, row.donor_did, 'support_receipt', `support-receipt:${session.id}`, now);
            } else if (recorded === 'failed') {
                await notifyDonor(client, row.donor_did, 'support_payment_failed', `support-failed:${session.id}`, now);
            }
            return;
        }
        if (session.subscription) {
            const subscription = await this.gateway.retrieveSubscription(session.subscription, recipient.scope);
            await this.syncSubscription(client, subscription, now, recipient);
        }
    }

    private async applySubscriptionEvent(
        event: StripeEvent,
        client: PoolClient,
        recipient: EventRecipient,
    ): Promise<void> {
        const object = event.data.object;
        const subscriptionId = event.type.startsWith('invoice.') ?
            stripeIdOf(object['subscription'], stripeIdPatterns.subscription) ??
            stripeIdOf(
                (object['parent'] as { subscription_details?: { subscription?: unknown } } | null)
                    ?.subscription_details?.subscription,
                stripeIdPatterns.subscription,
            )
        :   stripeIdOf(object['id'], stripeIdPatterns.subscription);
        if (!subscriptionId) return; // One-off invoices are not supporter subscriptions.
        const subscription = await this.gateway.retrieveSubscription(subscriptionId, recipient.scope);
        const now = new Date();
        await this.syncSubscription(client, subscription, now, recipient);
        const invoiceId = stripeIdOf(object['id'], stripeIdPatterns.invoice);
        if (!invoiceId || !event.type.startsWith('invoice.')) return;
        const donor = await client.query<{ donor_did: string | null }>(
            'SELECT donor_did FROM supporter_subscriptions WHERE stripe_subscription_id = $1 AND recipient_id = $2',
            [subscription.id, recipient.recipientId],
        );
        const donorDid = donor.rows[0]?.donor_did;
        if (event.type === 'invoice.paid') {
            await notifyDonor(client, donorDid, 'support_receipt', `support-receipt:${invoiceId}`, now);
        } else {
            await notifyDonor(client, donorDid, 'support_payment_failed', `support-failed:${invoiceId}`, now);
        }
    }

    private async syncSubscription(
        client: PoolClient,
        subscription: StripeSubscription,
        fetchedAt: Date,
        recipient: EventRecipient,
    ): Promise<void> {
        if (!subscriptionStatuses.has(subscription.status)) {
            throw processorError('UNKNOWN_SUBSCRIPTION_STATUS');
        }
        const checkoutId = subscription.metadata['patchwork_checkout_id'];
        const checkout = checkoutId && uuidPattern.test(checkoutId) ?
            (await client.query<CheckoutRow>(
                `SELECT checkout_id, request_hash, recipient_id, mode, amount_minor,
                        tier_version_id, donor_did, checkout_url, status, livemode
                   FROM payment_checkout_sessions
                  WHERE checkout_id = $1 AND mode = 'monthly' AND recipient_id = $2`,
                [checkoutId, recipient.recipientId],
            )).rows[0]
        :   undefined;
        if (!checkout) {
            const known = await client.query(
                'SELECT 1 FROM supporter_subscriptions WHERE stripe_subscription_id = $1 AND recipient_id = $2',
                [subscription.id, recipient.recipientId],
            );
            if (known.rowCount === 0) return; // Not a Patchwork subscription.
        }
        if (checkout?.donor_did && subscription.customer) {
            await this.recordDonorAccount(
                client, checkout.donor_did, checkout.recipient_id, subscription.customer, fetchedAt,
            );
        }
        const periodEnd =
            subscription.currentPeriodEnd !== undefined ?
                new Date(subscription.currentPeriodEnd * 1_000)
            :   null;
        const previous = (await client.query<{
            donor_did: string | null;
            status: string;
            cancel_at_period_end: boolean;
        }>(
            `SELECT donor_did, status, cancel_at_period_end FROM supporter_subscriptions
              WHERE stripe_subscription_id = $1 AND recipient_id = $2 FOR UPDATE`,
            [subscription.id, recipient.recipientId],
        )).rows[0];
        const notifyEnding = async (written: number | null) => {
            if (!written) return;
            const donorDid = previous ? previous.donor_did : checkout?.donor_did;
            if (subscription.status === 'canceled') {
                // A cancellation the donor was already told about is not announced twice.
                if (previous && previous.status !== 'canceled' && !previous.cancel_at_period_end) {
                    await notifyDonor(client, donorDid, 'support_subscription_ending',
                        `support-ending:${subscription.id}:ended`, fetchedAt);
                }
                return;
            }
            if (subscription.cancelAtPeriodEnd && !previous?.cancel_at_period_end) {
                await notifyDonor(client, donorDid, 'support_subscription_ending',
                    `support-ending:${subscription.id}:${periodEnd?.toISOString() ?? 'scheduled'}`, fetchedAt);
            }
        };
        if (checkout) {
            // Insert or refresh; a write fetched earlier never replaces newer state.
            const written = await client.query(
                `INSERT INTO supporter_subscriptions (
                    subscription_id, recipient_id, tier_version_id, donor_did,
                    stripe_subscription_id, status, current_period_end,
                    cancel_at_period_end, paused_reason, livemode, stripe_state_at,
                    created_at, updated_at, checkout_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                          CASE WHEN $9 THEN 'donor' END, $10, $11, $11, $11, $12)
                ON CONFLICT (stripe_subscription_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    current_period_end = EXCLUDED.current_period_end,
                    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                    paused_reason = CASE WHEN $9
                        THEN COALESCE(supporter_subscriptions.paused_reason, 'donor') END,
                    stripe_state_at = EXCLUDED.stripe_state_at,
                    updated_at = EXCLUDED.updated_at
                WHERE supporter_subscriptions.stripe_state_at <= EXCLUDED.stripe_state_at`,
                [
                    randomUUID(), checkout.recipient_id, checkout.tier_version_id,
                    checkout.donor_did, subscription.id, subscription.status, periodEnd,
                    subscription.cancelAtPeriodEnd, subscription.collectionPaused,
                    subscription.livemode, fetchedAt, checkout.checkout_id,
                ],
            );
            await notifyEnding(written.rowCount);
            return;
        }
        const written = await client.query(
            `UPDATE supporter_subscriptions SET
                status = $2, current_period_end = $3, cancel_at_period_end = $4,
                paused_reason = CASE WHEN $5 THEN COALESCE(paused_reason, 'donor') END,
                stripe_state_at = $6, updated_at = $6
              WHERE stripe_subscription_id = $1 AND stripe_state_at <= $6 AND recipient_id = $7`,
            [
                subscription.id, subscription.status, periodEnd,
                subscription.cancelAtPeriodEnd, subscription.collectionPaused, fetchedAt,
                recipient.recipientId,
            ],
        );
        await notifyEnding(written.rowCount);
    }

    private async recordDonorAccount(
        client: PoolClient,
        donorDid: string,
        recipientId: string,
        customer: string,
        now: Date,
    ): Promise<void> {
        // The first customer for a donor and recipient is kept; Checkout reuses it.
        await client.query(
            `INSERT INTO donor_accounts (
                donor_account_id, donor_did, recipient_id, stripe_customer_id,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $5)
            ON CONFLICT DO NOTHING`,
            [randomUUID(), donorDid, recipientId, customer, now],
        );
    }

    private async applyRefund(event: StripeEvent, client: PoolClient, recipient: EventRecipient): Promise<void> {
        const chargeId = stripeIdOf(event.data.object['id'], stripeIdPatterns.charge);
        if (!chargeId) throw processorError('INVALID_EVENT_OBJECT');
        const charge = await this.gateway.retrieveCharge(chargeId, recipient.scope);
        // Partial refunds leave the gift recorded as succeeded.
        if (!charge.refunded || !charge.paymentIntent) return;
        await this.recordChargeState(client, charge.paymentIntent, recipient.recipientId, { refunded: true });
        await client.query(
            `UPDATE donations SET status = 'refunded', updated_at = NOW()
              WHERE stripe_payment_intent_id = $1 AND status <> 'refunded' AND recipient_id = $2`,
            [charge.paymentIntent, recipient.recipientId],
        );
    }

    private async recordChargeState(
        client: PoolClient,
        paymentIntent: string,
        recipientId: string,
        state: { refunded: true } | { disputeOpen: boolean },
    ): Promise<void> {
        const refunded = 'refunded' in state;
        await client.query(
            `INSERT INTO payment_charge_states (
                stripe_payment_intent_id, recipient_id, refunded, dispute_open, updated_at
            ) VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
                refunded = payment_charge_states.refunded OR EXCLUDED.refunded,
                dispute_open = CASE WHEN $3 THEN payment_charge_states.dispute_open ELSE EXCLUDED.dispute_open END,
                updated_at = EXCLUDED.updated_at
            WHERE payment_charge_states.recipient_id = EXCLUDED.recipient_id`,
            [paymentIntent, recipientId, refunded, refunded ? false : state.disputeOpen],
        );
    }

    private async applyDispute(event: StripeEvent, client: PoolClient, recipient: EventRecipient): Promise<void> {
        const disputeId = stripeIdOf(event.data.object['id'], stripeIdPatterns.dispute);
        if (!disputeId) throw processorError('INVALID_EVENT_OBJECT');
        const dispute = await this.gateway.retrieveDispute(disputeId, recipient.scope);
        if (!dispute.paymentIntent) return;
        const resolvedForDonee = dispute.status === 'won' || dispute.status === 'warning_closed';
        await this.recordChargeState(client, dispute.paymentIntent, recipient.recipientId, { disputeOpen: !resolvedForDonee });
        await client.query(
            resolvedForDonee ?
                `UPDATE donations SET status = 'succeeded', updated_at = NOW()
                  WHERE stripe_payment_intent_id = $1 AND status = 'disputed' AND recipient_id = $2`
            :   `UPDATE donations SET status = 'disputed', updated_at = NOW()
                  WHERE stripe_payment_intent_id = $1 AND status = 'succeeded' AND recipient_id = $2`,
            [dispute.paymentIntent, recipient.recipientId],
        );
    }
}
