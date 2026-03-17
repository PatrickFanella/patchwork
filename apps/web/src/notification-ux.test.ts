import { describe, expect, it } from 'vitest';
import type { Notification, UserNotificationPreferences } from '@patchwork/shared';
import {
    defaultNotificationCenterState,
    formatNotificationTimeAgo,
    reduceNotificationCenterState,
    toChannelPreferenceViewModels,
    toNotificationCard,
    toNotificationCenter,
    toNotificationCountsBadge,
    toPreferencesPanel,
} from './notification-ux.js';

const NOW = '2026-03-01T12:00:00.000Z';

const makePreferences = (overrides: Partial<UserNotificationPreferences> = {}): UserNotificationPreferences => ({
    userDid: 'did:example:alice',
    channels: [
        { channel: 'in_app', enabled: true, allowedTypes: [] },
        { channel: 'email', enabled: false, allowedTypes: [] },
        { channel: 'push', enabled: false, allowedTypes: [] },
        { channel: 'webhook', enabled: false, allowedTypes: [] },
    ],
    globalMute: false,
    updatedAt: NOW,
    ...overrides,
});

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: 'notif-1',
    type: 'request_created',
    recipientDid: 'did:example:alice',
    title: 'New request nearby',
    body: 'Someone needs help with groceries',
    priority: 'normal',
    read: false,
    archived: false,
    actionUrl: '/feed/request-123',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

// ---------------------------------------------------------------------------
// formatNotificationTimeAgo
// ---------------------------------------------------------------------------

