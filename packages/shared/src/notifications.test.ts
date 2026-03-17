import { describe, expect, it } from 'vitest';
import {
    buildDedupeKey,
    canRetryDelivery,
    computeDeliveryRate,
    computeRetryDelay,
    createDefaultPreferences,
    createEmptyMetrics,
    DEFAULT_RETRY_POLICY,
    DEDUPE_WINDOW_MS,
    matchesNotificationFilter,
    resolveChannels,
    NOTIFICATION_TYPES,
    DELIVERY_CHANNELS,
    DELIVERY_STATUSES,
    NOTIFICATION_PRIORITIES,
    NOTIFICATION_FILTERS,
    type Notification,
    type UserNotificationPreferences,
} from './notifications.js';

const NOW = '2026-03-01T12:00:00.000Z';

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
// Enumerations
// ---------------------------------------------------------------------------

describe('notification enumerations', () => {
    it('defines notification types', () => {
        expect(NOTIFICATION_TYPES.length).toBeGreaterThan(0);
        expect(NOTIFICATION_TYPES).toContain('request_created');
        expect(NOTIFICATION_TYPES).toContain('shift_reminder');
        expect(NOTIFICATION_TYPES).toContain('system_announcement');
    });

    it('defines delivery channels', () => {
        expect(DELIVERY_CHANNELS).toEqual(['in_app', 'email', 'push', 'webhook']);
    });

    it('defines delivery statuses', () => {
        expect(DELIVERY_STATUSES).toContain('pending');
        expect(DELIVERY_STATUSES).toContain('delivered');
        expect(DELIVERY_STATUSES).toContain('failed');
    });

    it('defines notification priorities', () => {
        expect(NOTIFICATION_PRIORITIES).toEqual(['low', 'normal', 'high', 'urgent']);
    });

    it('defines notification filters', () => {
        expect(NOTIFICATION_FILTERS).toEqual(['all', 'unread', 'read', 'archived']);
    });
});

// ---------------------------------------------------------------------------
// matchesNotificationFilter
// ---------------------------------------------------------------------------

