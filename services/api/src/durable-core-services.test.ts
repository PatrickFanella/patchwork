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
                }),
            transition: vi
                .fn()
                .mockResolvedValue({ applied: true, transitionId: '31' }),
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
});
