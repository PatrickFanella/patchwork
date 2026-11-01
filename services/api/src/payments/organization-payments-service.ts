import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { notifyDonor } from './payment-notifications.js';
import {
    activeSupporterSubscriptionSql,
    eligibleOrganizationRecipientSql,
} from './recipient-eligibility.js';
import type { StripeGateway } from './stripe-gateway.js';

export type OrganizationPaymentsErrorCode =
    | 'ORGANIZATION_NOT_FOUND'
    | 'ORGANIZATION_PAYMENTS_FORBIDDEN'
    | 'ORGANIZATION_NOT_VERIFIED'
    | 'ORGANIZATION_PAYMENTS_UNAVAILABLE'
    | 'PAYMENT_RECIPIENT_SUSPENDED'
    | 'STRIPE_UNAVAILABLE';

export class OrganizationPaymentsError extends Error {
    constructor(readonly code: OrganizationPaymentsErrorCode) {
        super(code);
        this.name = 'OrganizationPaymentsError';
    }
}

export interface OrganizationPaymentsStatus {
    organizationId: string;
    status: 'not-started' | 'onboarding' | 'active' | 'suspended';
    verified: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    /** Whether donors can give to this organization right now. */
    eligible: boolean;
    /** Organizations manage payouts, refunds and receipts in their own Stripe Dashboard. */
    dashboardUrl: string | null;
    activeMonthlySupporters: number;
    monthlyRecurringMinor: number;
    months: Array<{ month: string; giftCount: number; giftTotalMinor: number }>;
    /**
     * Donors who chose to share their name with recipients and have given
     * here in the last 12 months or give monthly now. Never tied to amounts.
     */
    namedSupporterDids: string[];
}

export interface EligibilitySweepResult {
    paused: number;
    failed: number;
}

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface OrganizationRow {
    organization_id: string;
    name: string;
    origin: string;
    role: string | null;
    verified: boolean;
}

interface RecipientRow {
    recipient_id: string;
    stripe_account_id: string | null;
    status: 'onboarding' | 'active' | 'suspended' | 'closed';
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
}

export class OrganizationPaymentsService {
    constructor(
        private readonly pool: Pool,
        private readonly gateway: StripeGateway,
        private readonly options: { publicWebOrigin: string; paymentsMode: 'off' | 'test' | 'live' },
    ) {}

    private async organizationFor(
        client: Pool | PoolClient,
        actorDid: string,
        organizationId: string,
    ): Promise<OrganizationRow> {
        if (!uuidPattern.test(organizationId)) throw new OrganizationPaymentsError('ORGANIZATION_NOT_FOUND');
        const result = await client.query<OrganizationRow>(
            `SELECT o.organization_id, o.name, o.origin, m.role,
                    EXISTS (
                        SELECT 1 FROM verification_applications v
                         WHERE v.subject_type = 'organization'
                           AND v.organization_id = o.organization_id
                           AND v.status = 'approved'
                           AND (v.expires_at IS NULL OR v.expires_at > NOW())
                    ) AS verified
               FROM organizations o
               LEFT JOIN organization_memberships m
                 ON m.organization_id = o.organization_id
                AND m.member_did = $2 AND m.status = 'active'
              WHERE o.organization_id = $1`,
            [organizationId, actorDid],
        );
        const organization = result.rows[0];
        if (!organization) throw new OrganizationPaymentsError('ORGANIZATION_NOT_FOUND');
        if (organization.role !== 'owner' && organization.role !== 'admin') {
            throw new OrganizationPaymentsError('ORGANIZATION_PAYMENTS_FORBIDDEN');
        }
        return organization;
    }

