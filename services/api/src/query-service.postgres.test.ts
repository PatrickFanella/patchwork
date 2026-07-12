import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordNsid } from '@patchwork/shared';
import { PostgresProjectionQueryService } from './query-service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('PostgresProjectionQueryService', () => {
    const pool = new Pool({ connectionString: databaseUrl });

    beforeAll(async () => {
        const schema = await pool.query<{ table_name: string | null }>(
            `SELECT to_regclass('indexer_aid_post_projections')::TEXT AS table_name`,
        );
        if (!schema.rows[0]?.table_name) {
            throw new Error('Indexer projection migrations are required.');
        }
    });

    beforeEach(async () => {
        await pool.query(
            'TRUNCATE indexer_projection_events, indexer_projection_tombstones, indexer_aid_post_projections, indexer_dead_letters',
        );
        const now = new Date();
        await pool.query(
            `INSERT INTO indexer_projection_state (
                singleton, latest_cursor, heartbeat_at
             ) VALUES (TRUE, 102, $1)
             ON CONFLICT (singleton) DO UPDATE SET
                latest_cursor = EXCLUDED.latest_cursor,
                heartbeat_at = EXCLUDED.heartbeat_at`,
            [now],
        );
        await pool.query(
            `INSERT INTO indexer_aid_post_projections (
                uri, collection, cid, revision, author_did_hash, title,
                description, category, urgency, status, searchable_text,
                latitude, longitude, precision_km, record_created_at,
                record_updated_at, source_cursor, source_event_id, projected_at
             ) VALUES
                ($1, $2, 'cid-a', 'rev-a', $3, 'Food support', 'Groceries needed',
                 'food', 'high', 'open', 'food support groceries needed',
                 41.88, -87.63, 3, $4, $4, 100, 'event-a', $4),
                ($5, $2, 'cid-b', 'rev-b', $6, 'Clinic ride', 'Ride needed',
                 'medical', 'critical', 'open', 'clinic ride needed',
                 41.89, -87.64, 3, $4, $4, 101, 'event-b', $4),
                ($7, $2, 'cid-c', 'rev-c', $8, 'Old food request', 'Already closed',
                 'food', 'low', 'closed', 'old food request already closed',
                 41.87, -87.62, 3, $4, $4, 102, 'event-c', $4)`,
            [
                `at://did:plc:alice/${recordNsid.aidPost}/a`,
                recordNsid.aidPost,
                'a'.repeat(64),
                now,
                `at://did:plc:bob/${recordNsid.aidPost}/b`,
                'b'.repeat(64),
                `at://did:plc:carol/${recordNsid.aidPost}/c`,
                'c'.repeat(64),
            ],
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    it('filters and paginates exclusively over durable projections with freshness metadata', async () => {
        const service = new PostgresProjectionQueryService(pool);
        const first = await service.queryMap(
            new URLSearchParams({
                latitude: '41.88',
                longitude: '-87.63',
                radiusKm: '25',
                status: 'open',
                page: '1',
                pageSize: '1',
            }),
        );
        const second = await service.queryMap(
            new URLSearchParams({
                latitude: '41.88',
                longitude: '-87.63',
                radiusKm: '25',
                status: 'open',
                page: '2',
                pageSize: '1',
            }),
        );
        const repeatedFirst = await service.queryMap(
            new URLSearchParams({
                latitude: '41.88',
                longitude: '-87.63',
                radiusKm: '25',
                status: 'open',
                page: '1',
                pageSize: '1',
            }),
        );

        expect(first.statusCode).toBe(200);
        expect(first.body).toMatchObject({
            total: 2,
            page: 1,
            pageSize: 1,
            hasNextPage: true,
            projectionFreshness: {
                latestCursor: 102,
                lagSeconds: expect.any(Number),
            },
        });
        expect(second.body).toMatchObject({
            total: 2,
            page: 2,
            pageSize: 1,
            hasNextPage: false,
        });
        const firstUri = (first.body as { results: Array<{ uri: string }> }).results[0]?.uri;
        const secondUri = (second.body as { results: Array<{ uri: string }> }).results[0]?.uri;
        expect(firstUri).toBeTruthy();
        expect(secondUri).toBeTruthy();
        expect(firstUri).not.toBe(secondUri);
        expect(
            (repeatedFirst.body as { results: Array<{ uri: string }> }).results[0]
                ?.uri,
        ).toBe(firstUri);
    });

    it('enforces category, urgency, status, geography, search, and freshness filters', async () => {
        const service = new PostgresProjectionQueryService(pool);
        const result = await service.queryFeed(
            new URLSearchParams({
                latitude: '41.88',
                longitude: '-87.63',
                radiusKm: '5',
                category: 'food',
                urgency: 'high',
                status: 'open',
                searchText: 'groceries',
                freshnessHours: '1',
            }),
        );

        expect(result.body).toMatchObject({
            total: 1,
            results: [
                {
                    uri: `at://did:plc:alice/${recordNsid.aidPost}/a`,
                    category: 'food',
                    urgency: 'high',
                    status: 'open',
                },
            ],
        });
    });
});
