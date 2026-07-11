import { describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from './authorization-guard.js';
import { BlockService } from './block-service.js';
import { ReportService } from './report-service.js';
import { createLifecycleService } from './lifecycle-service.js';

describe('durable core services', () => {
    it('derives the blocker exclusively from the authenticated session', async () => {
        const repository = {
            create: vi.fn().mockResolvedValue({ created: true, blockId: '12' }),
            isBlocked: vi.fn(),
            deleteSubject: vi.fn(),
        };
        const service = new BlockService(repository);

        await expect(
            service.block(
                {
                    commandId: 'block-command-1',
                    subjectDid: 'did:plc:bob',
                    blockerDid: 'did:plc:mallory',
                    reason: 'harassment',
                    now: '2026-07-10T23:00:00.000Z',
                },
                createAuthorizationContext('did:plc:alice', 'user'),
            ),
        ).resolves.toEqual({
            statusCode: 201,
            body: { blockId: '12', created: true },
        });
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                blockerDid: 'did:plc:alice',
                subjectDid: 'did:plc:bob',
            }),
        );
    });

    it('derives the reporter exclusively from the authenticated session', async () => {
        const repository = {
            create: vi.fn().mockResolvedValue({ created: true, reportId: '22' }),
            deleteSubject: vi.fn(),
        };
        const service = new ReportService(repository);

        await expect(
            service.report(
                {
                    commandId: 'report-command-1',
                    subjectUri:
                        'at://did:plc:bob/app.patchwork.aid.post/report-me',
                    reporterDid: 'did:plc:mallory',
                    reason: 'spam',
                    details: 'Repeated solicitation',
                    now: '2026-07-10T23:01:00.000Z',
                },
                createAuthorizationContext('did:plc:alice', 'user'),
            ),
        ).resolves.toEqual({
            statusCode: 201,
            body: { reportId: '22', created: true },
        });
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ reporterDid: 'did:plc:alice' }),
        );
    });

    it('persists lifecycle transitions using the authenticated actor', async () => {
        const repository = {
            register: vi.fn().mockResolvedValue(true),
            get: vi
                .fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce({
                    postUri:
                        'at://did:plc:alice/app.patchwork.aid.post/durable-service',
                    requesterDid: 'did:plc:alice',
                    currentStatus: 'open',
                    createdAt: '2026-07-10T23:02:00.000Z',
                    updatedAt: '2026-07-10T23:02:00.000Z',
                    timeline: [],
                }),
            transition: vi
                .fn()
                .mockResolvedValue({ applied: true, transitionId: '31' }),
            assign: vi.fn(),
            respondToAssignment: vi.fn(),
            completeHandoff: vi.fn(),
            expireAssignment: vi.fn(),
            reconcileDeletion: vi.fn(),
            deleteSubject: vi.fn(),
        };
        const service = createLifecycleService(repository);

        const result = await service.transitionFromBody(
            {
                commandId: 'transition-command-1',
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-service',
                targetStatus: 'resolved',
                actorDid: 'did:plc:mallory',
                actorRole: 'requester',
                now: '2026-07-10T23:03:00.000Z',
            },
            createAuthorizationContext('did:plc:alice', 'user'),
        );

        expect(result.statusCode).toBe(200);
        expect(repository.transition).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'transition-command-1',
                actorDid: 'did:plc:alice',
                fromStatus: 'open',
                toStatus: 'resolved',
            }),
        );
    });

    it('reconstructs lifecycle queries from the durable timeline', async () => {
        const repository = {
            register: vi.fn(),
            transition: vi.fn(),
            assign: vi.fn(),
            respondToAssignment: vi.fn(),
            completeHandoff: vi.fn(),
            expireAssignment: vi.fn(),
            reconcileDeletion: vi.fn(),
            deleteSubject: vi.fn(),
            get: vi.fn().mockResolvedValue({
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-query',
                requesterDid: 'did:plc:alice',
                currentStatus: 'resolved',
                createdAt: '2026-07-10T23:02:00.000Z',
                updatedAt: '2026-07-10T23:03:00.000Z',
                timeline: [
                    {
                        from: 'open',
                        to: 'resolved',
                        actorDid: 'did:plc:alice',
                        actorRole: 'requester',
                        timestamp: '2026-07-10T23:03:00.000Z',
                    },
                ],
            }),
        };
        const service = createLifecycleService(repository);

        await expect(
            service.queryFromParamsAsync(
                new URLSearchParams({
                    postUri:
                        'at://did:plc:alice/app.patchwork.aid.post/durable-query',
                    actorRole: 'requester',
                }),
            ),
        ).resolves.toMatchObject({
            statusCode: 200,
            body: {
                currentStatus: 'resolved',
                timeline: [{ from: 'open', to: 'resolved' }],
            },
        });
    });

    it('persists assignment using the authenticated coordinator identity', async () => {
        const repository = {
            register: vi.fn(),
            get: vi.fn().mockResolvedValue({
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                requesterDid: 'did:plc:alice',
                currentStatus: 'triaged',
                createdAt: '2026-07-10T23:10:00.000Z',
                updatedAt: '2026-07-10T23:11:00.000Z',
                timeline: [],
            }),
            transition: vi.fn(),
            deleteSubject: vi.fn(),
            assign: vi.fn().mockResolvedValue({
                applied: true,
                assignmentEventId: '41',
                assignment: {
                    assigneeDid: 'did:plc:volunteer',
                    assignerDid: 'did:plc:moderator',
                    assignedAt: '2026-07-10T23:12:00.000Z',
                    status: 'pending',
                    timeoutMs: 1_800_000,
                },
            }),
            respondToAssignment: vi.fn(),
            completeHandoff: vi.fn(),
            expireAssignment: vi.fn(),
            reconcileDeletion: vi.fn(),
        };
        const service = createLifecycleService(repository);

        const result = await service.assignRequest(
            {
                commandId: 'assignment-command-1',
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                assigneeDid: 'did:plc:volunteer',
                assignerDid: 'did:plc:mallory',
                now: '2026-07-10T23:12:00.000Z',
            },
            createAuthorizationContext('did:plc:moderator', 'moderator'),
        );

        expect(result.statusCode).toBe(200);
        expect(repository.assign).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'assignment-command-1',
                assignerDid: 'did:plc:moderator',
                assigneeDid: 'did:plc:volunteer',
            }),
        );
    });

    it('persists assignment acceptance using the authenticated volunteer identity', async () => {
        const repository = {
            register: vi.fn(),
            get: vi.fn(),
            transition: vi.fn(),
            assign: vi.fn(),
            deleteSubject: vi.fn(),
            respondToAssignment: vi.fn().mockResolvedValue({
                applied: true,
                assignmentEventId: '42',
                assignment: {
                    assigneeDid: 'did:plc:volunteer',
                    assignerDid: 'did:plc:moderator',
                    assignedAt: '2026-07-10T23:12:00.000Z',
                    respondedAt: '2026-07-10T23:13:00.000Z',
                    status: 'accepted',
                    timeoutMs: 1_800_000,
                },
                currentStatus: 'in_progress',
            }),
            completeHandoff: vi.fn(),
            expireAssignment: vi.fn(),
            reconcileDeletion: vi.fn(),
        };
        const service = createLifecycleService(repository);

        const result = await service.acceptAssignment(
            {
                commandId: 'accept-assignment-command-1',
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                assigneeDid: 'did:plc:mallory',
                now: '2026-07-10T23:13:00.000Z',
            },
            createAuthorizationContext('did:plc:volunteer', 'volunteer'),
        );

        expect(result).toMatchObject({
            statusCode: 200,
            body: { currentStatus: 'in_progress' },
        });
        expect(repository.respondToAssignment).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'accept-assignment-command-1',
                assigneeDid: 'did:plc:volunteer',
                response: 'accepted',
            }),
        );
    });

    it('persists handoff completion using the authenticated volunteer identity', async () => {
        const repository = {
            register: vi.fn(),
            get: vi.fn().mockResolvedValue({
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                requesterDid: 'did:plc:alice',
                currentStatus: 'resolved',
                createdAt: '2026-07-10T23:10:00.000Z',
                updatedAt: '2026-07-10T23:14:00.000Z',
                timeline: [],
                handoff: {
                    completedBy: 'did:plc:volunteer',
                    completedAt: '2026-07-10T23:14:00.000Z',
                    recipientConfirmed: true,
                    deliveryMethod: 'in_person',
                },
            }),
            transition: vi.fn(),
            assign: vi.fn(),
            respondToAssignment: vi.fn(),
            deleteSubject: vi.fn(),
            completeHandoff: vi.fn().mockResolvedValue({
                applied: true,
                handoffEventId: '43',
                handoff: {
                    completedBy: 'did:plc:volunteer',
                    completedAt: '2026-07-10T23:14:00.000Z',
                    recipientConfirmed: true,
                    deliveryMethod: 'in_person',
                },
                currentStatus: 'resolved',
            }),
            expireAssignment: vi.fn(),
            reconcileDeletion: vi.fn(),
        };
        const service = createLifecycleService(repository);

        const result = await service.completeHandoff(
            {
                commandId: 'handoff-command-1',
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                assigneeDid: 'did:plc:mallory',
                recipientConfirmed: true,
                deliveryMethod: 'in_person',
                now: '2026-07-10T23:14:00.000Z',
            },
            createAuthorizationContext('did:plc:volunteer', 'volunteer'),
        );

        expect(result).toMatchObject({
            statusCode: 200,
            body: { currentStatus: 'resolved' },
        });
        expect(repository.completeHandoff).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'handoff-command-1',
                completedBy: 'did:plc:volunteer',
            }),
        );
        await expect(
            service.queryFromParamsAsync(
                new URLSearchParams({
                    postUri:
                        'at://did:plc:alice/app.patchwork.aid.post/durable-assignment',
                }),
            ),
        ).resolves.toMatchObject({
            statusCode: 200,
            body: {
                handoff: {
                    completedBy: 'did:plc:volunteer',
                    deliveryMethod: 'in_person',
                },
            },
        });
    });

    it('checks assignment timeout through the durable repository', async () => {
        const repository = {
            register: vi.fn(),
            get: vi.fn().mockResolvedValue({
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-timeout',
                requesterDid: 'did:plc:alice',
                currentStatus: 'assigned',
                createdAt: '2026-07-10T23:00:00.000Z',
                updatedAt: '2026-07-10T23:01:00.000Z',
                timeline: [],
                assignment: {
                    assigneeDid: 'did:plc:volunteer',
                    assignerDid: 'did:plc:coordinator',
                    assignedAt: '2026-07-10T23:01:00.000Z',
                    status: 'pending',
                    timeoutMs: 1_800_000,
                },
            }),
            transition: vi.fn(),
            assign: vi.fn(),
            respondToAssignment: vi.fn(),
            completeHandoff: vi.fn(),
            deleteSubject: vi.fn(),
            expireAssignment: vi.fn().mockResolvedValue({
                applied: true,
                assignmentEventId: '44',
                assignment: {
                    assigneeDid: 'did:plc:volunteer',
                    assignerDid: 'did:plc:coordinator',
                    assignedAt: '2026-07-10T23:01:00.000Z',
                    respondedAt: '2026-07-10T23:32:00.000Z',
                    status: 'timed_out',
                    timeoutMs: 1_800_000,
                },
                currentStatus: 'triaged',
            }),
            reconcileDeletion: vi.fn(),
        };
        const service = createLifecycleService(repository);

        await expect(
            service.checkAssignmentTimeoutAsync(
                'at://did:plc:alice/app.patchwork.aid.post/durable-timeout',
                '2026-07-10T23:32:00.000Z',
            ),
        ).resolves.toMatchObject({
            statusCode: 200,
            body: {
                assignment: { status: 'timed_out' },
                currentStatus: 'triaged',
            },
        });
        expect(repository.expireAssignment).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: expect.stringContaining('2026-07-10T23:01:00.000Z'),
                postUri:
                    'at://did:plc:alice/app.patchwork.aid.post/durable-timeout',
            }),
        );
    });
});
