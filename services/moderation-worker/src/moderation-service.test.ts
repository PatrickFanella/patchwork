import { describe, expect, it } from 'vitest';
import { createFixtureModerationWorkerService } from './moderation-service.js';

const SUBJECT_A = 'at://did:example:alice/app.patchwork.aid.post/post-a';
const SUBJECT_B = 'at://did:example:bob/app.patchwork.aid.post/post-b';
const SUBJECT_C = 'at://did:example:carol/app.patchwork.aid.post/post-c';
const MOD_DID = 'did:example:mod-ops';

const enqueue = (
    service: ReturnType<typeof createFixtureModerationWorkerService>,
    subjectUri: string,
    reason = 'user-report:spam',
    requestedAt = '2026-03-01T00:00:00.000Z',
) => {
    return service.enqueueFromParams(
        new URLSearchParams({ subjectUri, reason, requestedAt }),
    );
};

describe('moderator operations - service extensions', () => {
    describe('getQueueStats', () => {
        it('returns zero stats for empty queue', () => {
            const service = createFixtureModerationWorkerService();
            const result = service.getQueueStats();

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                queueDepth: number;
                pendingCount: number;
                avgWaitSeconds: number;
                errorCount: number;
            };
            expect(body.queueDepth).toBe(0);
            expect(body.pendingCount).toBe(0);
            expect(body.avgWaitSeconds).toBe(0);
            expect(body.errorCount).toBe(0);
        });

        it('calculates queue depth and pending count', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);
            enqueue(service, SUBJECT_B);

            // Resolve one item
            service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri: SUBJECT_A,
                    actorDid: MOD_DID,
                    action: 'delist',
                    reason: 'spam',
                    occurredAt: '2026-03-01T00:05:00.000Z',
                }),
            );

            const result = service.getQueueStats();
            expect(result.statusCode).toBe(200);

            const body = result.body as {
                queueDepth: number;
                pendingCount: number;
            };
            expect(body.queueDepth).toBe(2);
            expect(body.pendingCount).toBe(1);
        });

        it('reports average wait time for pending items', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A, 'spam', '2026-03-01T00:00:00.000Z');

            const result = service.getQueueStats();
            expect(result.statusCode).toBe(200);

            const body = result.body as { avgWaitSeconds: number };
            expect(body.avgWaitSeconds).toBeGreaterThan(0);
        });
    });

    describe('bulkTriage', () => {
        it('applies action to multiple items at once', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);
            enqueue(service, SUBJECT_B);
            enqueue(service, SUBJECT_C);

            const result = service.bulkTriage(
                [SUBJECT_A, SUBJECT_B],
                'delist',
                MOD_DID,
                'Bulk delist spam',
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                processed: number;
                succeeded: number;
                failed: number;
            };
            expect(body.processed).toBe(2);
            expect(body.succeeded).toBe(2);
            expect(body.failed).toBe(0);

            // Verify the items were actually delisted
            const stateA = service.getStateFromParams(
                new URLSearchParams({ subjectUri: SUBJECT_A }),
            );
            expect((stateA.body as { item: { visibility: string } }).item.visibility).toBe('delisted');

            // Verify the third item was not affected
            const stateC = service.getStateFromParams(
                new URLSearchParams({ subjectUri: SUBJECT_C }),
            );
            expect((stateC.body as { item: { visibility: string } }).item.visibility).toBe('visible');
        });

        it('reports failures for non-existent items', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);

            const result = service.bulkTriage(
                [SUBJECT_A, 'at://did:example:nobody/app.patchwork.aid.post/missing'],
                'delist',
                MOD_DID,
                'Bulk action',
            );

            const body = result.body as {
                processed: number;
                succeeded: number;
                failed: number;
            };
            expect(body.processed).toBe(2);
            expect(body.succeeded).toBe(1);
            expect(body.failed).toBe(1);
        });

        it('records audit trail entries for each bulk action', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);
            enqueue(service, SUBJECT_B);

            service.bulkTriage(
                [SUBJECT_A, SUBJECT_B],
                'delist',
                MOD_DID,
                'Bulk delist',
            );

            const auditA = service.listAuditFromParams(
                new URLSearchParams({ subjectUri: SUBJECT_A }),
            );
            expect((auditA.body as { total: number }).total).toBe(1);

            const auditB = service.listAuditFromParams(
                new URLSearchParams({ subjectUri: SUBJECT_B }),
            );
            expect((auditB.body as { total: number }).total).toBe(1);
        });
    });

    describe('escalateItem', () => {
        it('escalates an item from none to pending appeal', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);

            const result = service.escalateItem(
                SUBJECT_A,
                MOD_DID,
                'Needs senior review',
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { item: { appealState: string } };
            expect(body.item.appealState).toBe('pending');
        });

        it('escalates a pending appeal to under-review', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);

            // First escalation: none -> pending
            service.escalateItem(SUBJECT_A, MOD_DID, 'Initial escalation');

            // Second escalation: pending -> under-review
            const result = service.escalateItem(
                SUBJECT_A,
                MOD_DID,
                'Further escalation',
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { item: { appealState: string } };
            expect(body.item.appealState).toBe('under-review');
        });

        it('returns 404 for non-existent subject', () => {
            const service = createFixtureModerationWorkerService();
            const result = service.escalateItem(
                'at://did:example:nobody/app.patchwork.aid.post/missing',
                MOD_DID,
                'Escalate missing item',
            );
            expect(result.statusCode).toBe(404);
        });

        it('records escalation reason with [ESCALATION] prefix in audit trail', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);

            service.escalateItem(SUBJECT_A, MOD_DID, 'Urgent review needed');

            const audit = service.listAuditFromParams(
                new URLSearchParams({ subjectUri: SUBJECT_A }),
            );
            const entries = (audit.body as { results: Array<{ reason: string }> }).results;
            expect(entries[0].reason).toContain('[ESCALATION]');
            expect(entries[0].reason).toContain('Urgent review needed');
        });

        it('returns current state when item is already under review', () => {
            const service = createFixtureModerationWorkerService();
            enqueue(service, SUBJECT_A);

            // Escalate twice to reach under-review
            service.escalateItem(SUBJECT_A, MOD_DID, 'First');
            service.escalateItem(SUBJECT_A, MOD_DID, 'Second');

            // Third escalation should return current state
            const result = service.escalateItem(SUBJECT_A, MOD_DID, 'Third');
            expect(result.statusCode).toBe(200);
        });
    });
});