describe('formatNotificationTimeAgo', () => {
    it('returns "just now" for recent timestamps', () => {
        const recent = new Date(Date.now() - 10_000).toISOString();
        expect(formatNotificationTimeAgo(recent)).toBe('just now');
    });

    it('returns minutes for timestamps under an hour', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        expect(formatNotificationTimeAgo(fiveMinAgo)).toBe('5m ago');
    });

    it('returns hours for timestamps under a day', () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
        expect(formatNotificationTimeAgo(threeHoursAgo)).toBe('3h ago');
    });

    it('returns "unknown" for invalid timestamps', () => {
        expect(formatNotificationTimeAgo('not-a-date')).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// toNotificationCard
// ---------------------------------------------------------------------------

describe('toNotificationCard', () => {
    it('maps notification to card view model', () => {
        const card = toNotificationCard(makeNotification());
        expect(card.id).toBe('notif-1');
        expect(card.typeIcon).toBe('plus-circle');
        expect(card.typeLabel).toBe('New Request');
        expect(card.title).toBe('New request nearby');
        expect(card.read).toBe(false);
        expect(card.priorityBadge.label).toBe('Normal');
        expect(card.priorityBadge.tone).toBe('neutral');
    });

    it('maps shift_reminder type', () => {
        const card = toNotificationCard(makeNotification({ type: 'shift_reminder' }));
        expect(card.typeIcon).toBe('clock');
        expect(card.typeLabel).toBe('Shift Reminder');
    });

    it('maps urgent priority', () => {
        const card = toNotificationCard(makeNotification({ priority: 'urgent' }));
        expect(card.priorityBadge.label).toBe('Urgent');
        expect(card.priorityBadge.tone).toBe('danger');
    });

    it('maps system_announcement type', () => {
        const card = toNotificationCard(makeNotification({ type: 'system_announcement' }));
        expect(card.typeIcon).toBe('megaphone');
        expect(card.typeLabel).toBe('Announcement');
    });

    it('includes actionUrl', () => {
        const card = toNotificationCard(makeNotification({ actionUrl: '/inbox' }));
        expect(card.actionUrl).toBe('/inbox');
    });
});

// ---------------------------------------------------------------------------
// toNotificationCountsBadge
// ---------------------------------------------------------------------------

describe('toNotificationCountsBadge', () => {
    it('shows unread count', () => {
        const badge = toNotificationCountsBadge(10, 5);
        expect(badge.unread).toBe(5);
        expect(badge.label).toBe('5');
        expect(badge.visible).toBe(true);
    });

    it('caps label at 99+', () => {
        const badge = toNotificationCountsBadge(200, 150);
        expect(badge.label).toBe('99+');
    });

    it('hides badge when no unread', () => {
        const badge = toNotificationCountsBadge(10, 0);
        expect(badge.visible).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// toNotificationCenter
// ---------------------------------------------------------------------------

describe('toNotificationCenter', () => {
    it('builds notification center view model', () => {
        const notifications = [
            makeNotification({ id: 'n1' }),
            makeNotification({ id: 'n2', type: 'message_received' }),
        ];

        const center = toNotificationCenter(notifications, 10, 2);
        expect(center.cards).toHaveLength(2);
        expect(center.activeFilter).toBe('all');
        expect(center.isEmpty).toBe(false);
        expect(center.countsBadge.unread).toBe(2);
    });

    it('shows empty state when no notifications', () => {
        const center = toNotificationCenter([], 0, 0);
        expect(center.isEmpty).toBe(true);
        expect(center.cards).toHaveLength(0);
    });

    it('passes hasMore and loading flags', () => {
        const center = toNotificationCenter(
            [makeNotification()], 5, 3, 'all', true, true,
        );
        expect(center.hasMore).toBe(true);
        expect(center.loading).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Channel preference view models
// ---------------------------------------------------------------------------

describe('channel preference view models', () => {
    it('builds channel preference view models', () => {
        const prefs = makePreferences();
        const vms = toChannelPreferenceViewModels(prefs);

        expect(vms).toHaveLength(4);
        const inApp = vms.find(v => v.channel === 'in_app');
        expect(inApp?.channelLabel).toBe('In-App');
        expect(inApp?.channelIcon).toBe('bell');
        expect(inApp?.enabled).toBe(true);

        const email = vms.find(v => v.channel === 'email');
        expect(email?.channelLabel).toBe('Email');
        expect(email?.enabled).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Preferences panel
// ---------------------------------------------------------------------------

describe('toPreferencesPanel', () => {
    it('builds preferences panel view model', () => {
        const prefs = makePreferences();
        const panel = toPreferencesPanel(prefs);

        expect(panel.globalMute).toBe(false);
        expect(panel.channels).toHaveLength(4);
        expect(panel.lastUpdated).toBe(NOW);
    });
});

// ---------------------------------------------------------------------------
// Notification center state reducer
// ---------------------------------------------------------------------------

describe('notification center state reducer', () => {
    it('loads initial page', () => {
        const notifications = [
            makeNotification({ id: 'n1' }),
            makeNotification({ id: 'n2' }),
        ];

        const state = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications,
            total: 10,
            unread: 2,
            filter: 'all',
            hasMore: true,
        });

        expect(state.cards).toHaveLength(2);
        expect(state.countsBadge.unread).toBe(2);
        expect(state.hasMore).toBe(true);
        expect(state.isEmpty).toBe(false);
    });

    it('marks a notification as read', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [makeNotification({ id: 'n1', read: false })],
            total: 1,
            unread: 1,
            filter: 'all',
            hasMore: false,
        });

        const next = reduceNotificationCenterState(initial, {
            type: 'mark-read',
            notificationId: 'n1',
        });

        expect(next.cards[0]!.read).toBe(true);
        expect(next.countsBadge.unread).toBe(0);
        expect(next.countsBadge.visible).toBe(false);
    });

    it('marks a notification as unread', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [makeNotification({ id: 'n1', read: true })],
            total: 1,
            unread: 0,
            filter: 'all',
            hasMore: false,
        });

        const next = reduceNotificationCenterState(initial, {
            type: 'mark-unread',
            notificationId: 'n1',
        });

        expect(next.cards[0]!.read).toBe(false);
        expect(next.countsBadge.unread).toBe(1);
        expect(next.countsBadge.visible).toBe(true);
    });

    it('marks all as read', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [
                makeNotification({ id: 'n1', read: false }),
                makeNotification({ id: 'n2', read: false }),
            ],
            total: 2,
            unread: 2,
            filter: 'all',
            hasMore: false,
        });

        const next = reduceNotificationCenterState(initial, {
            type: 'mark-all-read',
        });

        expect(next.cards.every(c => c.read)).toBe(true);
        expect(next.countsBadge.unread).toBe(0);
    });

    it('archives a notification', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [
                makeNotification({ id: 'n1' }),
                makeNotification({ id: 'n2' }),
            ],
            total: 2,
            unread: 2,
            filter: 'all',
            hasMore: false,
        });

        const next = reduceNotificationCenterState(initial, {
            type: 'archive',
            notificationId: 'n1',
        });

        expect(next.cards).toHaveLength(1);
        expect(next.cards[0]!.id).toBe('n2');
    });

    it('changes filter', () => {
        const next = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'filter-change',
            filter: 'unread',
        });

        expect(next.activeFilter).toBe('unread');
        expect(next.loading).toBe(true);
    });

    it('adds new notification at the top', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [makeNotification({ id: 'n1' })],
            total: 1,
            unread: 1,
            filter: 'all',
            hasMore: false,
        });

        const next = reduceNotificationCenterState(initial, {
            type: 'new-notification',
            notification: makeNotification({ id: 'n2', type: 'shift_reminder' }),
        });

        expect(next.cards).toHaveLength(2);
        expect(next.cards[0]!.id).toBe('n2');
        expect(next.countsBadge.unread).toBe(2);
    });

    it('handles load-more flow', () => {
        const initial = reduceNotificationCenterState(defaultNotificationCenterState, {
            type: 'load',
            notifications: [makeNotification({ id: 'n1' })],
            total: 3,
            unread: 3,
            filter: 'all',
            hasMore: true,
        });

        const loading = reduceNotificationCenterState(initial, {
            type: 'load-more-start',
        });
        expect(loading.loading).toBe(true);

        const completed = reduceNotificationCenterState(loading, {
            type: 'load-more-complete',
            notifications: [
                makeNotification({ id: 'n2' }),
                makeNotification({ id: 'n3' }),
            ],
            hasMore: false,
        });

        expect(completed.cards).toHaveLength(3);
        expect(completed.loading).toBe(false);
        expect(completed.hasMore).toBe(false);
    });
});
