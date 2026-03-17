import { describe, expect, it } from 'vitest';
import type {
    ModerationAuditRecord,
    ModerationQueueItem,
} from '@patchwork/shared';
import {
    canPerformModAction,
    getPermissions,
    toAuditTimeline,
    toModConsoleView,
    toPolicyActionView,
    toQueueTriageView,
    type ModeratorRole,
} from './moderation-console-ux.js';

const makeQueueItem = (
    overrides: Partial<ModerationQueueItem> & { subjectUri: string },
): ModerationQueueItem => ({
    queueId: `q-${overrides.subjectUri.slice(-6)}`,
    subjectType: 'aid-post',
    reasons: ['test reason'],
    latestReason: 'test reason',
    reportCount: 1,
    queueStatus: 'queued',
    visibility: 'visible',
    appealState: 'none',
    createdAt: '2026-03-01T00:00:00.000Z',
    requestedAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    context: {},
    ...overrides,
});

const makeAuditRecord = (
    overrides: Partial<ModerationAuditRecord>,
): ModerationAuditRecord => ({
    actionId: 'act-1',
    queueId: 'q-1',
    subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
    actorDid: 'did:example:mod-1',
    action: 'delist',
    reason: 'Spam content',
    occurredAt: '2026-03-01T01:00:00.000Z',
    idempotencyKey: 'idem-1',
    previousState: { queueStatus: 'queued', visibility: 'visible', appealState: 'none' },
    nextState: { queueStatus: 'resolved', visibility: 'delisted', appealState: 'none' },
    ...overrides,
});

