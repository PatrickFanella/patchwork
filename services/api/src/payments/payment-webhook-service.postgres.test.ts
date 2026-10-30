import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PaymentWebhookService,
    type PaymentEventProcessor,
    type PaymentWebhookReceipt,
} from './payment-webhook-service.js';
import { StripeApiError, type StripeEvent, type StripeGateway } from './stripe-gateway.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

const migration = (name: string) =>
    readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');

const receipt = (
    eventId: string,
    overrides: Partial<PaymentWebhookReceipt> = {},
): PaymentWebhookReceipt => ({
    eventId,
    source: 'platform',
    type: 'invoice.paid',
    livemode: false,
    created: 1_793_400_000,
    ...overrides,
});

const stripeEvent = (from: PaymentWebhookReceipt, object: Record<string, unknown> = {}): StripeEvent => ({
    id: from.eventId,
    type: from.type,
    livemode: from.livemode,
    created: from.created,
    ...(from.accountId ? { account: from.accountId } : {}),
    data: { object: { id: `in_${from.eventId.slice(4)}`, ...object } },
});

describe('PaymentWebhookService', () => {
    const schema = `payments_${randomUUID().replaceAll('-', '')}`;
    const adminPool = new Pool({ connectionString: databaseUrl });
    const pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
    });
    const stripeEvents = new Map<string, StripeEvent | Error>();
    const retrieveEvent = vi.fn<StripeGateway['retrieveEvent']>(async eventId => {
        const found = stripeEvents.get(eventId);
        if (!found) throw new StripeApiError('NOT_FOUND', false);
        if (found instanceof Error) throw found;
        return found;
    });
    const gateway: StripeGateway = { retrieveEvent };
    const at = (iso: string) => new Date(iso);

    const deliver = async (
        service: PaymentWebhookService,
        delivered: PaymentWebhookReceipt,
        object: Record<string, unknown> = {},
        now = at('2026-10-30T12:00:00.000Z'),
    ) => {
        stripeEvents.set(delivered.eventId, stripeEvent(delivered, object));
        return service.receive(delivered, now);
    };

    const state = async (eventId: string) =>
        (
            await pool.query<{
                status: string;
                attempts: number;
                last_error_code: string | null;
                next_attempt_at: Date;
                processed_at: Date | null;
            }>(
                `SELECT status, attempts, last_error_code, next_attempt_at, processed_at
                   FROM payment_webhook_events WHERE stripe_event_id = $1`,
                [eventId],
            )
        ).rows[0];

    beforeAll(async () => {
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        await pool.query(await migration('0016_organizations_and_stewardship.sql'));
        await pool.query(await migration('0040_donations_and_supporter_tiers.sql'));
        await pool.query(
            'CREATE TABLE applied_invoices (invoice_id TEXT PRIMARY KEY, event_id TEXT NOT NULL)',
        );
    });

    afterAll(async () => {
        await pool.end();
        await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
        await adminPool.end();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE payment_webhook_events, applied_invoices');
        stripeEvents.clear();
        retrieveEvent.mockClear();
    });

    const recordInvoice: PaymentEventProcessor = async (event, client) => {
        await client.query(
            'INSERT INTO applied_invoices (invoice_id, event_id) VALUES ($1, $2)',
            [event.data.object['id'], event.id],
        );
    };

    it('seeds exactly one general-fund recipient', async () => {
        const recipients = await pool.query(
            "SELECT recipient_id, status FROM payment_recipients WHERE kind = 'general-fund'",
        );
        expect(recipients.rows).toEqual([
            { recipient_id: '00000000-0000-4000-8000-000000000001', status: 'active' },
        ]);
        await expect(pool.query(
            `INSERT INTO payment_recipients (recipient_id, kind, display_name, status, created_at, updated_at)
             VALUES ($1, 'general-fund', 'Second fund', 'active', NOW(), NOW())`,
            [randomUUID()],
        )).rejects.toThrow(/idx_payment_recipients_one_general_fund/);
    });

    it('records each Stripe event once and stores no payload', async () => {
        const service = new PaymentWebhookService(pool, gateway);
        expect(await service.receive(receipt('evt_1Once'))).toBe(true);
        expect(await service.receive(receipt('evt_1Once'))).toBe(false);
        const rows = await pool.query('SELECT * FROM payment_webhook_events');
        expect(rows.rowCount).toBe(1);
        expect(Object.keys(rows.rows[0]).sort()).toEqual([
            'attempts', 'event_type', 'last_error_code', 'livemode', 'locked_until',
            'next_attempt_at', 'processed_at', 'received_at', 'source',
            'status', 'stripe_account_id', 'stripe_created_at', 'stripe_event_id',
        ]);
    });

    it('applies re-fetched events in Stripe creation order and ignores unhandled types', async () => {
        const order: string[] = [];
        const service = new PaymentWebhookService(pool, gateway, {
            processors: new Map([[
                'invoice.paid',
                async (event, client) => {
                    order.push(event.id);
                    await recordInvoice(event, client);
                },
            ]]),
        });
        await deliver(service, receipt('evt_1Later', { created: 1_793_400_100 }));
        await deliver(service, receipt('evt_1Earlier', { created: 1_793_400_000 }));
        await deliver(service, receipt('evt_1Unhandled', { type: 'customer.created' }));

        const result = await service.runSweep(10, at('2026-10-30T12:00:01.000Z'));
        expect(result).toMatchObject({ claimed: 3, processed: 2, ignored: 1, retried: 0, deadLettered: 0 });
        expect(order).toEqual(['evt_1Earlier', 'evt_1Later']);
        expect((await state('evt_1Unhandled'))?.status).toBe('ignored');
        expect((await state('evt_1Later'))?.processed_at).toBeInstanceOf(Date);

        expect(await service.runSweep(10, at('2026-10-30T12:05:00.000Z'))).toMatchObject({ claimed: 0 });
        expect(order).toHaveLength(2);
    });

    it('fetches Connect events from the delivering account', async () => {
        const service = new PaymentWebhookService(pool, gateway);
        await deliver(service, receipt('evt_1Connect', {
            source: 'connect',
            accountId: 'acct_1Org',
            type: 'account.updated',
        }));
        await service.runSweep(10, at('2026-10-30T12:00:01.000Z'));
        expect(retrieveEvent).toHaveBeenCalledWith('evt_1Connect', 'acct_1Org');
        expect((await state('evt_1Connect'))?.status).toBe('ignored');
    });

    it('dead-letters an event whose fetched copy disagrees with the signed delivery', async () => {
        const processor = vi.fn(recordInvoice);
        const service = new PaymentWebhookService(pool, gateway, {
            processors: new Map([['invoice.paid', processor]]),
        });
        const delivered = receipt('evt_1Conflict');
        await service.receive(delivered, at('2026-10-30T12:00:00.000Z'));
        stripeEvents.set('evt_1Conflict', { ...stripeEvent(delivered), type: 'invoice.payment_failed' });
        const accountSwap = receipt('evt_1AccountSwap', { source: 'connect', accountId: 'acct_1Org' });
        await service.receive(accountSwap, at('2026-10-30T12:00:00.000Z'));
        stripeEvents.set('evt_1AccountSwap', { ...stripeEvent(accountSwap), account: 'acct_1Other' });

        expect(await service.runSweep(10, at('2026-10-30T12:00:01.000Z'))).toMatchObject({ deadLettered: 2 });
        expect(await state('evt_1Conflict')).toMatchObject({
            status: 'dead-letter',
            last_error_code: 'EVENT_MISMATCH',
        });
        expect(processor).not.toHaveBeenCalled();
    });

    it('rolls back processor writes on failure and retries with backoff', async () => {
        let failures = 1;
        const service = new PaymentWebhookService(pool, gateway, {
            processors: new Map([[
                'invoice.paid',
                async (event, client) => {
                    await recordInvoice(event, client);
                    if (failures-- > 0) {
                        throw Object.assign(new Error('transient'), { code: 'LEDGER_BUSY' });
                    }
                },
            ]]),
        });
        await deliver(service, receipt('evt_1Retry'));
        expect(await service.runSweep(10, at('2026-10-30T12:00:00.000Z'))).toMatchObject({ retried: 1 });
        expect((await pool.query('SELECT * FROM applied_invoices')).rowCount).toBe(0);
        const retried = await state('evt_1Retry');
        expect(retried).toMatchObject({ status: 'pending', attempts: 1, last_error_code: 'LEDGER_BUSY' });
        expect(retried?.next_attempt_at.toISOString()).toBe('2026-10-30T12:00:30.000Z');

        expect(await service.runSweep(10, at('2026-10-30T12:00:29.000Z'))).toMatchObject({ claimed: 0 });
        expect(await service.runSweep(10, at('2026-10-30T12:00:30.000Z'))).toMatchObject({ processed: 1 });
        expect((await pool.query('SELECT event_id FROM applied_invoices')).rows).toEqual([
            { event_id: 'evt_1Retry' },
        ]);
        expect(await state('evt_1Retry')).toMatchObject({ status: 'processed', last_error_code: null });
    });

    it('retries Stripe outages, dead-letters missing events and exhausted retries, and requeues', async () => {
        const service = new PaymentWebhookService(pool, gateway, { maxAttempts: 2 });
        await service.receive(receipt('evt_1Outage'), at('2026-10-30T12:00:00.000Z'));
        stripeEvents.set('evt_1Outage', new StripeApiError('UNAVAILABLE', true));
        await service.receive(receipt('evt_1Missing'), at('2026-10-30T12:00:00.000Z'));

        expect(await service.runSweep(10, at('2026-10-30T12:00:00.000Z'))).toMatchObject({
            retried: 1,
            deadLettered: 1,
        });
        expect(await state('evt_1Missing')).toMatchObject({
            status: 'dead-letter',
            last_error_code: 'STRIPE_NOT_FOUND',
        });
        expect(await service.runSweep(10, at('2026-10-30T12:01:00.000Z'))).toMatchObject({ deadLettered: 1 });
        expect(await state('evt_1Outage')).toMatchObject({
            status: 'dead-letter',
            attempts: 2,
            last_error_code: 'STRIPE_UNAVAILABLE',
        });

        stripeEvents.set('evt_1Outage', stripeEvent(receipt('evt_1Outage')));
        expect(await service.requeue('evt_1Outage', at('2026-10-30T13:00:00.000Z'))).toBe(true);
        expect(await service.requeue('evt_1Outage', at('2026-10-30T13:00:00.000Z'))).toBe(false);
        expect(await service.runSweep(10, at('2026-10-30T13:00:00.000Z'))).toMatchObject({ ignored: 1 });
    });

    it('replays pending events after a restart and recovers abandoned locks', async () => {
        const first = new PaymentWebhookService(pool, gateway);
        await deliver(first, receipt('evt_1BeforeRestart'));
        await deliver(first, receipt('evt_1Abandoned'));
        // A worker claimed this event and then stopped before finishing.
        await pool.query(
            `UPDATE payment_webhook_events
                SET attempts = 1, locked_until = '2026-10-30T12:01:00.000Z'
              WHERE stripe_event_id = 'evt_1Abandoned'`,
        );

        const restarted = new PaymentWebhookService(pool, gateway, {
            processors: new Map([['invoice.paid', recordInvoice]]),
        });
        expect(await restarted.runSweep(10, at('2026-10-30T12:00:30.000Z'))).toMatchObject({
            claimed: 1,
            processed: 1,
        });
        expect(await restarted.runSweep(10, at('2026-10-30T12:01:00.000Z'))).toMatchObject({
            claimed: 1,
            processed: 1,
        });
        expect(await state('evt_1Abandoned')).toMatchObject({ status: 'processed', attempts: 2 });
    });

    it('applies each event once when sweeps run concurrently', async () => {
        const service = new PaymentWebhookService(pool, gateway, {
            processors: new Map([['invoice.paid', recordInvoice]]),
        });
        for (let index = 0; index < 12; index += 1) {
            await deliver(service, receipt(`evt_1Concurrent${index}`, { created: 1_793_400_000 + index }));
        }
        const now = at('2026-10-30T12:00:01.000Z');
        const results = await Promise.all([
            service.runSweep(5, now),
            service.runSweep(5, now),
            service.runSweep(5, now),
        ]);
        expect(results.reduce((total, result) => total + result.processed, 0)).toBe(12);
        expect((await pool.query('SELECT 1 FROM applied_invoices')).rowCount).toBe(12);
        expect(retrieveEvent).toHaveBeenCalledTimes(12);
    });

    it('reports pending, retrying, and dead-letter counts for alerting', async () => {
        const service = new PaymentWebhookService(pool, gateway);
        await service.receive(receipt('evt_1Waiting'), at('2026-10-30T12:00:00.000Z'));
        await service.receive(receipt('evt_1Dead'), at('2026-10-30T12:00:00.000Z'));
        await service.receive(receipt('evt_1Retrying'), at('2026-10-30T12:10:00.000Z'));
        await pool.query(`UPDATE payment_webhook_events SET status = 'dead-letter' WHERE stripe_event_id = 'evt_1Dead'`);
        await pool.query(`UPDATE payment_webhook_events SET attempts = 2 WHERE stripe_event_id = 'evt_1Retrying'`);
        expect(await service.getOperatorMetrics(at('2026-10-30T12:20:00.000Z'))).toEqual({
            pending: 2,
            retrying: 1,
            deadLetter: 1,
            oldestPendingSeconds: 1_200,
        });
    });
});
