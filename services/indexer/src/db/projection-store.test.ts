import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    buildPhase3FixtureFirehoseEvents,
    recordNsid,
    type NormalizedFirehoseEvent,
} from '@patchwork/shared';
import { InMemoryCheckpointStore } from '../checkpoint.js';
import { runIndexerMigrations } from '../migrate.js';
import { IndexerPipeline } from '../pipeline.js';
import { PostgresDeadLetterStore } from './dead-letter-store.js';
import { PostgresProjectionStore } from './projection-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const createEvent = (overrides: Partial<NormalizedFirehoseEvent> = {}): NormalizedFirehoseEvent => ({
    eventId: '100:aid-post:create',
    seq: 100,
    action: 'create',
    uri: `at://did:plc:alice/${recordNsid.aidPost}/post-1`,
    collection: recordNsid.aidPost,
    authorDid: 'did:plc:alice',
    receivedAt: '2026-07-11T12:00:00.000Z',
    payload: {
        kind: 'aid-post',
        title: 'Food support needed',
        description: 'Shelf-stable groceries requested.',
        category: 'food',
        urgency: 'high',
        status: 'open',
        createdAt: '2026-07-11T11:00:00.000Z',
        updatedAt: '2026-07-11T11:00:00.000Z',
        searchableText: 'food support needed shelf stable groceries requested',
        approximateGeo: {
            latitude: 41.88,
            longitude: -87.63,
            precisionKm: 3,
        },
        trustScore: 0.5,
    },
    ...overrides,
});

