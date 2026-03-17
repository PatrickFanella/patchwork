import { describe, expect, it } from 'vitest';
import { createFixtureModerationWorkerService } from './moderation-service.js';

describe('phase 7 moderation worker queue + policy endpoints', () => {
    it('queues reported subjects and exposes queue reads', () => {
        const service = createFixtureModerationWorkerService();

        const enqueue = service.enqueueFromParams(
            new URLSearchParams({
                subjectUri:
                    'at://did:example:alice/app.patchwork.aid.post/post-1',
                reason: 'user-report:spam',
                reporterDid: 'did:example:reporter-1',
                summary: 'Repeated duplicate content',
                tags: 'spam,duplicate',
                requestedAt: '2026-02-27T03:00:00.000Z',
            }),
        );

        expect(enqueue.statusCode).toBe(200);

        const list = service.listQueueFromParams(new URLSearchParams());
        expect(list.statusCode).toBe(200);
        expect(list.body).toMatchObject({
            total: 1,
            results: [
                {
                    subjectType: 'aid-post',
                    queueStatus: 'queued',
                    reportCount: 1,
                },
            ],
        });
    });

    it('applies policy actions and records audit metadata', () => {
        const service = createFixtureModerationWorkerService();
        const subjectUri =
            'at://did:example:alice/app.patchwork.conversation.meta/conv-1';

        service.enqueueFromParams(
            new URLSearchParams({
                subjectUri,
                reason: 'abuse-keyword:threat',
                requestedAt: '2026-02-27T03:10:00.000Z',
            }),
        );

        const suspended = service.applyPolicyFromParams(
            new URLSearchParams({
                subjectUri,
                actorDid: 'did:example:mod-1',
                action: 'suspend-visibility',
                reason: 'Threatening messages',
                occurredAt: '2026-02-27T03:11:00.000Z',
            }),
        );
        expect(suspended.statusCode).toBe(200);

        service.applyPolicyFromParams(
            new URLSearchParams({
                subjectUri,
                actorDid: 'did:example:mod-2',
                action: 'open-appeal',
                reason: 'User filed appeal',
                occurredAt: '2026-02-27T03:12:00.000Z',
            }),
        );

        service.applyPolicyFromParams(
            new URLSearchParams({
                subjectUri,
                actorDid: 'did:example:mod-3',
                action: 'start-appeal-review',
                reason: 'Appeal under review',
                occurredAt: '2026-02-27T03:13:00.000Z',
            }),
        );

        const resolved = service.applyPolicyFromParams(
            new URLSearchParams({
                subjectUri,
                actorDid: 'did:example:mod-3',
                action: 'resolve-appeal-rejected',
                reason: 'Appeal rejected after review',
                occurredAt: '2026-02-27T03:14:00.000Z',
            }),
        );

        expect(resolved.statusCode).toBe(200);

        const state = service.getStateFromParams(
            new URLSearchParams({
                subjectUri,
            }),
        );

        expect(state.statusCode).toBe(200);
        expect(state.body).toMatchObject({
            item: {
                visibility: 'suspended',
                appealState: 'rejected',
                queueStatus: 'resolved',
            },
        });

        const audit = service.listAuditFromParams(
            new URLSearchParams({
                subjectUri,
            }),
        );

        expect(audit.statusCode).toBe(200);
        expect(audit.body).toMatchObject({
            total: 4,
        });
    });
});
