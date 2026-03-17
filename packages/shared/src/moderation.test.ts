import { describe, expect, it } from 'vitest';
import { ModerationPolicyError, ModerationReviewQueue } from './moderation.js';

describe('P7.1 moderation queue + policy actions', () => {
    it('adds reported items to queue with sufficient context', () => {
        const queue = new ModerationReviewQueue();

        queue.enqueueReview({
            subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            reason: 'user-report:spam',
            requestedAt: '2026-02-27T02:00:00.000Z',
            context: {
                reporterDid: 'did:example:reporter',
                summary: 'Repeated duplicate post text',
                tags: ['spam', 'duplicate'],
            },
        });

        const item = queue.getState(
            'at://did:example:alice/app.patchwork.aid.post/post-1',
        );

        expect(item).not.toBeNull();
        expect(item).toMatchObject({
            subjectType: 'aid-post',
            queueStatus: 'queued',
            latestReason: 'user-report:spam',
            context: {
                reporterDid: 'did:example:reporter',
            },
        });
    });

    it('updates visibility and queue state deterministically on policy actions', () => {
        const queue = new ModerationReviewQueue();

        queue.enqueueReview({
            subjectUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
            reason: 'abuse-keyword:threat',
            requestedAt: '2026-02-27T02:10:00.000Z',
        });

        const updated = queue.applyPolicyAction({
            subjectUri:
                'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
            actorDid: 'did:example:mod-1',
            action: 'suspend-visibility',
            reason: 'Threat language requires immediate suspension',
            occurredAt: '2026-02-27T02:11:00.000Z',
        });

        expect(updated.visibility).toBe('suspended');
        expect(updated.queueStatus).toBe('resolved');
    });

    it('represents appeal lifecycle states and supports filtered queries', () => {
        const queue = new ModerationReviewQueue();
        const subjectUri =
            'at://did:example:org/app.patchwork.directory.resource/resource-1';

        queue.enqueueReview({
            subjectUri,
            reason: 'user-report:fraud',
            requestedAt: '2026-02-27T02:20:00.000Z',
        });

        queue.applyPolicyAction({
            subjectUri,
            actorDid: 'did:example:mod-1',
            action: 'delist',
            reason: 'Fraud confirmed',
            occurredAt: '2026-02-27T02:21:00.000Z',
        });

        queue.applyPolicyAction({
            subjectUri,
            actorDid: 'did:example:mod-2',
            action: 'open-appeal',
            reason: 'Operator requested appeal',
            occurredAt: '2026-02-27T02:22:00.000Z',
        });

        queue.applyPolicyAction({
            subjectUri,
            actorDid: 'did:example:mod-3',
            action: 'start-appeal-review',
            reason: 'Appeal review started',
            occurredAt: '2026-02-27T02:23:00.000Z',
        });

        const resolved = queue.applyPolicyAction({
            subjectUri,
            actorDid: 'did:example:mod-3',
            action: 'resolve-appeal-upheld',
            reason: 'Appeal upheld; original action stands',
            occurredAt: '2026-02-27T02:24:00.000Z',
        });

        expect(resolved.appealState).toBe('upheld');
        expect(
            queue.listQueue({
                appealState: 'upheld',
            }).length,
        ).toBe(1);
    });

    it('stores and returns moderation policy audit metadata', () => {
        const queue = new ModerationReviewQueue();
        const subjectUri =
            'at://did:example:alice/app.patchwork.aid.post/post-44';

        queue.enqueueReview({
            subjectUri,
            reason: 'user-report:abuse',
            requestedAt: '2026-02-27T02:30:00.000Z',
        });

        queue.applyPolicyAction({
            subjectUri,
            actorDid: 'did:example:mod-1',
            action: 'delist',
            reason: 'Abuse confirmed',
            occurredAt: '2026-02-27T02:31:00.000Z',
        });

        const auditTrail = queue.listAuditTrail(subjectUri);
        expect(auditTrail).toHaveLength(1);
        expect(auditTrail[0]).toMatchObject({
            action: 'delist',
            actorDid: 'did:example:mod-1',
            previousState: {
                queueStatus: 'queued',
                visibility: 'visible',
            },
            nextState: {
                queueStatus: 'resolved',
                visibility: 'delisted',
            },
        });
    });

    it('rejects invalid appeal transitions', () => {
        const queue = new ModerationReviewQueue();
        const subjectUri =
            'at://did:example:alice/app.patchwork.aid.post/post-99';

        queue.enqueueReview({
            subjectUri,
            reason: 'user-report:spam',
        });

        expect(() =>
            queue.applyPolicyAction({
                subjectUri,
                actorDid: 'did:example:mod-1',
                action: 'resolve-appeal-upheld',
                reason: 'Cannot resolve before review',
            }),
        ).toThrowError(ModerationPolicyError);
    });
});
