import type { Pool } from 'pg';
import { StripeApiError, type StripeGateway } from './stripe-gateway.js';

/**
 * How long payment records are kept. Placeholder until the owner and counsel
 * set the accounting retention period (plan step 0); the privacy policy must
 * state the same period.
 */
export const PAYMENT_RECORD_RETENTION_YEARS = 7;
/** Abandoned Checkout attempts and settled webhook receipts are short-lived. */
const SHORT_RETENTION_DAYS = 90;
const COMMAND_MAX_ATTEMPTS = 10;
const COMMAND_LEASE_MS = 5 * 60_000;

export interface PaymentCommandSweepResult {
    completed: number;
    retried: number;
    deadLettered: number;
}

export interface PaymentRetentionResult {
    donations: number;
    subscriptions: number;
    checkoutSessions: number;
    webhookEvents: number;
    auditEvents: number;
    commands: number;
}

export interface PaymentLifecycleMetrics {
    pendingCommands: number;
    oldestPendingCommandSeconds: number;
    deadLetterCommands: number;
}

const backoffMs = (attempts: number): number =>
    Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60_000);

const yearsBefore = (now: Date, years: number): Date => {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    return cutoff;
};

export class PaymentLifecycleService {
    constructor(
        private readonly pool: Pool,
        /** Absent when Stripe is not configured; commands then wait in the queue. */
        private readonly gateway?: Pick<StripeGateway, 'cancelSubscriptionAtPeriodEnd'>,
    ) {}

    /**
     * Send queued Stripe commands. Each command is leased before Stripe is
     * called, and the Stripe idempotency key is fixed per subscription, so a
     * crash between the call and the update repeats the call harmlessly.
     */
    async runCommandSweep(limit = 25, now = new Date()): Promise<PaymentCommandSweepResult> {
        const result: PaymentCommandSweepResult = { completed: 0, retried: 0, deadLettered: 0 };
        const gateway = this.gateway;
        if (!gateway) return result;
        const claimed = await this.pool.query<{
            command_id: string;
            subscription_id: string;
            stripe_subscription_id: string;
            stripe_account_id: string | null;
            attempts: number;
            created_at: Date;
        }>(
            `UPDATE payment_commands c
                SET next_attempt_at = $2::timestamptz + ($3::int * INTERVAL '1 millisecond')
               FROM supporter_subscriptions s
               JOIN payment_recipients r ON r.recipient_id = s.recipient_id
              WHERE c.subscription_id = s.subscription_id
                AND c.command_id IN (
                    SELECT command_id FROM payment_commands
                     WHERE status = 'pending' AND next_attempt_at <= $2
                     ORDER BY next_attempt_at, created_at
                     LIMIT $1
                     FOR UPDATE SKIP LOCKED
                )
             RETURNING c.command_id, c.subscription_id, s.stripe_subscription_id,
                       r.stripe_account_id, c.attempts, c.created_at`,
            [limit, now, COMMAND_LEASE_MS],
        );
        // UPDATE ... RETURNING does not keep the subquery's order.
        const commands = claimed.rows.sort((left, right) => left.created_at.getTime() - right.created_at.getTime());
        for (const command of commands) {
            try {
                await gateway.cancelSubscriptionAtPeriodEnd(
                    command.stripe_subscription_id,
                    `patchwork-cancel-${command.subscription_id}`,
                    command.stripe_account_id ? { accountId: command.stripe_account_id } : {},
                );
                await this.complete(command.command_id, command.subscription_id, now);
                result.completed += 1;
            } catch (error) {
                const stripe = error instanceof StripeApiError ? error : undefined;
                if (stripe?.code === 'NOT_FOUND') {
                    // Nothing left to cancel in Stripe.
                    await this.complete(command.command_id, command.subscription_id, now);
                    result.completed += 1;
                    continue;
                }
                const attempts = command.attempts + 1;
                const deadLetter = !stripe?.retryable || attempts >= COMMAND_MAX_ATTEMPTS;
                await this.pool.query(
                    `UPDATE payment_commands
                        SET attempts = $2, last_error_code = $3,
                            status = CASE WHEN $4 THEN 'dead-letter' ELSE 'pending' END,
                            next_attempt_at = $5
                      WHERE command_id = $1`,
                    [
                        command.command_id, attempts, stripe?.code ?? 'INTERNAL_ERROR', deadLetter,
                        new Date(now.getTime() + backoffMs(attempts)),
                    ],
                );
                if (deadLetter) result.deadLettered += 1;
                else result.retried += 1;
            }
        }
        return result;
    }