describe('matchesNotificationFilter', () => {
    it('"all" returns non-archived notifications', () => {
        expect(matchesNotificationFilter(makeNotification(), 'all')).toBe(true);
        expect(matchesNotificationFilter(makeNotification({ archived: true }), 'all')).toBe(false);
    });

    it('"unread" returns unread, non-archived notifications', () => {
        expect(matchesNotificationFilter(makeNotification({ read: false }), 'unread')).toBe(true);
        expect(matchesNotificationFilter(makeNotification({ read: true }), 'unread')).toBe(false);
        expect(matchesNotificationFilter(makeNotification({ read: false, archived: true }), 'unread')).toBe(false);
    });

    it('"read" returns read, non-archived notifications', () => {
        expect(matchesNotificationFilter(makeNotification({ read: true }), 'read')).toBe(true);
        expect(matchesNotificationFilter(makeNotification({ read: false }), 'read')).toBe(false);
    });

    it('"archived" returns only archived notifications', () => {
        expect(matchesNotificationFilter(makeNotification({ archived: true }), 'archived')).toBe(true);
        expect(matchesNotificationFilter(makeNotification({ archived: false }), 'archived')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

describe('dedupe', () => {
    it('builds a deterministic dedupe key', () => {
        const key = buildDedupeKey('did:example:alice', 'request_created', 'post-123');
        expect(key).toBe('did:example:alice:request_created:post-123');
    });

    it('different inputs produce different keys', () => {
        const key1 = buildDedupeKey('did:example:alice', 'request_created', 'post-1');
        const key2 = buildDedupeKey('did:example:alice', 'request_created', 'post-2');
        expect(key1).not.toBe(key2);
    });

    it('has a default dedupe window of 5 minutes', () => {
        expect(DEDUPE_WINDOW_MS).toBe(5 * 60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

describe('retry policy', () => {
    it('has sensible defaults', () => {
        expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
        expect(DEFAULT_RETRY_POLICY.backoffMs).toBe(1000);
        expect(DEFAULT_RETRY_POLICY.backoffMultiplier).toBe(2);
    });

    it('computes exponential backoff delay', () => {
        expect(computeRetryDelay(0)).toBe(0);
        expect(computeRetryDelay(1)).toBe(1000);
        expect(computeRetryDelay(2)).toBe(2000);
        expect(computeRetryDelay(3)).toBe(4000);
    });

    it('allows retry when under max attempts', () => {
        expect(canRetryDelivery(0)).toBe(true);
        expect(canRetryDelivery(1)).toBe(true);
        expect(canRetryDelivery(2)).toBe(true);
        expect(canRetryDelivery(3)).toBe(false);
    });

    it('respects custom retry policy', () => {
        const custom = { maxAttempts: 5, backoffMs: 500, backoffMultiplier: 3 };
        expect(canRetryDelivery(4, custom)).toBe(true);
        expect(canRetryDelivery(5, custom)).toBe(false);
        expect(computeRetryDelay(2, custom)).toBe(1500);
    });
});

// ---------------------------------------------------------------------------
// Default preferences
// ---------------------------------------------------------------------------

describe('createDefaultPreferences', () => {
    it('creates preferences with in_app enabled only', () => {
        const prefs = createDefaultPreferences('did:example:alice', NOW);
        expect(prefs.userDid).toBe('did:example:alice');
        expect(prefs.globalMute).toBe(false);
        expect(prefs.channels).toHaveLength(4);

        const inApp = prefs.channels.find(c => c.channel === 'in_app');
        expect(inApp?.enabled).toBe(true);

        const email = prefs.channels.find(c => c.channel === 'email');
        expect(email?.enabled).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('delivery metrics', () => {
    it('creates empty metrics with default values', () => {
        const metrics = createEmptyMetrics(NOW);
        expect(metrics.totalSent).toBe(0);
        expect(metrics.totalDelivered).toBe(0);
        expect(metrics.deliveryRate).toBe(1);
        expect(metrics.byChannel.in_app.sent).toBe(0);
        expect(metrics.computedAt).toBe(NOW);
    });

    it('computes delivery rate', () => {
        expect(computeDeliveryRate(8, 10)).toBe(0.8);
        expect(computeDeliveryRate(0, 0)).toBe(1);
        expect(computeDeliveryRate(10, 10)).toBe(1);
        expect(computeDeliveryRate(0, 5)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Channel routing
// ---------------------------------------------------------------------------

describe('resolveChannels', () => {
    const makePrefs = (overrides: Partial<UserNotificationPreferences> = {}): UserNotificationPreferences => ({
        ...createDefaultPreferences('did:example:alice', NOW),
        ...overrides,
    });

    it('returns only in_app by default (only in_app enabled)', () => {
        const channels = resolveChannels(
            { type: 'request_created', priority: 'normal' },
            makePrefs(),
        );
        expect(channels).toEqual(['in_app']);
    });

    it('includes enabled channels', () => {
        const prefs = makePrefs();
        prefs.channels = prefs.channels.map(c =>
            c.channel === 'email' ? { ...c, enabled: true } : c,
        );

        const channels = resolveChannels(
            { type: 'request_created', priority: 'normal' },
            prefs,
        );
        expect(channels).toContain('in_app');
        expect(channels).toContain('email');
    });

    it('filters by allowedTypes when specified', () => {
        const prefs = makePrefs();
        prefs.channels = prefs.channels.map(c =>
            c.channel === 'email'
                ? { ...c, enabled: true, allowedTypes: ['message_received'] }
                : c,
        );

        const channels = resolveChannels(
            { type: 'request_created', priority: 'normal' },
            prefs,
        );
        expect(channels).not.toContain('email');

        const channels2 = resolveChannels(
            { type: 'message_received', priority: 'normal' },
            prefs,
        );
        expect(channels2).toContain('email');
    });

    it('urgent notifications bypass global mute for external channels', () => {
        const prefs = makePrefs({ globalMute: true });
        prefs.channels = prefs.channels.map(c =>
            c.channel === 'push' ? { ...c, enabled: true } : c,
        );

        const channels = resolveChannels(
            { type: 'request_created', priority: 'urgent' },
            prefs,
        );
        expect(channels).toContain('in_app');
        expect(channels).toContain('push');
    });

    it('global mute restricts non-urgent to in_app only', () => {
        const prefs = makePrefs({ globalMute: true });
        prefs.channels = prefs.channels.map(c =>
            c.channel === 'email' ? { ...c, enabled: true } : c,
        );

        const channels = resolveChannels(
            { type: 'request_created', priority: 'normal' },
            prefs,
        );
        expect(channels).toEqual(['in_app']);
    });

    it('always includes in_app even if user disabled it', () => {
        const prefs = makePrefs();
        prefs.channels = prefs.channels.map(c =>
            c.channel === 'in_app' ? { ...c, enabled: false } : c,
        );

        const channels = resolveChannels(
            { type: 'request_created', priority: 'normal' },
            prefs,
        );
        expect(channels).toContain('in_app');
    });
});