describe('moderation console UX', () => {
    describe('permission matrix', () => {
        const allRoles: ModeratorRole[] = ['junior_mod', 'senior_mod', 'lead_mod', 'admin'];

        it('junior_mod can view queue and triage only', () => {
            expect(canPerformModAction('junior_mod', 'view_queue')).toBe(true);
            expect(canPerformModAction('junior_mod', 'triage')).toBe(true);
            expect(canPerformModAction('junior_mod', 'policy_action')).toBe(false);
            expect(canPerformModAction('junior_mod', 'escalation_review')).toBe(false);
            expect(canPerformModAction('junior_mod', 'bulk_action')).toBe(false);
            expect(canPerformModAction('junior_mod', 'manage_moderators')).toBe(false);
        });

        it('senior_mod adds policy_action', () => {
            expect(canPerformModAction('senior_mod', 'view_queue')).toBe(true);
            expect(canPerformModAction('senior_mod', 'triage')).toBe(true);
            expect(canPerformModAction('senior_mod', 'policy_action')).toBe(true);
            expect(canPerformModAction('senior_mod', 'escalation_review')).toBe(false);
            expect(canPerformModAction('senior_mod', 'bulk_action')).toBe(false);
        });

        it('lead_mod adds escalation review and bulk action', () => {
            expect(canPerformModAction('lead_mod', 'policy_action')).toBe(true);
            expect(canPerformModAction('lead_mod', 'escalation_review')).toBe(true);
            expect(canPerformModAction('lead_mod', 'bulk_action')).toBe(true);
            expect(canPerformModAction('lead_mod', 'manage_moderators')).toBe(false);
        });

        it('admin has all permissions', () => {
            expect(canPerformModAction('admin', 'view_queue')).toBe(true);
            expect(canPerformModAction('admin', 'triage')).toBe(true);
            expect(canPerformModAction('admin', 'policy_action')).toBe(true);
            expect(canPerformModAction('admin', 'escalation_review')).toBe(true);
            expect(canPerformModAction('admin', 'bulk_action')).toBe(true);
            expect(canPerformModAction('admin', 'manage_moderators')).toBe(true);
        });

        it('getPermissions returns correct structure for each role', () => {
            for (const role of allRoles) {
                const perms = getPermissions(role);
                expect(perms.role).toBe(role);
                expect(perms.allowed.length).toBeGreaterThan(0);
            }
        });
    });

    describe('queue triage view', () => {
        const items: ModerationQueueItem[] = [
            makeQueueItem({
                subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
                queueStatus: 'queued',
                reportCount: 5,
                updatedAt: '2026-03-01T02:00:00.000Z',
            }),
            makeQueueItem({
                subjectUri: 'at://did:example:bob/app.patchwork.aid.post/post-2',
                queueStatus: 'resolved',
                reportCount: 1,
                updatedAt: '2026-03-01T01:00:00.000Z',
            }),
            makeQueueItem({
                subjectUri: 'at://did:example:carol/app.patchwork.conversation.meta/conv-1',
                subjectType: 'conversation',
                queueStatus: 'queued',
                reportCount: 2,
                updatedAt: '2026-03-01T03:00:00.000Z',
            }),
        ];

        it('returns all items when no filters applied', () => {
            const view = toQueueTriageView(items, {}, 'senior_mod');
            expect(view.totalCount).toBe(3);
        });

        it('filters by queue status', () => {
            const view = toQueueTriageView(items, { status: 'queued' }, 'senior_mod');
            expect(view.totalCount).toBe(2);
            expect(view.items.every(item => item.queueStatus === 'queued')).toBe(true);
        });

        it('filters by high priority (reportCount >= 3)', () => {
            const view = toQueueTriageView(items, { priority: 'high' }, 'senior_mod');
            expect(view.totalCount).toBe(1);
            expect(view.items[0].reportCount).toBe(5);
        });

        it('filters by category', () => {
            const view = toQueueTriageView(items, { category: 'conversation' }, 'senior_mod');
            expect(view.totalCount).toBe(1);
            expect(view.items[0].subjectType).toBe('conversation');
        });

        it('sorts by updatedAt descending by default', () => {
            const view = toQueueTriageView(items, {}, 'senior_mod');
            for (let i = 1; i < view.items.length; i++) {
                expect(Date.parse(view.items[i - 1].updatedAt)).toBeGreaterThanOrEqual(
                    Date.parse(view.items[i].updatedAt),
                );
            }
        });

        it('sorts by reportCount when specified', () => {
            const view = toQueueTriageView(items, {}, 'senior_mod', 'reportCount');
            expect(view.items[0].reportCount).toBe(5);
        });

        it('filters by search text on subjectUri', () => {
            const view = toQueueTriageView(
                items,
                { searchText: 'carol' },
                'senior_mod',
            );
            expect(view.totalCount).toBe(1);
        });
    });

    describe('policy action availability per role', () => {
        const item = makeQueueItem({
            subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
        });

        it('junior_mod has no policy actions', () => {
            const view = toPolicyActionView(item, 'junior_mod');
            expect(view.availableActions).toHaveLength(0);
            expect(view.canEscalate).toBe(true);
        });

        it('senior_mod has visibility actions', () => {
            const view = toPolicyActionView(item, 'senior_mod');
            expect(view.availableActions).toContain('delist');
            expect(view.availableActions).toContain('suspend-visibility');
            expect(view.availableActions).toContain('restore-visibility');
            expect(view.availableActions).not.toContain('open-appeal');
            expect(view.canEscalate).toBe(true);
        });

        it('lead_mod has all actions including appeal handling', () => {
            const view = toPolicyActionView(item, 'lead_mod');
            expect(view.availableActions).toContain('delist');
            expect(view.availableActions).toContain('open-appeal');
            expect(view.availableActions).toContain('resolve-appeal-upheld');
            expect(view.canEscalate).toBe(false);
        });

        it('admin has all actions', () => {
            const view = toPolicyActionView(item, 'admin');
            expect(view.availableActions).toContain('resolve-appeal-rejected');
            expect(view.canEscalate).toBe(false);
        });

        it('always requires reason', () => {
            const view = toPolicyActionView(item, 'admin');
            expect(view.requiresReason).toBe(true);
        });
    });

    describe('audit timeline', () => {
        const records: ModerationAuditRecord[] = [
            makeAuditRecord({
                actionId: 'act-2',
                action: 'suspend-visibility',
                occurredAt: '2026-03-01T03:00:00.000Z',
            }),
            makeAuditRecord({
                actionId: 'act-1',
                action: 'delist',
                occurredAt: '2026-03-01T01:00:00.000Z',
            }),
            makeAuditRecord({
                actionId: 'act-3',
                action: 'open-appeal',
                occurredAt: '2026-03-01T05:00:00.000Z',
            }),
        ];

        it('orders entries chronologically (oldest first)', () => {
            const timeline = toAuditTimeline(records);
            expect(timeline.entries[0].actionId).toBe('act-1');
            expect(timeline.entries[1].actionId).toBe('act-2');
            expect(timeline.entries[2].actionId).toBe('act-3');
        });

        it('reports correct total count', () => {
            const timeline = toAuditTimeline(records);
            expect(timeline.totalCount).toBe(3);
        });

        it('maps visibility state from audit records', () => {
            const timeline = toAuditTimeline([
                makeAuditRecord({
                    previousState: { queueStatus: 'queued', visibility: 'visible', appealState: 'none' },
                    nextState: { queueStatus: 'resolved', visibility: 'delisted', appealState: 'none' },
                }),
            ]);
            expect(timeline.entries[0].previousVisibility).toBe('visible');
            expect(timeline.entries[0].nextVisibility).toBe('delisted');
        });

        it('returns empty timeline for no records', () => {
            const timeline = toAuditTimeline([]);
            expect(timeline.totalCount).toBe(0);
            expect(timeline.entries).toHaveLength(0);
        });
    });

    describe('full console view model', () => {
        it('assembles stats, triage, audit, and permissions', () => {
            const items = [
                makeQueueItem({
                    subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
                }),
            ];
            const auditRecords = [
                makeAuditRecord({
                    subjectUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
                }),
            ];
            const stats = { queueDepth: 5, pendingCount: 3, avgWaitSeconds: 120, errorCount: 0 };

            const console = toModConsoleView(items, auditRecords, stats, 'lead_mod');

            expect(console.stats.queueDepth).toBe(5);
            expect(console.triage.totalCount).toBe(1);
            expect(console.selectedItemAudit).not.toBeNull();
            expect(console.selectedItemAudit!.totalCount).toBe(1);
            expect(console.role).toBe('lead_mod');
            expect(console.permissions.allowed).toContain('escalation_review');
        });

        it('selectedItemAudit is null when queue is empty', () => {
            const stats = { queueDepth: 0, pendingCount: 0, avgWaitSeconds: 0, errorCount: 0 };
            const console = toModConsoleView([], [], stats, 'admin');
            expect(console.selectedItemAudit).toBeNull();
        });
    });
});
