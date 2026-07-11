import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModerationQueueItem } from '@patchwork/shared';
import { PostgresModerationQueueStore } from './postgres-queue-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

const item = (suffix: string): ModerationQueueItem => ({
    queueId: `queue-${suffix}`,
    subjectUri: `at://did:plc:alice/app.patchwork.aid.post/${suffix}`,
    subjectType: 'aid-post',
    reasons: ['user-report:spam'],
    latestReason: 'user-report:spam',
    reportCount: 1,
    queueStatus: 'queued',
    visibility: 'visible',
    appealState: 'none',
    createdAt: '2026-07-11T23:00:00.000Z',
    requestedAt: '2026-07-11T23:00:00.000Z',
    updatedAt: '2026-07-11T23:00:00.000Z',
    context: {},
});

describeWithPostgres('PostgresModerationQueueStore', () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const store = new PostgresModerationQueueStore(pool);

    beforeAll(async () => {
        await pool.query(
            await readFile(
                new URL('./migrations/001_create_moderation_tables.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            await readFile(
                new URL('./migrations/002_durable_moderation.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            'TRUNCATE moderation_audit_records, moderation_queue_items RESTART IDENTITY CASCADE',
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    it('claims distinct work across concurrent workers', async () => {
        await store.enqueue(item('claim-a'));
        await store.enqueue(item('claim-b'));

        const [first, second] = await Promise.all([
            store.claim({
                workerId: 'worker-a',
                now: '2026-07-11T23:01:00.000Z',
                leaseMs: 30_000,
            }),
            store.claim({
                workerId: 'worker-b',
                now: '2026-07-11T23:01:00.000Z',
                leaseMs: 30_000,
            }),
        ]);

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(first?.subjectUri).not.toBe(second?.subjectUri);
        expect(new Set([first?.subjectUri, second?.subjectUri]).size).toBe(2);
    });
});