    /** Return dead-lettered commands to the queue after the cause is fixed. */
    async requeueCommands(now = new Date()): Promise<number> {
        const result = await this.pool.query(
            `UPDATE payment_commands SET status = 'pending', attempts = 0, next_attempt_at = $1
              WHERE status = 'dead-letter'`,
            [now],
        );
        return result.rowCount ?? 0;
    }

    private async complete(commandId: string, subscriptionId: string, now: Date): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE payment_commands SET status = 'done', completed_at = $2, last_error_code = NULL
                  WHERE command_id = $1`,
                [commandId, now],
            );
            await client.query(
                `UPDATE supporter_subscriptions SET cancel_at_period_end = TRUE, updated_at = $2
                  WHERE subscription_id = $1 AND status NOT IN ('canceled', 'incomplete_expired')`,
                [subscriptionId, now],
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete payment records past the retention period. Ended subscriptions
     * age from their last change, gifts from their creation.
     */
    async runRetention(now = new Date()): Promise<PaymentRetentionResult> {
        const cutoff = yearsBefore(now, PAYMENT_RECORD_RETENTION_YEARS);
        const shortCutoff = new Date(now.getTime() - SHORT_RETENTION_DAYS * 24 * 60 * 60_000);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const expiredSubscriptions = `SELECT subscription_id FROM supporter_subscriptions
                WHERE status IN ('canceled', 'incomplete_expired') AND updated_at <= $1`;
            const commands = await client.query(
                `DELETE FROM payment_commands
                  WHERE subscription_id IN (${expiredSubscriptions})
                     OR (status = 'done' AND completed_at <= $2)`,
                [cutoff, shortCutoff],
            );
            const subscriptions = await client.query(
                `DELETE FROM supporter_subscriptions WHERE subscription_id IN (${expiredSubscriptions})`,
                [cutoff],
            );
            const donations = await client.query(
                'DELETE FROM donations WHERE created_at <= $1',
                [cutoff],
            );
            const checkoutSessions = await client.query(
                `DELETE FROM payment_checkout_sessions c
                  WHERE NOT EXISTS (
                        SELECT 1 FROM supporter_subscriptions s WHERE s.checkout_id = c.checkout_id
                    )
                    AND (
                        (c.status <> 'complete' AND c.updated_at <= $2)
                        OR c.updated_at <= $1
                    )`,
                [cutoff, shortCutoff],
            );
            const webhookEvents = await client.query(
                `DELETE FROM payment_webhook_events
                  WHERE status IN ('processed', 'ignored') AND processed_at <= $1`,
                [shortCutoff],
            );
            const auditEvents = await client.query(
                'DELETE FROM payment_audit_events WHERE occurred_at <= $1',
                [cutoff],
            );
            await client.query('COMMIT');
            return {
                donations: donations.rowCount ?? 0,
                subscriptions: subscriptions.rowCount ?? 0,
                checkoutSessions: checkoutSessions.rowCount ?? 0,
                webhookEvents: webhookEvents.rowCount ?? 0,
                auditEvents: auditEvents.rowCount ?? 0,
                commands: commands.rowCount ?? 0,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getOperatorMetrics(now = new Date()): Promise<PaymentLifecycleMetrics> {
        const result = await this.pool.query<{
            pending: number;
            oldest: Date | null;
            dead_letter: number;
        }>(
            `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                    MIN(created_at) FILTER (WHERE status = 'pending') AS oldest,
                    COUNT(*) FILTER (WHERE status = 'dead-letter')::int AS dead_letter
               FROM payment_commands`,
        );
        const row = result.rows[0];
        return {
            pendingCommands: row?.pending ?? 0,
            oldestPendingCommandSeconds:
                row?.oldest ? Math.max(0, Math.floor((now.getTime() - new Date(row.oldest).getTime()) / 1_000)) : 0,
            deadLetterCommands: row?.dead_letter ?? 0,
        };
    }
}
