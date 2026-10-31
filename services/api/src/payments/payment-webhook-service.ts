import type { Pool, PoolClient } from 'pg';
import {
    StripeApiError,
    type StripeEvent,
    type StripeGateway,
} from './stripe-gateway.js';

export type PaymentWebhookSource = 'platform' | 'connect';

export interface PaymentWebhookReceipt {
    eventId: string;
    source: PaymentWebhookSource;
    accountId?: string;
    type: string;
    livemode: boolean;
    /** Unix seconds from the signed payload. */
    created: number;
}

/**
 * Applies one re-fetched Stripe event inside the transaction that marks it
 * processed. Throwing rolls back both, and the event is retried.
 */
export type PaymentEventProcessor = (
    event: StripeEvent,
    client: PoolClient,
) => Promise<void>;

export interface PaymentWebhookSweepResult {
    claimed: number;
    processed: number;
    ignored: number;
    retried: number;
    deadLettered: number;
    /** Claimed rows another worker had already finished after a lock expired. */
    skipped: number;
}

export interface PaymentWebhookMetrics {
    pending: number;
    retrying: number;
    deadLetter: number;
    oldestPendingSeconds: number;
}

interface ClaimedRow {
    stripe_event_id: string;
    source: PaymentWebhookSource;
    stripe_account_id: string | null;
    event_type: string;
    livemode: boolean;
    attempts: number;
    stripe_created_at: Date;
}

const errorCodePattern = /^[A-Z0-9_]{1,80}$/u;

const errorCodeOf = (error: unknown): string => {
    if (error instanceof StripeApiError) return `STRIPE_${error.code}`;
    const code =
        error && typeof error === 'object' ?
            (error as { code?: unknown }).code
        :   undefined;
    return typeof code === 'string' && errorCodePattern.test(code) ?
            code
        :   'PROCESSOR_FAILED';
};

export class PaymentWebhookService {
    private readonly processors: ReadonlyMap<string, PaymentEventProcessor>;
    private readonly maxAttempts: number;
    private readonly lockMs: number;

    constructor(
        private readonly pool: Pool,
        private readonly gateway: Pick<StripeGateway, 'retrieveEvent'>,
        options: {
            processors?: ReadonlyMap<string, PaymentEventProcessor>;
            maxAttempts?: number;
            lockMs?: number;
        } = {},
    ) {
        this.processors = options.processors ?? new Map();
        this.maxAttempts = options.maxAttempts ?? 12;
        this.lockMs = options.lockMs ?? 60_000;
    }

