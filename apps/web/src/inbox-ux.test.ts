import { describe, expect, it } from 'vitest';
import type { InboxCounts, InboxItem } from '@patchwork/shared';
import {
    formatTimeAgo,
    toCountsBadge,
    toInboxCard,
    toInboxDashboard,
} from './inbox-ux.js';

const NOW_ISO = '2026-03-01T12:00:00.000Z';

const makeItem = (overrides: Partial<InboxItem> = {}): InboxItem => ({
    id: 'item-1',
    type: 'request_created',
    title: 'New food request',
    summary: 'Someone needs groceries nearby',
    timestamp: NOW_ISO,
    read: false,
    actionUrl: '/feed/request-123',
    ...overrides,
});

const makeCounts = (overrides: Partial<InboxCounts> = {}): InboxCounts => ({
    total: 5,
    unread: 3,
    byType: { request_created: 2, message_received: 3 },
    ...overrides,
});

// ---------------------------------------------------------------------------
// formatTimeAgo
// ---------------------------------------------------------------------------

describe('formatTimeAgo', () => {
    it('returns "just now" for recent timestamps', () => {
        const recent = new Date(Date.now() - 10_000).toISOString();
        expect(formatTimeAgo(recent)).toBe('just now');
    });

    it('returns minutes for timestamps under an hour', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        expect(formatTimeAgo(fiveMinAgo)).toBe('5m ago');
    });

    it('returns hours for timestamps under a day', () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
        expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago');
    });

    it('returns days for timestamps under a week', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
        expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago');
    });

    it('returns weeks for older timestamps', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
        expect(formatTimeAgo(twoWeeksAgo)).toBe('2w ago');
    });

    it('returns "unknown" for invalid timestamps', () => {
        expect(formatTimeAgo('not-a-date')).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// toInboxCard
// ---------------------------------------------------------------------------

describe('toInboxCard', () => {
    it('maps item to card view model', () => {
        const card = toInboxCard(makeItem());
        expect(card.id).toBe('item-1');
        expect(card.typeIcon).toBe('plus-circle');
        expect(card.typeLabel).toBe('New Request');
        expect(card.title).toBe('New food request');
        expect(card.read).toBe(false);
        expect(card.actionUrl).toBe('/feed/request-123');
    });

    it('maps message type correctly', () => {
        const card = toInboxCard(makeItem({ type: 'message_received' }));
        expect(card.typeIcon).toBe('message-circle');
        expect(card.typeLabel).toBe('Message');
    });

    it('maps handoff type correctly', () => {
        const card = toInboxCard(makeItem({ type: 'handoff_completed' }));
        expect(card.typeIcon).toBe('package');
        expect(card.typeLabel).toBe('Handoff');
    });

    it('shows read state', () => {
        const card = toInboxCard(makeItem({ read: true }));
        expect(card.read).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// toCountsBadge
// ---------------------------------------------------------------------------

describe('toCountsBadge', () => {
    it('shows unread count', () => {
        const badge = toCountsBadge(makeCounts({ unread: 5 }));
        expect(badge.unread).toBe(5);
        expect(badge.label).toBe('5');
        expect(badge.visible).toBe(true);
    });

    it('caps label at 99+', () => {
        const badge = toCountsBadge(makeCounts({ unread: 150 }));
        expect(badge.label).toBe('99+');
    });

    it('hides badge when no unread', () => {
        const badge = toCountsBadge(makeCounts({ unread: 0 }));
        expect(badge.visible).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// toInboxDashboard
// ---------------------------------------------------------------------------

describe('toInboxDashboard', () => {
    it('builds dashboard view model', () => {
        const items = [
            makeItem({ id: 'i1', type: 'request_created' }),
            makeItem({ id: 'i2', type: 'message_received' }),
        ];
        const counts = makeCounts();

        const dashboard = toInboxDashboard(items, counts);
        expect(dashboard.cards).toHaveLength(2);
        expect(dashboard.activeFilter).toBe('all');
        expect(dashboard.isEmpty).toBe(false);
        expect(dashboard.loading).toBe(false);
    });

    it('filters items by filter param', () => {
        const items = [
            makeItem({ id: 'i1', type: 'request_created' }),
            makeItem({ id: 'i2', type: 'message_received' }),
        ];
        const counts = makeCounts();

        const dashboard = toInboxDashboard(items, counts, 'messages');
        expect(dashboard.cards).toHaveLength(1);
        expect(dashboard.cards[0]!.type).toBe('message_received');
        expect(dashboard.activeFilter).toBe('messages');
    });

    it('shows empty state when no items match', () => {
        const dashboard = toInboxDashboard([], makeCounts({ total: 0, unread: 0 }));
        expect(dashboard.isEmpty).toBe(true);
        expect(dashboard.cards).toHaveLength(0);
    });

    it('passes hasMore and loading flags', () => {
        const dashboard = toInboxDashboard(
            [makeItem()],
            makeCounts(),
            'all',
            true,
            true,
        );
        expect(dashboard.hasMore).toBe(true);
        expect(dashboard.loading).toBe(true);
    });
});