describePostgres('PostgresProjectionStore', () => {
    const pool = new Pool({ connectionString: databaseUrl });

    beforeAll(async () => {
        await runIndexerMigrations({ pool });
    });

    beforeEach(async () => {
        await pool.query(
            'TRUNCATE indexer_projection_events, indexer_projection_tombstones, indexer_aid_post_projections, indexer_dead_letters',
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    it('persists a normalized aid-post projection with privacy-safe identity and geography', async () => {
        const store = new PostgresProjectionStore(pool);
        const event = createEvent();

        await store.apply(event);
        const projection = await store.get(event.uri);

        expect(projection).toMatchObject({
            uri: event.uri,
            collection: recordNsid.aidPost,
            title: 'Food support needed',
            category: 'food',
            urgency: 'high',
            status: 'open',
            latitude: 41.88,
            longitude: -87.63,
            precisionKm: 3,
            sourceCursor: 100,
        });
        expect(projection?.authorDidHash).toMatch(/^[a-f0-9]{64}$/);
        expect(projection?.authorDidHash).not.toBe('did:plc:alice');
        expect(projection).not.toHaveProperty('authorDid');
    });

    it('applies a newer update once and ignores stale revisions', async () => {
        const store = new PostgresProjectionStore(pool);
        const created = createEvent();
        const initialPayload = created.payload;
        if (initialPayload?.kind !== 'aid-post') {
            throw new Error('Expected aid-post fixture payload.');
        }
        await store.apply(created);
        const updated = createEvent({
            eventId: '110:aid-post:update',
            seq: 110,
            action: 'update',
            payload: {
                ...initialPayload,
                title: 'Updated food support request',
                updatedAt: '2026-07-11T12:10:00.000Z',
            },
        });
        await store.apply(updated);
        await store.apply(updated);
        await store.apply(
            createEvent({
                eventId: '105:aid-post:stale-update',
                seq: 105,
                action: 'update',
                payload: {
                    ...initialPayload,
                    title: 'Stale title',
                    updatedAt: '2026-07-11T12:05:00.000Z',
                },
            }),
        );

        expect(await store.get(created.uri)).toMatchObject({
            title: 'Updated food support request',
            sourceCursor: 110,
        });
        const ledger = await pool.query(
            'SELECT event_id FROM indexer_projection_events ORDER BY source_cursor',
        );
        expect(ledger.rows).toHaveLength(3);
    });

    it('removes a projection on delete and prevents stale replay resurrection', async () => {
        const store = new PostgresProjectionStore(pool);
        const created = createEvent();
        await store.apply(created);
        await store.apply(
            createEvent({
                eventId: '120:aid-post:delete',
                seq: 120,
                action: 'delete',
                payload: undefined,
                deleteReason: 'deleted-upstream',
            }),
        );
        await store.apply(
            createEvent({
                eventId: '110:aid-post:stale-replay',
                seq: 110,
            }),
        );

        expect(await store.get(created.uri)).toBeNull();
        const tombstone = await pool.query<{
            uri_hash: string;
            source_cursor: string;
        }>('SELECT uri_hash, source_cursor FROM indexer_projection_tombstones');
        expect(tombstone.rows).toEqual([
            {
                uri_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
                source_cursor: '120',
            },
        ]);
        expect(JSON.stringify(tombstone.rows)).not.toContain(created.uri);
    });

    it('quarantines invalid events with bounded diagnostics and no raw payload', async () => {
        const store = new PostgresDeadLetterStore(pool);
        await store.append({
            code: 'VALIDATION_FAILED',
            message:
                'Invalid record from did:plc:alice at at://did:plc:alice/app.patchwork.aid.post/private',
            seq: 130,
            rawEvent: {
                token: 'do-not-store',
                location: { latitude: 41.881234, longitude: -87.631234 },
            },
        });
        const letters = await store.list();

        expect(letters).toEqual([
            expect.objectContaining({
                failureCode: 'VALIDATION_FAILED',
                sourceCursor: 130,
                diagnostic:
                    'Invalid record from did:[redacted] at at://[redacted]',
            }),
        ]);
        expect(JSON.stringify(letters)).not.toContain('do-not-store');
        expect(JSON.stringify(letters)).not.toContain('41.881234');
    });

    it('writes live pipeline output to the durable projection store before checkpointing', async () => {
        const projectionStore = new PostgresProjectionStore(pool);
        const checkpointStore = new InMemoryCheckpointStore();
        const pipeline = new IndexerPipeline({
            checkpointStore,
            checkpointInterval: 1,
            projectionStore,
            deadLetterStore: new PostgresDeadLetterStore(pool),
        });
        const raw: Record<string, unknown> = {
            ...(buildPhase3FixtureFirehoseEvents()[0] as Record<string, unknown>),
            seq: 140,
        };

        await pipeline.ingestAndCheckpoint([raw]);

        const uri = String(raw.uri);
        expect(await projectionStore.get(uri)).toMatchObject({
            uri,
            sourceCursor: 140,
        });
        expect((await checkpointStore.load())?.cursor).toBe(140);
    });

    it('dead-letters an invalid record and advances its durable cursor', async () => {
        const checkpointStore = new InMemoryCheckpointStore();
        const deadLetterStore = new PostgresDeadLetterStore(pool);
        const pipeline = new IndexerPipeline({
            checkpointStore,
            checkpointInterval: 1,
            projectionStore: new PostgresProjectionStore(pool),
            deadLetterStore,
        });
        const raw = {
            ...(buildPhase3FixtureFirehoseEvents()[0] as Record<string, unknown>),
            seq: 150,
            record: {
                $type: recordNsid.aidPost,
                title: 'Missing required fields',
            },
        };

        const result = await pipeline.ingestAndCheckpoint([raw]);

        expect(result).toMatchObject({
            normalizedCount: 0,
            failureCount: 1,
            quarantinedCount: 1,
            checkpointSeq: 150,
        });
        expect(await deadLetterStore.list()).toHaveLength(1);
        expect((await checkpointStore.load())?.cursor).toBe(150);
    });

    it('rebuilds to the same ordered projection state from the event sequence', async () => {
        const store = new PostgresProjectionStore(pool);
        const first = createEvent();
        const second = createEvent({
            eventId: '200:aid-post-2:create',
            seq: 200,
            uri: `at://did:plc:bob/${recordNsid.aidPost}/post-2`,
            authorDid: 'did:plc:bob',
        });
        const events = [first, second];
        for (const event of events) await store.apply(event);
        const before = await store.list();

        await store.resetForRebuild();
        for (const event of events) await store.apply(event);

        expect(await store.list()).toEqual(before);
    });

    it('does not checkpoint a projection outage and succeeds on redelivery', async () => {
        const durableStore = new PostgresProjectionStore(pool);
        const checkpointStore = new InMemoryCheckpointStore();
        let unavailable = true;
        const pipeline = new IndexerPipeline({
            checkpointStore,
            checkpointInterval: 1,
            projectionStore: {
                apply: async event => {
                    if (unavailable) throw new Error('database unavailable');
                    await durableStore.apply(event);
                },
            },
            deadLetterStore: new PostgresDeadLetterStore(pool),
        });
        const raw: Record<string, unknown> = {
            ...(buildPhase3FixtureFirehoseEvents()[0] as Record<string, unknown>),
            seq: 160,
        };

        await expect(pipeline.ingestAndCheckpoint([raw])).rejects.toThrow(
            'database unavailable',
        );
        expect(await checkpointStore.load()).toBeNull();

        unavailable = false;
        await pipeline.ingestAndCheckpoint([raw]);
        expect(await durableStore.get(String(raw.uri))).toMatchObject({
            sourceCursor: 160,
        });
        expect((await checkpointStore.load())?.cursor).toBe(160);
    });
});