    /**
     * Start or resume Stripe onboarding for a verified organization and
     * return a single-use Stripe Account Link.
     */
    async startOnboarding(actorDid: string, organizationId: string, now = new Date()): Promise<{ url: string }> {
        if (this.options.paymentsMode === 'off') {
            throw new OrganizationPaymentsError('ORGANIZATION_PAYMENTS_UNAVAILABLE');
        }
        const organization = await this.organizationFor(this.pool, actorDid, organizationId);
        if (organization.origin === 'synthetic') {
            throw new OrganizationPaymentsError('ORGANIZATION_PAYMENTS_UNAVAILABLE');
        }
        if (!organization.verified) throw new OrganizationPaymentsError('ORGANIZATION_NOT_VERIFIED');

        const recipient = await this.ensureRecipient(organization, actorDid, now);
        if (recipient.status === 'suspended' || recipient.status === 'closed') {
            throw new OrganizationPaymentsError('PAYMENT_RECIPIENT_SUSPENDED');
        }
        let accountId = recipient.stripe_account_id;
        try {
            if (!accountId) {
                const account = await this.gateway.createConnectedAccount(
                    {
                        businessName: organization.name,
                        metadata: {
                            patchwork_organization_id: organization.organization_id,
                            patchwork_recipient_id: recipient.recipient_id,
                        },
                    },
                    `patchwork-account-${recipient.recipient_id}`,
                );
                // The idempotency key makes concurrent first attempts share one account.
                await this.pool.query(
                    `UPDATE payment_recipients
                        SET stripe_account_id = $2, updated_at = $3
                      WHERE recipient_id = $1 AND stripe_account_id IS NULL`,
                    [recipient.recipient_id, account.id, now],
                );
                const stored = await this.pool.query<{ stripe_account_id: string }>(
                    'SELECT stripe_account_id FROM payment_recipients WHERE recipient_id = $1',
                    [recipient.recipient_id],
                );
                accountId = stored.rows[0]!.stripe_account_id;
            }
            const returnBase = `${this.options.publicWebOrigin}/organizations?payments=${organization.organization_id}`;
            const link = await this.gateway.createAccountOnboardingLink({
                accountId,
                refreshUrl: `${returnBase}&onboarding=refresh`,
                returnUrl: `${returnBase}&onboarding=return`,
            });
            await this.audit(recipient.recipient_id, actorDid, 'onboarding-link-created', {}, now);
            return link;
        } catch (error) {
            if (error instanceof OrganizationPaymentsError) throw error;
            throw new OrganizationPaymentsError('STRIPE_UNAVAILABLE');
        }
    }

    private async ensureRecipient(
        organization: OrganizationRow,
        actorDid: string,
        now: Date,
    ): Promise<RecipientRow> {
        const inserted = await this.pool.query<{ recipient_id: string }>(
            `INSERT INTO payment_recipients (
                recipient_id, kind, organization_id, display_name, status, created_at, updated_at
            ) VALUES ($1, 'organization', $2, $3, 'onboarding', $4, $4)
            ON CONFLICT (organization_id) DO NOTHING
            RETURNING recipient_id`,
            [randomUUID(), organization.organization_id, organization.name.slice(0, 160), now],
        );
        if (inserted.rows[0]) {
            await this.audit(inserted.rows[0].recipient_id, actorDid, 'recipient-created', {}, now);
        }
        const result = await this.pool.query<RecipientRow>(
            `SELECT recipient_id, stripe_account_id, status, charges_enabled,
                    payouts_enabled, details_submitted
               FROM payment_recipients WHERE organization_id = $1`,
            [organization.organization_id],
        );
        return result.rows[0]!;
    }

