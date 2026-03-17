import { vi, describe, it, expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { NormalizedFirehoseEvent } from '@patchwork/shared';
import {
    toNormalizedFirehoseEvent,
    loadDiscoveryEvents,
    appendDiscoveryEvents,
    replaceDiscoveryEvents,
} from './discovery-events.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal db row that satisfies the DiscoveryEventRow shape. */
const sampleRow = {
    event_id: 'event-1',
    seq: '42',
    action: 'create' as const,
    uri: 'at://did:plc:abc/app.patchwork.aid.post/rec1',
    collection: 'app.patchwork.aid.post' as const,
    author_did: 'did:plc:abc',
    received_at: '2026-01-01T00:00:00.000Z',
    payload: null,
    delete_reason: null,
};

const sampleEvent: NormalizedFirehoseEvent = {
    eventId: 'event-1',
    seq: 42,
    action: 'create',
    uri: 'at://did:plc:abc/app.patchwork.aid.post/rec1',
    collection: 'app.patchwork.aid.post',
    authorDid: 'did:plc:abc',
    receivedAt: '2026-01-01T00:00:00.000Z',
};

/** Creates a mock pool with only a `query` method (used by loadDiscoveryEvents). */
const makeQueryPool = (query: ReturnType<typeof vi.fn>): Pool =>
    ({ query } as unknown as Pool);

/** Creates a mock pool with a `connect` method returning a mock client. */
const makeClientPool = () => {
    const clientQuery = vi.fn();
    const release = vi.fn();
    const connect = vi
        .fn()
        .mockResolvedValue({ query: clientQuery, release } as unknown as PoolClient);
    return { pool: { connect } as unknown as Pool, clientQuery, release };
};

// ---------------------------------------------------------------------------
// toNormalizedFirehoseEvent
// ---------------------------------------------------------------------------

describe('toNormalizedFirehoseEvent', () => {
    it('maps snake_case db row fields to camelCase NormalizedFirehoseEvent', () => {
        const result = toNormalizedFirehoseEvent(sampleRow);
        expect(result).toStrictEqual({
            eventId: 'event-1',
            seq: 42,
            action: 'create',
            uri: 'at://did:plc:abc/app.patchwork.aid.post/rec1',
            collection: 'app.patchwork.aid.post',
            authorDid: 'did:plc:abc',
            receivedAt: '2026-01-01T00:00:00.000Z',
            payload: undefined,
            deleteReason: undefined,
        });
    });

    it('coerces a string seq value to a number', () => {
        expect(toNormalizedFirehoseEvent({ ...sampleRow, seq: '99' }).seq).toBe(99);
    });

    it('converts null payload to undefined', () => {
        expect(
            toNormalizedFirehoseEvent({ ...sampleRow, payload: null }).payload,
        ).toBeUndefined();
    });

    it('converts null delete_reason to undefined', () => {
        expect(
            toNormalizedFirehoseEvent({ ...sampleRow, delete_reason: null }).deleteReason,
        ).toBeUndefined();
    });

    it('preserves a non-null delete_reason string', () => {
        expect(
            toNormalizedFirehoseEvent({ ...sampleRow, delete_reason: 'tombstone' })
                .deleteReason,
        ).toBe('tombstone');
    });

    it('converts a Date received_at to an ISO string', () => {
        const date = new Date('2026-06-15T12:00:00.000Z');
        expect(
            toNormalizedFirehoseEvent({ ...sampleRow, received_at: date }).receivedAt,
        ).toBe('2026-06-15T12:00:00.000Z');
    });
});

// ---------------------------------------------------------------------------
// loadDiscoveryEvents
// ---------------------------------------------------------------------------

describe('loadDiscoveryEvents', () => {
    it('returns events mapped from the returned db rows', async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [] }) // ensureTable
            .mockResolvedValueOnce({ rows: [sampleRow] }); // SELECT
        const events = await loadDiscoveryEvents(makeQueryPool(query));
        expect(events).toHaveLength(1);
        expect(events[0]?.eventId).toBe('event-1');
    });

    it('returns an empty array when the table has no rows', async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const events = await loadDiscoveryEvents(makeQueryPool(query));
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// appendDiscoveryEvents
// ---------------------------------------------------------------------------

describe('appendDiscoveryEvents', () => {
    it('wraps inserts in a transaction and releases the client', async () => {
        const { pool, clientQuery, release } = makeClientPool();
        clientQuery.mockResolvedValue({ rows: [] });
        await appendDiscoveryEvents(pool, [sampleEvent]);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const calls: string[] = clientQuery.mock.calls.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any[]) => String(c[0]),
        );
        expect(calls[0]).toBe('BEGIN');
        expect(calls.some(s => s.includes('CREATE TABLE'))).toBe(true);
        expect(calls.some(s => s.includes('UNNEST'))).toBe(true);
        expect(calls.at(-1)).toBe('COMMIT');
        expect(release).toHaveBeenCalled();
    });

    it('skips the batch upsert for an empty event list', async () => {
        const { pool, clientQuery, release } = makeClientPool();
        clientQuery.mockResolvedValue({ rows: [] });
        await appendDiscoveryEvents(pool, []);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const calls: string[] = clientQuery.mock.calls.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any[]) => String(c[0]),
        );
        expect(calls.some(s => s.includes('UNNEST'))).toBe(false);
        expect(release).toHaveBeenCalled();
    });

    it('rolls back and rethrows when a query fails', async () => {
        const { pool, clientQuery, release } = makeClientPool();
        clientQuery
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockRejectedValueOnce(new Error('db error'));
        await expect(appendDiscoveryEvents(pool, [sampleEvent])).rejects.toThrow('db error');

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const calls: string[] = clientQuery.mock.calls.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any[]) => String(c[0]),
        );
        expect(calls).toContain('ROLLBACK');
        expect(release).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// replaceDiscoveryEvents
// ---------------------------------------------------------------------------

describe('replaceDiscoveryEvents', () => {
    it('truncates the table before upserting within a transaction', async () => {
        const { pool, clientQuery, release } = makeClientPool();
        clientQuery.mockResolvedValue({ rows: [] });
        await replaceDiscoveryEvents(pool, [sampleEvent]);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const calls: string[] = clientQuery.mock.calls.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any[]) => String(c[0]),
        );
        const truncateIdx = calls.findIndex(s => s.includes('TRUNCATE'));
        const upsertIdx = calls.findIndex(s => s.includes('UNNEST'));
        expect(truncateIdx).toBeGreaterThan(-1);
        expect(upsertIdx).toBeGreaterThan(truncateIdx);
        expect(release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on error', async () => {
        const { pool, clientQuery, release } = makeClientPool();
        clientQuery
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
            .mockRejectedValueOnce(new Error('truncate failed'));
        await expect(replaceDiscoveryEvents(pool, [sampleEvent])).rejects.toThrow(
            'truncate failed',
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const calls: string[] = clientQuery.mock.calls.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any[]) => String(c[0]),
        );
        expect(calls).toContain('ROLLBACK');
        expect(release).toHaveBeenCalled();
    });
});