    /** Record a verified delivery. Returns false for a duplicate event ID. */
    async receive(receipt: PaymentWebhookReceipt, now = new Date()): Promise<boolean> {
        const result = await this.pool.query(
            `INSERT INTO payment_webhook_events (
                stripe_event_id, source, stripe_account_id, event_type,
                livemode, stripe_created_at, received_at, status,
                next_attempt_at
            ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, 'pending', $7)
            ON CONFLICT (stripe_event_id) DO NOTHING`,
            [
                receipt.eventId,
                receipt.source,
                receipt.accountId ?? null,
                receipt.type,
                receipt.livemode,
                receipt.created,
                now,
            ],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async runSweep(limit = 25, now = new Date()): Promise<PaymentWebhookSweepResult> {
        const claimed = await this.pool.query<ClaimedRow>(
            `UPDATE payment_webhook_events
                SET locked_until = $1::timestamptz + ($3::int * INTERVAL '1 millisecond'),
                    attempts = attempts + 1
              WHERE stripe_event_id IN (
                    SELECT stripe_event_id FROM payment_webhook_events
                     WHERE status = 'pending'
                       AND next_attempt_at <= $1
                       AND (locked_until IS NULL OR locked_until <= $1)
                     ORDER BY stripe_created_at, received_at, stripe_event_id
                     LIMIT $2
                     FOR UPDATE SKIP LOCKED
              )
          RETURNING stripe_event_id, source, stripe_account_id, event_type,
                    livemode, attempts, stripe_created_at`,
            [now, limit, this.lockMs],
        );
        // RETURNING order is unspecified; apply events in Stripe creation order.
        const rows = [...claimed.rows].sort((left, right) =>
            left.stripe_created_at.getTime() - right.stripe_created_at.getTime() ||
            left.stripe_event_id.localeCompare(right.stripe_event_id),
        );
        const result: PaymentWebhookSweepResult = {
            claimed: rows.length,
            processed: 0,
            ignored: 0,
            retried: 0,
            deadLettered: 0,
            skipped: 0,
        };
        for (const row of rows) {
            const outcome = await this.processOne(row, now);
            result[outcome] += 1;
        }
        return result;
    }

    private async processOne(
        row: ClaimedRow,
        now: Date,
    ): Promise<'processed' | 'ignored' | 'retried' | 'deadLettered' | 'skipped'> {
        let event: StripeEvent;
        try {
            event = await this.gateway.retrieveEvent(
                row.stripe_event_id,
                row.stripe_account_id ?? undefined,
            );
        } catch (error) {
            const lostAccess = error instanceof StripeApiError
                && (error.code === 'UNAUTHORIZED' || error.code === 'NOT_FOUND');
            if (!(lostAccess && row.event_type === 'account.application.deauthorized' && row.stripe_account_id)) {
                const retryable = !(error instanceof StripeApiError) || error.retryable;
                return this.fail(row, now, errorCodeOf(error), retryable);
            }
            // A disconnected account's events can no longer be fetched. The
            // stored receipt came from a signature-verified delivery, and this
            // event needs nothing beyond its type and account.
            event = {
                id: row.stripe_event_id,
                type: row.event_type,
                livemode: row.livemode,
                created: Math.floor(new Date(row.stripe_created_at).getTime() / 1_000),
                account: row.stripe_account_id,
                data: { object: {} },
            };
        }
        if (
            event.id !== row.stripe_event_id ||
            event.type !== row.event_type ||
            event.livemode !== row.livemode ||
            (event.account ?? null) !== row.stripe_account_id
        ) {
            return this.fail(row, now, 'EVENT_MISMATCH', false);
        }
        const processor = this.processors.get(event.type);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const owned = await client.query(
                `SELECT 1 FROM payment_webhook_events
                  WHERE stripe_event_id = $1 AND status = 'pending'
                  FOR UPDATE`,
                [row.stripe_event_id],
            );
            if (owned.rowCount === 0) {
                await client.query('ROLLBACK');
                return 'skipped';
            }
            if (processor) await processor(event, client);
            await client.query(
                `UPDATE payment_webhook_events
                    SET status = $2, processed_at = $3, locked_until = NULL,
                        last_error_code = NULL
                  WHERE stripe_event_id = $1`,
                [row.stripe_event_id, processor ? 'processed' : 'ignored', now],
            );
            await client.query('COMMIT');
            return processor ? 'processed' : 'ignored';
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            return this.fail(row, now, errorCodeOf(error), true);
        } finally {
            client.release();
        }
    }

    private async fail(
        row: ClaimedRow,
        now: Date,
        code: string,
        retryable: boolean,
    ): Promise<'retried' | 'deadLettered'> {
        const deadLetter = !retryable || row.attempts >= this.maxAttempts;
        // 30s, 60s, 120s ... capped at six hours.
        const delayMs = Math.min(30_000 * 2 ** (row.attempts - 1), 6 * 60 * 60 * 1_000);
        await this.pool.query(
            `UPDATE payment_webhook_events
                SET status = $2, last_error_code = $3, locked_until = NULL,
                    next_attempt_at = $4
              WHERE stripe_event_id = $1 AND status = 'pending'`,
            [
                row.stripe_event_id,
                deadLetter ? 'dead-letter' : 'pending',
                code,
                new Date(now.getTime() + (deadLetter ? 0 : delayMs)),
            ],
        );
        return deadLetter ? 'deadLettered' : 'retried';
    }

    /** Return a dead-lettered event to the queue after an operator fixes the cause. */
    async requeue(eventId: string, now = new Date()): Promise<boolean> {
        const result = await this.pool.query(
            `UPDATE payment_webhook_events
                SET status = 'pending', attempts = 0, next_attempt_at = $2,
                    locked_until = NULL
              WHERE stripe_event_id = $1 AND status = 'dead-letter'`,
            [eventId, now],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async getOperatorMetrics(now = new Date()): Promise<PaymentWebhookMetrics> {
        const result = await this.pool.query<{
            pending: string;
            retrying: string;
            dead_letter: string;
            oldest_pending_seconds: string | null;
        }>(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE status = 'pending' AND attempts > 0) AS retrying,
                COUNT(*) FILTER (WHERE status = 'dead-letter') AS dead_letter,
                EXTRACT(EPOCH FROM ($1::timestamptz - MIN(received_at)
                    FILTER (WHERE status = 'pending'))) AS oldest_pending_seconds
             FROM payment_webhook_events`,
            [now],
        );
        const row = result.rows[0];
        return {
            pending: Number(row?.pending ?? 0),
            retrying: Number(row?.retrying ?? 0),
            deadLetter: Number(row?.dead_letter ?? 0),
            oldestPendingSeconds: Math.max(
                0,
                Math.floor(Number(row?.oldest_pending_seconds ?? 0)),
            ),
        };
    }
}