    async getStatus(actorDid: string, organizationId: string): Promise<OrganizationPaymentsStatus> {
        const organization = await this.organizationFor(this.pool, actorDid, organizationId);
        let recipient = (await this.pool.query<RecipientRow>(
            `SELECT recipient_id, stripe_account_id, status, charges_enabled,
                    payouts_enabled, details_submitted
               FROM payment_recipients WHERE organization_id = $1`,
            [organizationId],
        )).rows[0];
        // After returning from onboarding, refresh rather than wait for account.updated.
        if (recipient?.stripe_account_id && !recipient.charges_enabled && recipient.status === 'onboarding') {
            recipient = await this.refreshAccount(recipient).catch(() => recipient);
        }
        const empty = {
            activeMonthlySupporters: 0,
            monthlyRecurringMinor: 0,
            months: [] as OrganizationPaymentsStatus['months'],
            namedSupporterDids: [] as string[],
        };
        if (!recipient) {
            return {
                organizationId,
                status: 'not-started',
                verified: organization.verified,
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false,
                eligible: false,
                dashboardUrl: null,
                ...empty,
            };
        }
        const [eligible, subscriptions, months, named] = await Promise.all([
            this.pool.query(
                `SELECT 1 FROM payment_recipients r
                   JOIN organizations o ON o.organization_id = r.organization_id
                  WHERE r.recipient_id = $1 AND ${eligibleOrganizationRecipientSql}`,
                [recipient.recipient_id],
            ),
            this.pool.query<{ supporters: string; recurring: string | null }>(
                `SELECT COUNT(*) AS supporters, SUM(v.amount_minor) AS recurring
                   FROM supporter_subscriptions s
                   JOIN supporter_tier_versions v ON v.tier_version_id = s.tier_version_id
                  WHERE s.recipient_id = $1 AND s.status IN ('active', 'trialing', 'past_due')
                    AND s.paused_reason IS NULL`,
                [recipient.recipient_id],
            ),
            this.pool.query<{ month: string; gifts: string; total: string }>(
                `SELECT to_char(date_trunc('month', succeeded_at), 'YYYY-MM') AS month,
                        COUNT(*) AS gifts, SUM(amount_minor) AS total
                   FROM donations
                  WHERE recipient_id = $1 AND status = 'succeeded'
                    AND succeeded_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
                  GROUP BY 1 ORDER BY 1 DESC`,
                [recipient.recipient_id],
            ),
            this.pool.query<{ donor_did: string }>(
                `SELECT r.donor_did FROM supporter_recognition r
                  WHERE r.share_name_with_recipient
                    AND (
                        EXISTS (
                            SELECT 1 FROM supporter_subscriptions s
                             WHERE s.donor_did = r.donor_did AND s.recipient_id = $1
                               AND ${activeSupporterSubscriptionSql}
                        )
                        OR EXISTS (
                            SELECT 1 FROM donations d
                             WHERE d.donor_did = r.donor_did AND d.recipient_id = $1
                               AND d.status = 'succeeded'
                               AND d.succeeded_at >= NOW() - INTERVAL '12 months'
                        )
                    )
                  ORDER BY r.donor_did
                  LIMIT 200`,
                [recipient.recipient_id],
            ),
        ]);
        return {
            organizationId,
            status: recipient.status === 'closed' ? 'suspended' : recipient.status,
            verified: organization.verified,
            chargesEnabled: recipient.charges_enabled,
            payoutsEnabled: recipient.payouts_enabled,
            detailsSubmitted: recipient.details_submitted,
            eligible: (eligible.rowCount ?? 0) > 0 && this.options.paymentsMode !== 'off',
            dashboardUrl: recipient.stripe_account_id ? 'https://dashboard.stripe.com/' : null,
            activeMonthlySupporters: Number(subscriptions.rows[0]?.supporters ?? 0),
            monthlyRecurringMinor: Number(subscriptions.rows[0]?.recurring ?? 0),
            months: months.rows.map(row => ({
                month: row.month,
                giftCount: Number(row.gifts),
                giftTotalMinor: Number(row.total),
            })),
            namedSupporterDids: named.rows.map(row => row.donor_did),
        };
    }

    private async refreshAccount(recipient: RecipientRow): Promise<RecipientRow> {
        const account = await this.gateway.retrieveConnectedAccount(recipient.stripe_account_id!);
        const updated = await this.pool.query<RecipientRow>(
            `UPDATE payment_recipients SET
                charges_enabled = $2, payouts_enabled = $3, details_submitted = $4,
                status = CASE WHEN status = 'onboarding' AND $2 THEN 'active' ELSE status END,
                account_synced_at = NOW(), updated_at = NOW()
              WHERE recipient_id = $1
          RETURNING recipient_id, stripe_account_id, status, charges_enabled,
                    payouts_enabled, details_submitted`,
            [recipient.recipient_id, account.chargesEnabled, account.payoutsEnabled, account.detailsSubmitted],
        );
        return updated.rows[0] ?? recipient;
    }

