import { describe, expect, it, beforeEach } from 'vitest';
import {
    ModerationReviewQueue,
    toIdempotencyKey,
    type ModerationQueueItem,
    type ModerationAuditRecord,
} from '@patchwork/shared';
import { InMemoryQueueStore } from './queue-store.js';
import { InMemoryAuditStore } from './audit-store.js';
import { ModerationMetrics } from './metrics.js';
import { createFixtureModerationWorkerService } from './moderation-service.js';

const SUBJECT_URI_1 =
    'at://did:example:alice/app.patchwork.aid.post/durable-post-1';
const SUBJECT_URI_2 =
    'at://did:example:bob/app.patchwork.aid.post/durable-post-2';
const MOD_DID = 'did:example:mod-1';

describe('durable queue/state backend (issue #96)', () => {
    let queueStore: InMemoryQueueStore;
    let auditStore: InMemoryAuditStore;

    beforeEach(() => {
        queueStore = new InMemoryQueueStore();
        auditStore = new InMemoryAuditStore();
    });

    describe('queue persistence across store recreation', () => {
        it('persists queue items through store snapshot/restore cycle', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_2,
                reason: 'user-report:abuse',
                requestedAt: '2026-02-27T10:01:00.000Z',
            });

            // Snapshot the store state
            const queueSnapshot = queueStore.snapshot();
            const auditSnapshot = auditStore.snapshot();

            // Create new stores (simulates restart)
            const newQueueStore = new InMemoryQueueStore();
            const newAuditStore = new InMemoryAuditStore();
            newQueueStore.restore(queueSnapshot);
            newAuditStore.restore(auditSnapshot);

            // Verify items survive the "restart"
            const item1 = newQueueStore.peek(SUBJECT_URI_1);
            expect(item1).not.toBeNull();
            expect(item1!.subjectUri).toBe(SUBJECT_URI_1);
            expect(item1!.queueStatus).toBe('queued');

            const item2 = newQueueStore.peek(SUBJECT_URI_2);
            expect(item2).not.toBeNull();
            expect(item2!.subjectUri).toBe(SUBJECT_URI_2);
        });

        it('preserves queue item state after policy actions through restart', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            // Snapshot and restore
            const queueSnapshot = queueStore.snapshot();
            const auditSnapshot = auditStore.snapshot();

            const newQueueStore = new InMemoryQueueStore();
            const newAuditStore = new InMemoryAuditStore();
            newQueueStore.restore(queueSnapshot);
            newAuditStore.restore(auditSnapshot);

            const restored = newQueueStore.peek(SUBJECT_URI_1);
            expect(restored).not.toBeNull();
            expect(restored!.visibility).toBe('delisted');
            expect(restored!.queueStatus).toBe('resolved');
        });
    });

    describe('idempotent policy transitions', () => {
        it('returns same result when same action is applied twice with same idempotency key', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            const firstResult = queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'test-idempotency-key-1',
            });

            // Apply the exact same action again with same idempotency key
            const secondResult = queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'test-idempotency-key-1',
            });

            // Both results should reflect the delisted state
            expect(firstResult.visibility).toBe('delisted');
            expect(secondResult.visibility).toBe('delisted');
            expect(firstResult.queueStatus).toBe('resolved');
            expect(secondResult.queueStatus).toBe('resolved');
        });

        it('only creates one audit record for duplicate idempotency keys', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'dedup-key-1',
            });

            // Attempt the same action again
            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'dedup-key-1',
            });

            const auditTrail = queue.listAuditTrail(SUBJECT_URI_1);
            expect(auditTrail).toHaveLength(1);
            expect(auditTrail[0]!.action).toBe('delist');
        });

        it('generates deterministic idempotency keys for the same inputs', () => {
            const key1 = toIdempotencyKey(
                'queue-123',
                'delist',
                '2026-02-27T10:00:00.000Z',
                MOD_DID,
            );
            const key2 = toIdempotencyKey(
                'queue-123',
                'delist',
                '2026-02-27T10:00:00.000Z',
                MOD_DID,
            );

            expect(key1).toBe(key2);
            expect(key1.length).toBe(32);
        });

        it('generates different idempotency keys for different inputs', () => {
            const key1 = toIdempotencyKey(
                'queue-123',
                'delist',
                '2026-02-27T10:00:00.000Z',
                MOD_DID,
            );
            const key2 = toIdempotencyKey(
                'queue-123',
                'suspend-visibility',
                '2026-02-27T10:00:00.000Z',
                MOD_DID,
            );

            expect(key1).not.toBe(key2);
        });

        it('does not treat auto-generated keys as duplicates for distinct actions', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'open-appeal',
                reason: 'User appealed',
                occurredAt: '2026-02-27T10:10:00.000Z',
            });

            const auditTrail = queue.listAuditTrail(SUBJECT_URI_1);
            expect(auditTrail).toHaveLength(2);
            expect(auditTrail[0]!.action).toBe('delist');
            expect(auditTrail[1]!.action).toBe('open-appeal');
        });
    });

    describe('audit trail completeness', () => {
        it('records full audit trail for a complete moderation lifecycle', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: 'did:example:mod-2',
                action: 'open-appeal',
                reason: 'User appealed',
                occurredAt: '2026-02-27T10:10:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: 'did:example:mod-3',
                action: 'start-appeal-review',
                reason: 'Review started',
                occurredAt: '2026-02-27T10:15:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: 'did:example:mod-3',
                action: 'resolve-appeal-upheld',
                reason: 'Appeal upheld',
                occurredAt: '2026-02-27T10:20:00.000Z',
            });

            const trail = queue.listAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(4);

            // Verify state transitions are recorded correctly
            expect(trail[0]).toMatchObject({
                action: 'delist',
                previousState: { visibility: 'visible', queueStatus: 'queued' },
                nextState: {
                    visibility: 'delisted',
                    queueStatus: 'resolved',
                },
            });

            expect(trail[1]).toMatchObject({
                action: 'open-appeal',
                previousState: {
                    visibility: 'delisted',
                    appealState: 'none',
                },
                nextState: {
                    appealState: 'pending',
                    queueStatus: 'queued',
                },
            });

            expect(trail[2]).toMatchObject({
                action: 'start-appeal-review',
                previousState: { appealState: 'pending' },
                nextState: { appealState: 'under-review' },
            });

            expect(trail[3]).toMatchObject({
                action: 'resolve-appeal-upheld',
                previousState: { appealState: 'under-review' },
                nextState: {
                    appealState: 'upheld',
                    queueStatus: 'resolved',
                },
            });
        });

        it('each audit entry has a valid idempotency key', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            const trail = queue.listAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(1);
            expect(trail[0]!.idempotencyKey).toBeDefined();
            expect(trail[0]!.idempotencyKey.length).toBeGreaterThan(0);
        });

        it('audit trail survives store restore', () => {
            const queue = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:abuse',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'suspend-visibility',
                reason: 'Abuse confirmed',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            // Snapshot and restore
            const auditSnapshot = auditStore.snapshot();
            const newAuditStore = new InMemoryAuditStore();
            newAuditStore.restore(auditSnapshot);

            const trail = newAuditStore.getAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(1);
            expect(trail[0]!.action).toBe('suspend-visibility');
        });
    });

    describe('restart recovery', () => {
        it('recovers pending queue items after service recreation', () => {
            // Phase 1: Enqueue items in original service
            const queue1 = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue1.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue1.enqueueReview({
                subjectUri: SUBJECT_URI_2,
                reason: 'user-report:abuse',
                requestedAt: '2026-02-27T10:01:00.000Z',
            });

            // Snapshot the stores
            const queueSnapshot = queueStore.snapshot();
            const auditSnapshot = auditStore.snapshot();

            // Phase 2: Create new stores and service (simulates restart)
            const newQueueStore = new InMemoryQueueStore();
            const newAuditStore = new InMemoryAuditStore();
            newQueueStore.restore(queueSnapshot);
            newAuditStore.restore(auditSnapshot);

            const queue2 = new ModerationReviewQueue({
                queueStore: newQueueStore,
                auditStore: newAuditStore,
            });

            // Items should be recoverable from the new service
            const item1 = queue2.getState(SUBJECT_URI_1);
            expect(item1).not.toBeNull();
            expect(item1!.queueStatus).toBe('queued');
            expect(item1!.latestReason).toBe('user-report:spam');

            const item2 = queue2.getState(SUBJECT_URI_2);
            expect(item2).not.toBeNull();
            expect(item2!.queueStatus).toBe('queued');
        });

        it('recovers resolved items and maintains audit trail after restart', () => {
            const queue1 = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue1.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue1.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            // Snapshot and restore
            const queueSnapshot = queueStore.snapshot();
            const auditSnapshot = auditStore.snapshot();

            const newQueueStore = new InMemoryQueueStore();
            const newAuditStore = new InMemoryAuditStore();
            newQueueStore.restore(queueSnapshot);
            newAuditStore.restore(auditSnapshot);

            const queue2 = new ModerationReviewQueue({
                queueStore: newQueueStore,
                auditStore: newAuditStore,
            });

            // State should persist
            const item = queue2.getState(SUBJECT_URI_1);
            expect(item).not.toBeNull();
            expect(item!.visibility).toBe('delisted');
            expect(item!.queueStatus).toBe('resolved');

            // Audit trail should persist
            const trail = queue2.listAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(1);
            expect(trail[0]!.action).toBe('delist');
        });

        it('can continue processing after restart (new actions on restored items)', () => {
            const queue1 = new ModerationReviewQueue({
                queueStore,
                auditStore,
            });

            queue1.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            queue1.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            // Snapshot and restore
            const queueSnapshot = queueStore.snapshot();
            const auditSnapshot = auditStore.snapshot();

            const newQueueStore = new InMemoryQueueStore();
            const newAuditStore = new InMemoryAuditStore();
            newQueueStore.restore(queueSnapshot);
            newAuditStore.restore(auditSnapshot);

            const queue2 = new ModerationReviewQueue({
                queueStore: newQueueStore,
                auditStore: newAuditStore,
            });

            // Apply a new action on the restored item
            const updated = queue2.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: 'did:example:mod-2',
                action: 'open-appeal',
                reason: 'User filed appeal after restart',
                occurredAt: '2026-02-27T11:00:00.000Z',
            });

            expect(updated.appealState).toBe('pending');
            expect(updated.queueStatus).toBe('queued');

            // Audit trail should now have both pre-restart and post-restart entries
            const trail = queue2.listAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(2);
            expect(trail[0]!.action).toBe('delist');
            expect(trail[1]!.action).toBe('open-appeal');
        });
    });

    describe('metrics emission', () => {
        it('records queue depth on enqueue', () => {
            const metrics = new ModerationMetrics();

            metrics.recordEnqueue(SUBJECT_URI_1);
            expect(metrics.getQueueDepth()).toBe(1);

            metrics.recordEnqueue(SUBJECT_URI_2);
            expect(metrics.getQueueDepth()).toBe(2);
        });

        it('decrements queue depth on dequeue', () => {
            const metrics = new ModerationMetrics();

            metrics.recordEnqueue(SUBJECT_URI_1);
            metrics.recordEnqueue(SUBJECT_URI_2);
            expect(metrics.getQueueDepth()).toBe(2);

            metrics.recordDequeue(SUBJECT_URI_1);
            expect(metrics.getQueueDepth()).toBe(1);
        });

        it('records action counters by type', () => {
            const metrics = new ModerationMetrics();

            metrics.recordAction('delist');
            metrics.recordAction('delist');
            metrics.recordAction('suspend-visibility');

            expect(metrics.getActionCount('delist')).toBe(2);
            expect(metrics.getActionCount('suspend-visibility')).toBe(1);
            expect(metrics.getActionCount('open-appeal')).toBe(0);
            expect(metrics.getTotalActions()).toBe(3);
        });

        it('records error counter', () => {
            const metrics = new ModerationMetrics();

            expect(metrics.getErrorCount()).toBe(0);
            metrics.recordError();
            metrics.recordError();
            expect(metrics.getErrorCount()).toBe(2);
        });

        it('renders Prometheus-format output', () => {
            const metrics = new ModerationMetrics();

            metrics.recordEnqueue(SUBJECT_URI_1);
            metrics.recordAction('delist');
            metrics.recordError();

            const output = metrics.renderPrometheus();

            expect(output).toContain('moderation_queue_depth');
            expect(output).toContain('moderation_queue_latency_seconds');
            expect(output).toContain('moderation_actions_total');
            expect(output).toContain('moderation_errors_total');
            expect(output).toContain('action="delist"');
        });

        it('integrates with service to track metrics on operations', () => {
            const metrics = new ModerationMetrics();
            const service = createFixtureModerationWorkerService({
                queueStore,
                auditStore,
                metrics,
            });

            service.enqueueFromParams(
                new URLSearchParams({
                    subjectUri: SUBJECT_URI_1,
                    reason: 'user-report:spam',
                    requestedAt: '2026-02-27T10:00:00.000Z',
                }),
            );

            expect(metrics.getQueueDepth()).toBe(1);

            service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri: SUBJECT_URI_1,
                    actorDid: MOD_DID,
                    action: 'delist',
                    reason: 'Spam confirmed',
                    occurredAt: '2026-02-27T10:05:00.000Z',
                }),
            );

            expect(metrics.getActionCount('delist')).toBe(1);
            expect(metrics.getQueueDepth()).toBe(0);
        });

        it('records errors when service operations fail', () => {
            const metrics = new ModerationMetrics();
            const service = createFixtureModerationWorkerService({
                queueStore,
                auditStore,
                metrics,
            });

            // Attempt to apply policy on non-existent item
            service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri: SUBJECT_URI_1,
                    actorDid: MOD_DID,
                    action: 'delist',
                    reason: 'Spam',
                }),
            );

            expect(metrics.getErrorCount()).toBe(1);
        });

        it('can set queue depth from store count', () => {
            const metrics = new ModerationMetrics();

            metrics.setQueueDepth(42);
            expect(metrics.getQueueDepth()).toBe(42);
        });

        it('resets all metrics', () => {
            const metrics = new ModerationMetrics();

            metrics.recordEnqueue(SUBJECT_URI_1);
            metrics.recordAction('delist');
            metrics.recordError();

            metrics.reset();

            expect(metrics.getQueueDepth()).toBe(0);
            expect(metrics.getTotalActions()).toBe(0);
            expect(metrics.getErrorCount()).toBe(0);
        });
    });

    describe('queue store operations', () => {
        it('enqueue and peek return consistent data', () => {
            const store = new InMemoryQueueStore();
            const item: ModerationQueueItem = {
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'queued',
                visibility: 'visible',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            };

            store.enqueue(item);
            const peeked = store.peek(SUBJECT_URI_1);
            expect(peeked).toMatchObject({
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                queueStatus: 'queued',
            });
        });

        it('dequeue removes the item from the store', () => {
            const store = new InMemoryQueueStore();
            const item: ModerationQueueItem = {
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'queued',
                visibility: 'visible',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            };

            store.enqueue(item);
            const dequeued = store.dequeue(SUBJECT_URI_1);
            expect(dequeued).not.toBeNull();
            expect(store.peek(SUBJECT_URI_1)).toBeNull();
        });

        it('ack marks item as resolved', () => {
            const store = new InMemoryQueueStore();
            const item: ModerationQueueItem = {
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'queued',
                visibility: 'visible',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            };

            store.enqueue(item);
            store.ack(SUBJECT_URI_1);

            const acked = store.peek(SUBJECT_URI_1);
            expect(acked!.queueStatus).toBe('resolved');
        });

        it('nack re-queues a resolved item', () => {
            const store = new InMemoryQueueStore();
            const item: ModerationQueueItem = {
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'resolved',
                visibility: 'delisted',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            };

            store.enqueue(item);
            store.nack(SUBJECT_URI_1);

            const nacked = store.peek(SUBJECT_URI_1);
            expect(nacked!.queueStatus).toBe('queued');
        });

        it('listPending returns only queued items', () => {
            const store = new InMemoryQueueStore();
            store.enqueue({
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'queued',
                visibility: 'visible',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            });
            store.enqueue({
                queueId: 'q-2',
                subjectUri: SUBJECT_URI_2,
                subjectType: 'aid-post',
                reasons: ['abuse'],
                latestReason: 'abuse',
                reportCount: 1,
                queueStatus: 'resolved',
                visibility: 'delisted',
                appealState: 'none',
                createdAt: '2026-02-27T10:01:00.000Z',
                requestedAt: '2026-02-27T10:01:00.000Z',
                updatedAt: '2026-02-27T10:01:00.000Z',
                context: {},
            });

            const pending = store.listPending();
            expect(pending).toHaveLength(1);
            expect(pending[0]!.subjectUri).toBe(SUBJECT_URI_1);
        });

        it('reports correct size and pending count', () => {
            const store = new InMemoryQueueStore();
            store.enqueue({
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                subjectType: 'aid-post',
                reasons: ['spam'],
                latestReason: 'spam',
                reportCount: 1,
                queueStatus: 'queued',
                visibility: 'visible',
                appealState: 'none',
                createdAt: '2026-02-27T10:00:00.000Z',
                requestedAt: '2026-02-27T10:00:00.000Z',
                updatedAt: '2026-02-27T10:00:00.000Z',
                context: {},
            });
            store.enqueue({
                queueId: 'q-2',
                subjectUri: SUBJECT_URI_2,
                subjectType: 'aid-post',
                reasons: ['abuse'],
                latestReason: 'abuse',
                reportCount: 1,
                queueStatus: 'resolved',
                visibility: 'delisted',
                appealState: 'none',
                createdAt: '2026-02-27T10:01:00.000Z',
                requestedAt: '2026-02-27T10:01:00.000Z',
                updatedAt: '2026-02-27T10:01:00.000Z',
                context: {},
            });

            expect(store.size()).toBe(2);
            expect(store.pendingCount()).toBe(1);
        });
    });

    describe('audit store operations', () => {
        it('records and retrieves audit actions', () => {
            const store = new InMemoryAuditStore();
            const record: ModerationAuditRecord = {
                actionId: 'a-1',
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'key-1',
                previousState: {
                    queueStatus: 'queued',
                    visibility: 'visible',
                    appealState: 'none',
                },
                nextState: {
                    queueStatus: 'resolved',
                    visibility: 'delisted',
                    appealState: 'none',
                },
            };

            store.recordAction(record);

            const trail = store.getAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(1);
            expect(trail[0]!.action).toBe('delist');
        });

        it('enforces idempotency on record insertion', () => {
            const store = new InMemoryAuditStore();
            const record: ModerationAuditRecord = {
                actionId: 'a-1',
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'key-1',
                previousState: {
                    queueStatus: 'queued',
                    visibility: 'visible',
                    appealState: 'none',
                },
                nextState: {
                    queueStatus: 'resolved',
                    visibility: 'delisted',
                    appealState: 'none',
                },
            };

            store.recordAction(record);
            store.recordAction(record); // duplicate

            expect(store.totalCount()).toBe(1);
        });

        it('finds records by idempotency key', () => {
            const store = new InMemoryAuditStore();
            const record: ModerationAuditRecord = {
                actionId: 'a-1',
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'unique-key-42',
                previousState: {
                    queueStatus: 'queued',
                    visibility: 'visible',
                    appealState: 'none',
                },
                nextState: {
                    queueStatus: 'resolved',
                    visibility: 'delisted',
                    appealState: 'none',
                },
            };

            store.recordAction(record);

            expect(store.findByIdempotencyKey('unique-key-42')).not.toBeNull();
            expect(store.findByIdempotencyKey('nonexistent-key')).toBeNull();
        });

        it('filters actions by actorDid', () => {
            const store = new InMemoryAuditStore();
            store.recordAction({
                actionId: 'a-1',
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
                idempotencyKey: 'key-1',
                previousState: {
                    queueStatus: 'queued',
                    visibility: 'visible',
                    appealState: 'none',
                },
                nextState: {
                    queueStatus: 'resolved',
                    visibility: 'delisted',
                    appealState: 'none',
                },
            });
            store.recordAction({
                actionId: 'a-2',
                queueId: 'q-1',
                subjectUri: SUBJECT_URI_1,
                actorDid: 'did:example:mod-2',
                action: 'open-appeal',
                reason: 'Appeal',
                occurredAt: '2026-02-27T10:10:00.000Z',
                idempotencyKey: 'key-2',
                previousState: {
                    queueStatus: 'resolved',
                    visibility: 'delisted',
                    appealState: 'none',
                },
                nextState: {
                    queueStatus: 'queued',
                    visibility: 'delisted',
                    appealState: 'pending',
                },
            });

            const mod1Actions = store.getActions({ actorDid: MOD_DID });
            expect(mod1Actions).toHaveLength(1);
            expect(mod1Actions[0]!.action).toBe('delist');
        });
    });

    describe('backward compatibility', () => {
        it('ModerationReviewQueue works without stores (legacy mode)', () => {
            const queue = new ModerationReviewQueue();

            queue.enqueueReview({
                subjectUri: SUBJECT_URI_1,
                reason: 'user-report:spam',
                requestedAt: '2026-02-27T10:00:00.000Z',
            });

            const item = queue.getState(SUBJECT_URI_1);
            expect(item).not.toBeNull();
            expect(item!.queueStatus).toBe('queued');

            const updated = queue.applyPolicyAction({
                subjectUri: SUBJECT_URI_1,
                actorDid: MOD_DID,
                action: 'delist',
                reason: 'Spam',
                occurredAt: '2026-02-27T10:05:00.000Z',
            });

            expect(updated.visibility).toBe('delisted');

            const trail = queue.listAuditTrail(SUBJECT_URI_1);
            expect(trail).toHaveLength(1);
            expect(trail[0]!.idempotencyKey).toBeDefined();
        });

        it('ModerationWorkerService works without options (legacy factory)', () => {
            const service = createFixtureModerationWorkerService();

            const result = service.enqueueFromParams(
                new URLSearchParams({
                    subjectUri: SUBJECT_URI_1,
                    reason: 'user-report:spam',
                    requestedAt: '2026-02-27T10:00:00.000Z',
                }),
            );

            expect(result.statusCode).toBe(200);
        });
    });
});
