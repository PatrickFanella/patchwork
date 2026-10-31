import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export type PaymentModerationErrorCode =
    | 'INVALID_MODERATION_REQUEST'
    | 'PAYMENT_RECIPIENT_NOT_FOUND'
    | 'PAYMENT_RECIPIENT_CLOSED'
    | 'PAYMENT_RECIPIENT_NOT_SUSPENDED';

export class PaymentModerationError extends Error {
    constructor(readonly code: PaymentModerationErrorCode) {
        super(code);
        this.name = 'PaymentModerationError';
    }
}

export interface ModeratedRecipient {
    recipientId: string;
    organizationId: string | null;
    displayName: string;
    status: 'onboarding' | 'active' | 'suspended' | 'closed';
    chargesEnabled: boolean;
    suspensionReason: string | null;
    activeMonthlyGifts: number;
    updatedAt: string;
}

const commandSchema = z.strictObject({
    recipientId: z.uuid(),
    reason: z.string().trim().min(1).max(2_000),
});

interface RecipientRow {
    recipient_id: string;
    organization_id: string | null;
    display_name: string;
    status: ModeratedRecipient['status'];
    charges_enabled: boolean;
    suspension_reason: string | null;
    active_monthly_gifts: number;
    updated_at: Date;
}

const toRecipient = (row: RecipientRow): ModeratedRecipient => ({
    recipientId: row.recipient_id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    status: row.status,
    chargesEnabled: row.charges_enabled,
    suspensionReason: row.suspension_reason,
    activeMonthlyGifts: row.active_monthly_gifts,
    updatedAt: row.updated_at.toISOString(),
});

const recipientSelect = `
    SELECT r.recipient_id, r.organization_id, r.display_name, r.status, r.charges_enabled,
           r.suspension_reason, r.updated_at,
           (SELECT COUNT(*)::int FROM supporter_subscriptions s
             WHERE s.recipient_id = r.recipient_id
               AND s.status IN ('active', 'trialing', 'past_due')
               AND s.paused_reason IS NULL) AS active_monthly_gifts
      FROM payment_recipients r`;

/**
 * Moderator switch for organization fundraising. Suspension blocks new
 * gifts at once; the eligibility sweep then pauses monthly gifts and tells
 * their donors. Restoring does not resume paused gifts.
 */
export class PaymentModerationService {
    constructor(private readonly pool: Pool) {}

    async listRecipients(): Promise<ModeratedRecipient[]> {
        const result = await this.pool.query<RecipientRow>(
            `${recipientSelect}
              WHERE r.kind = 'organization' AND r.status <> 'closed'
              ORDER BY r.status = 'suspended' DESC, r.display_name, r.recipient_id
              LIMIT 500`,
        );
        return result.rows.map(toRecipient);
    }

    async suspend(actorDid: string, body: unknown, now = new Date()): Promise<ModeratedRecipient> {
        return this.change(actorDid, body, now, 'suspend');
    }

    async restore(actorDid: string, body: unknown, now = new Date()): Promise<ModeratedRecipient> {
        return this.change(actorDid, body, now, 'restore');
    }

    private async change(
        actorDid: string,
        body: unknown,
        now: Date,
        action: 'suspend' | 'restore',
    ): Promise<ModeratedRecipient> {
        const parsed = commandSchema.safeParse(body);
        if (!parsed.success) throw new PaymentModerationError('INVALID_MODERATION_REQUEST');
        const { recipientId, reason } = parsed.data;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const current = (await client.query<{
                status: ModeratedRecipient['status'];
                charges_enabled: boolean;
                stripe_account_id: string | null;
            }>(
                `SELECT status, charges_enabled, stripe_account_id FROM payment_recipients
                  WHERE recipient_id = $1 AND kind = 'organization' FOR UPDATE`,
                [recipientId],
            )).rows[0];
            if (!current) throw new PaymentModerationError('PAYMENT_RECIPIENT_NOT_FOUND');
            if (current.status === 'closed') throw new PaymentModerationError('PAYMENT_RECIPIENT_CLOSED');
            if (action === 'restore' && current.status !== 'suspended') {
                throw new PaymentModerationError('PAYMENT_RECIPIENT_NOT_SUSPENDED');
            }
            // Suspending twice keeps the first decision and records nothing new.
            if (action === 'suspend' && current.status !== 'suspended') {
                await client.query(
                    `UPDATE payment_recipients
                        SET status = 'suspended', suspension_reason = $2, suspended_by_did = $3,
                            updated_at = $4
                      WHERE recipient_id = $1`,
                    [recipientId, reason, actorDid, now],
                );
                await this.audit(client, recipientId, actorDid, 'recipient-suspended',
                    { reason, previousStatus: current.status }, now);
            }
            if (action === 'restore') {
                const restored = current.charges_enabled && current.stripe_account_id ? 'active' : 'onboarding';
                await client.query(
                    `UPDATE payment_recipients
                        SET status = $2, suspension_reason = NULL, suspended_by_did = NULL,
                            updated_at = $3
                      WHERE recipient_id = $1`,
                    [recipientId, restored, now],
                );
                await this.audit(client, recipientId, actorDid, 'recipient-restored',
                    { reason, restoredStatus: restored }, now);
            }
            const row = (await client.query<RecipientRow>(
                `${recipientSelect} WHERE r.recipient_id = $1`,
                [recipientId],
            )).rows[0]!;
            await client.query('COMMIT');
            return toRecipient(row);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async audit(
        client: PoolClient,
        recipientId: string,
        actorDid: string,
        action: string,
        details: Record<string, unknown>,
        now: Date,
    ): Promise<void> {
        await client.query(
            `INSERT INTO payment_audit_events (recipient_id, actor_did, action, details, occurred_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [recipientId, actorDid, action, details, now],
        );
    }
}