    /**
     * Pause collection on monthly gifts to organizations that can no longer
     * receive them (verification lapsed or revoked, Stripe charges disabled,
     * recipient suspended, or organization deleted). Paused gifts are not
     * resumed automatically; donors resume them in the Customer Portal.
     */
    async runEligibilitySweep(limit = 50): Promise<EligibilitySweepResult> {
        const candidates = await this.pool.query<{
            subscription_id: string;
            stripe_subscription_id: string;
            stripe_account_id: string;
            recipient_status: string;
            updated_at: Date;
        }>(
            `SELECT s.subscription_id, s.stripe_subscription_id, r.stripe_account_id,
                    r.status AS recipient_status, s.updated_at
               FROM supporter_subscriptions s
               JOIN payment_recipients r ON r.recipient_id = s.recipient_id
               LEFT JOIN organizations o ON o.organization_id = r.organization_id
              WHERE r.kind = 'organization'
                AND r.stripe_account_id IS NOT NULL
                AND r.deauthorized_at IS NULL
                AND s.paused_reason IS NULL
                AND s.status IN ('active', 'trialing', 'past_due')
                AND NOT COALESCE(o.organization_id IS NOT NULL AND ${eligibleOrganizationRecipientSql}, FALSE)
              -- A failed attempt touches updated_at, so rows that keep failing
              -- move behind the rest instead of blocking every run.
              ORDER BY s.updated_at, s.subscription_id
              LIMIT $1`,
            [limit],
        );
        const result: EligibilitySweepResult = { paused: 0, failed: 0 };
        for (const row of candidates.rows) {
            const reason = row.recipient_status === 'suspended' ? 'recipient-suspended' : 'recipient-ineligible';
            try {
                // The key changes whenever the row does. A fixed key would make
                // Stripe replay an earlier pause after the organization resumed
                // collection, and nothing would be paused.
                const paused = await this.gateway.pauseSubscriptionCollection(
                    row.stripe_subscription_id,
                    `patchwork-pause-${row.subscription_id}-${reason}-${row.updated_at.getTime()}`,
                    { accountId: row.stripe_account_id },
                );
                if (!paused.collectionPaused) throw new Error('PAUSE_NOT_APPLIED');
                await this.recordPause(row.subscription_id, reason);
                result.paused += 1;
            } catch {
                await this.pool.query(
                    'UPDATE supporter_subscriptions SET updated_at = NOW() WHERE subscription_id = $1',
                    [row.subscription_id],
                ).catch(() => undefined);
                result.failed += 1;
            }
        }
        return result;
    }

    private async recordPause(subscriptionId: string, reason: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const paused = await client.query<{ donor_did: string | null }>(
                `UPDATE supporter_subscriptions
                    SET paused_reason = $2, updated_at = NOW()
                  -- The pause's own webhook may already have recorded it as 'donor'.
                  WHERE subscription_id = $1 AND (paused_reason IS NULL OR paused_reason = 'donor')
                  RETURNING donor_did`,
                [subscriptionId, reason],
            );
            if (paused.rows[0]) {
                await notifyDonor(client, paused.rows[0].donor_did, 'support_recipient_paused',
                    `support-paused:${subscriptionId}:${reason}`, new Date());
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async audit(
        recipientId: string,
        actorDid: string,
        action: string,
        details: Record<string, unknown>,
        now: Date,
    ): Promise<void> {
        await this.pool.query(
            `INSERT INTO payment_audit_events (recipient_id, actor_did, action, details, occurred_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [recipientId, actorDid, action, details, now],
        );
    }
}
