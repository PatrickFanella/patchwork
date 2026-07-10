import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgresLifecycleRepository } from './lifecycle-repository.js';
import {
    PostgresAuditRepository,
    sanitizeAuditPayload,
} from './audit-repository.js';
import { PostgresBlockRepository } from './block-repository.js';
import { PostgresReportRepository } from './report-repository.js';

const createTransactionalPool = () => {
    const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
            rows: [{ post_uri: 'at://did:plc:alice/app.patchwork.aid.post/1', current_status: 'open' }],
        })
        .mockResolvedValueOnce({ rows: [{ transition_id: '7' }] })
        .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const pool = {
        connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as Pool;
    return { pool, query, release };
};

describe('PostgresLifecycleRepository', () => {
    it('commits a status transition and returns the durable transition ID', async () => {
        const { pool, query, release } = createTransactionalPool();
        const repository = new PostgresLifecycleRepository(pool);

        await expect(
            repository.transition({
                commandId: 'command-1',
                postUri: 'at://did:plc:alice/app.patchwork.aid.post/1',
                actorDid: 'did:plc:alice',
                fromStatus: 'open',
                toStatus: 'triaged',
                occurredAt: '2026-07-10T22:40:00.000Z',
            }),
        ).resolves.toEqual({ applied: true, transitionId: '7' });

        expect(query.mock.calls.map(call => call[0])).toEqual([
            'BEGIN',
            expect.stringContaining('command_id'),
            expect.stringContaining('FOR UPDATE'),
            expect.stringContaining('INSERT INTO request_transition_events'),
            expect.stringContaining('UPDATE request_workflows'),
            'COMMIT',
        ]);
        expect(release).toHaveBeenCalledOnce();
    });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('core operational PostgreSQL state', () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const lifecycle = new PostgresLifecycleRepository(pool);
    const blocks = new PostgresBlockRepository(pool);
    const reports = new PostgresReportRepository(pool);
    const audit = new PostgresAuditRepository(pool);
    const postUri = 'at://did:plc:alice/app.patchwork.aid.post/durable';

    beforeAll(async () => {
        const migration = await readFile(
            new URL('./migrations/0003_core_operational_state.sql', import.meta.url),
            'utf8',
        );
        await pool.query(migration);
        await pool.query(
            'TRUNCATE operational_audit_events, abuse_reports, user_blocks, request_transition_events, request_workflows RESTART IDENTITY CASCADE',
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    it('survives repository restart and deduplicates command IDs', async () => {
        await expect(
            lifecycle.register({
                commandId: 'register-durable',
                postUri,
                requesterDid: 'did:plc:alice',
                createdAt: '2026-07-10T22:40:00.000Z',
            }),
        ).resolves.toBe(true);
        await expect(
            new PostgresLifecycleRepository(pool).register({
                commandId: 'register-durable',
                postUri,
                requesterDid: 'did:plc:alice',
                createdAt: '2026-07-10T22:40:00.000Z',
            }),
        ).resolves.toBe(false);
        await expect(new PostgresLifecycleRepository(pool).get(postUri)).resolves
            .toMatchObject({ currentStatus: 'open' });
    });

    it('rolls back a conflicting transition without changing workflow state', async () => {
        const command = {
            commandId: 'durable-transition',
            postUri,
            actorDid: 'did:plc:alice',
            fromStatus: 'open',
            toStatus: 'triaged',
            occurredAt: '2026-07-10T22:41:00.000Z',
        };
        const applied = await lifecycle.transition(command);
        await expect(
            new PostgresLifecycleRepository(pool).transition(command),
        ).resolves.toEqual({
            applied: false,
            transitionId: applied.transitionId,
        });

        await expect(
            lifecycle.transition({
                commandId: 'conflicting-transition',
                postUri,
                actorDid: 'did:plc:alice',
                fromStatus: 'assigned',
                toStatus: 'resolved',
                occurredAt: '2026-07-10T22:41:00.000Z',
            }),
        ).rejects.toThrow('LIFECYCLE_REVISION_CONFLICT');
        await expect(lifecycle.get(postUri)).resolves.toMatchObject({
            currentStatus: 'triaged',
        });
    });

    it('stores only sanitized append-only audit payloads', async () => {
        await audit.append({
            commandId: 'audit-1',
            actorDid: 'did:plc:alice',
            action: 'request.transitioned',
            subjectUri: postUri,
            payload: {
                status: 'triaged',
                accessJwt: 'must-not-persist',
                location: { exactLatitude: 41.881, areaLabel: 'West Side' },
            },
            retentionUntil: '2027-07-10T22:41:00.000Z',
            occurredAt: '2026-07-10T22:41:00.000Z',
        });
        const stored = await pool.query<{ payload: Record<string, unknown> }>(
            'SELECT payload FROM operational_audit_events WHERE command_id = $1',
            ['audit-1'],
        );
        expect(stored.rows[0]?.payload).toEqual({
            status: 'triaged',
            location: { areaLabel: 'West Side' },
        });
    });

    it('soft-deletes private block/report subject data', async () => {
        await blocks.create({
            commandId: 'block-1',
            blockerDid: 'did:plc:alice',
            subjectDid: 'did:plc:bob',
            createdAt: '2026-07-10T22:42:00.000Z',
        });
        await reports.create({
            commandId: 'report-1',
            reporterDid: 'did:plc:alice',
            subjectUri: postUri,
            subjectDid: 'did:plc:bob',
            reason: 'spam',
            details: 'Private report detail',
            retentionUntil: '2026-10-10T22:42:00.000Z',
            createdAt: '2026-07-10T22:42:00.000Z',
        });

        await expect(
            blocks.deleteSubject('did:plc:bob', '2026-07-10T22:43:00.000Z'),
        ).resolves.toBe(1);
        await expect(
            reports.deleteSubject(postUri, '2026-07-10T22:43:00.000Z'),
        ).resolves.toBe(1);
        await expect(blocks.isBlocked('did:plc:alice', 'did:plc:bob')).resolves
            .toBe(false);
        const report = await pool.query<{ details: string | null }>(
            'SELECT details FROM abuse_reports WHERE command_id = $1',
            ['report-1'],
        );
        expect(report.rows[0]?.details).toBeNull();
    });
});

describe('sanitizeAuditPayload', () => {
    it('recursively removes token material and exact coordinates', () => {
        expect(
            sanitizeAuditPayload({
                status: 'open',
                accessJwt: 'secret',
                location: {
                    exactLatitude: 41.881,
                    exactLongitude: -87.631,
                    areaLabel: 'Near West Side',
                },
                nested: [{ refresh_token: 'secret', safe: true }],
            }),
        ).toEqual({
            status: 'open',
            location: { areaLabel: 'Near West Side' },
            nested: [{ safe: true }],
        });
    });
});
