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
        .mockResolvedValueOnce({ rows: [] })
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
            expect.stringContaining('command_id'),
            expect.stringContaining('INSERT INTO request_transition_events'),
            expect.stringContaining('UPDATE request_workflows'),
            expect.stringContaining('INSERT INTO operational_audit_events'),
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
            await readFile(
                new URL('./migrations/0004_lifecycle_timeline.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            await readFile(
                new URL('./migrations/0005_lifecycle_assignments.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            await readFile(
                new URL('./migrations/0006_assignment_responses.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            await readFile(
                new URL('./migrations/0007_lifecycle_handoffs.sql', import.meta.url),
                'utf8',
            ),
        );
        await pool.query(
            'TRUNCATE operational_audit_events, abuse_reports, user_blocks, request_handoff_events, request_assignment_events, request_transition_events, request_workflows RESTART IDENTITY CASCADE',
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
            actorRole: 'requester',
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
        const auditCount = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM operational_audit_events
             WHERE command_id = $1`,
            ['audit:durable-transition'],
        );
        expect(auditCount.rows[0]?.count).toBe('1');
        await expect(
            new PostgresLifecycleRepository(pool).get(postUri),
        ).resolves.toMatchObject({
            currentStatus: 'triaged',
            timeline: [
                {
                    from: 'open',
                    to: 'triaged',
                    actorDid: 'did:plc:alice',
                    actorRole: 'requester',
                    timestamp: '2026-07-10T22:41:00.000Z',
                },
            ],
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

    it('persists assignment metadata atomically and deduplicates retries', async () => {
        const assignedUri =
            'at://did:plc:alice/app.patchwork.aid.post/durable-assignment';
        await lifecycle.register({
            commandId: 'register-assignment',
            postUri: assignedUri,
            requesterDid: 'did:plc:alice',
            createdAt: '2026-07-10T22:44:00.000Z',
        });
        await lifecycle.transition({
            commandId: 'triage-assignment',
            postUri: assignedUri,
            actorDid: 'did:plc:coordinator',
            actorRole: 'coordinator',
            fromStatus: 'open',
            toStatus: 'triaged',
            occurredAt: '2026-07-10T22:45:00.000Z',
        });
        const command = {
            commandId: 'assign-volunteer',
            postUri: assignedUri,
            assignerDid: 'did:plc:coordinator',
            assigneeDid: 'did:plc:volunteer',
            occurredAt: '2026-07-10T22:46:00.000Z',
            timeoutMs: 1_800_000,
        };

        await expect(lifecycle.assign(command)).resolves.toMatchObject({
            applied: true,
            assignment: { status: 'pending' },
        });
        await expect(
            new PostgresLifecycleRepository(pool).assign(command),
        ).resolves.toMatchObject({ applied: false });
        await expect(lifecycle.get(assignedUri)).resolves.toMatchObject({
            currentStatus: 'assigned',
            assignment: {
                assigneeDid: 'did:plc:volunteer',
                assignerDid: 'did:plc:coordinator',
                status: 'pending',
            },
        });
    });

    it('persists assignment acceptance and deduplicates retries', async () => {
        const acceptedUri =
            'at://did:plc:alice/app.patchwork.aid.post/accepted-assignment';
        await lifecycle.register({
            commandId: 'register-accepted-assignment',
            postUri: acceptedUri,
            requesterDid: 'did:plc:alice',
            createdAt: '2026-07-10T22:47:00.000Z',
        });
        await lifecycle.transition({
            commandId: 'triage-accepted-assignment',
            postUri: acceptedUri,
            actorDid: 'did:plc:coordinator',
            actorRole: 'coordinator',
            fromStatus: 'open',
            toStatus: 'triaged',
            occurredAt: '2026-07-10T22:48:00.000Z',
        });
        await lifecycle.assign({
            commandId: 'assign-accepted-volunteer',
            postUri: acceptedUri,
            assignerDid: 'did:plc:coordinator',
            assigneeDid: 'did:plc:volunteer',
            occurredAt: '2026-07-10T22:49:00.000Z',
            timeoutMs: 1_800_000,
        });
        const command = {
            commandId: 'accept-volunteer-assignment',
            postUri: acceptedUri,
            assigneeDid: 'did:plc:volunteer',
            response: 'accepted' as const,
            occurredAt: '2026-07-10T22:50:00.000Z',
        };

        await expect(lifecycle.respondToAssignment(command)).resolves.toMatchObject({
            applied: true,
            assignment: { status: 'accepted' },
            currentStatus: 'in_progress',
        });
        await expect(
            new PostgresLifecycleRepository(pool).respondToAssignment(command),
        ).resolves.toMatchObject({ applied: false });
        await expect(
            new PostgresLifecycleRepository(pool).get(acceptedUri),
        ).resolves.toMatchObject({
            currentStatus: 'in_progress',
            assignment: {
                assigneeDid: 'did:plc:volunteer',
                status: 'accepted',
                respondedAt: '2026-07-10T22:50:00.000Z',
            },
            timeline: expect.arrayContaining([
                expect.objectContaining({
                    from: 'assigned',
                    to: 'in_progress',
                    actorDid: 'did:plc:volunteer',
                }),
            ]),
        });
    });

    it('persists assignment decline and returns the request for reassignment', async () => {
        const declinedUri =
            'at://did:plc:alice/app.patchwork.aid.post/declined-assignment';
        await lifecycle.register({
            commandId: 'register-declined-assignment',
            postUri: declinedUri,
            requesterDid: 'did:plc:alice',
            createdAt: '2026-07-10T22:51:00.000Z',
        });
        await lifecycle.transition({
            commandId: 'triage-declined-assignment',
            postUri: declinedUri,
            actorDid: 'did:plc:coordinator',
            actorRole: 'coordinator',
            fromStatus: 'open',
            toStatus: 'triaged',
            occurredAt: '2026-07-10T22:52:00.000Z',
        });
        await lifecycle.assign({
            commandId: 'assign-declined-volunteer',
            postUri: declinedUri,
            assignerDid: 'did:plc:coordinator',
            assigneeDid: 'did:plc:volunteer',
            occurredAt: '2026-07-10T22:53:00.000Z',
            timeoutMs: 1_800_000,
        });

        await expect(
            lifecycle.respondToAssignment({
                commandId: 'decline-volunteer-assignment',
                postUri: declinedUri,
                assigneeDid: 'did:plc:volunteer',
                response: 'declined',
                reason: 'Schedule conflict',
                occurredAt: '2026-07-10T22:54:00.000Z',
            }),
        ).resolves.toMatchObject({
            applied: true,
            assignment: {
                status: 'declined',
                declineReason: 'Schedule conflict',
            },
            currentStatus: 'triaged',
        });
        await expect(lifecycle.get(declinedUri)).resolves.toMatchObject({
            currentStatus: 'triaged',
            timeline: expect.arrayContaining([
                expect.objectContaining({
                    from: 'assigned',
                    to: 'triaged',
                    reason: 'Schedule conflict',
                }),
            ]),
        });
    });

    it('persists completed handoff metadata and deduplicates retries', async () => {
        const handoffUri =
            'at://did:plc:alice/app.patchwork.aid.post/completed-handoff';
        await lifecycle.register({
            commandId: 'register-completed-handoff',
            postUri: handoffUri,
            requesterDid: 'did:plc:alice',
            createdAt: '2026-07-10T22:55:00.000Z',
        });
        await lifecycle.transition({
            commandId: 'triage-completed-handoff',
            postUri: handoffUri,
            actorDid: 'did:plc:coordinator',
            actorRole: 'coordinator',
            fromStatus: 'open',
            toStatus: 'triaged',
            occurredAt: '2026-07-10T22:56:00.000Z',
        });
        await lifecycle.assign({
            commandId: 'assign-completed-handoff',
            postUri: handoffUri,
            assignerDid: 'did:plc:coordinator',
            assigneeDid: 'did:plc:volunteer',
            occurredAt: '2026-07-10T22:57:00.000Z',
            timeoutMs: 1_800_000,
        });
        await lifecycle.respondToAssignment({
            commandId: 'accept-completed-handoff',
            postUri: handoffUri,
            assigneeDid: 'did:plc:volunteer',
            response: 'accepted',
            occurredAt: '2026-07-10T22:58:00.000Z',
        });
        const command = {
            commandId: 'complete-volunteer-handoff',
            postUri: handoffUri,
            completedBy: 'did:plc:volunteer',
            occurredAt: '2026-07-10T23:00:00.000Z',
            notes: 'Delivered to the front desk',
            recipientConfirmed: true,
            deliveryMethod: 'in_person' as const,
        };

        await expect(lifecycle.completeHandoff(command)).resolves.toMatchObject({
            applied: true,
            handoff: {
                completedBy: 'did:plc:volunteer',
                notes: 'Delivered to the front desk',
                recipientConfirmed: true,
                deliveryMethod: 'in_person',
            },
            currentStatus: 'resolved',
        });
        await expect(
            new PostgresLifecycleRepository(pool).completeHandoff(command),
        ).resolves.toMatchObject({ applied: false });
        await expect(lifecycle.get(handoffUri)).resolves.toMatchObject({
            currentStatus: 'resolved',
            handoff: {
                completedBy: 'did:plc:volunteer',
                completedAt: '2026-07-10T23:00:00.000Z',
            },
            timeline: expect.arrayContaining([
                expect.objectContaining({
                    from: 'in_progress',
                    to: 'resolved',
                    actorDid: 'did:plc:volunteer',
                }),
            ]),
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
