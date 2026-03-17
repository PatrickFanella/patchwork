import { describe, expect, it, beforeEach } from 'vitest';
import { NotificationService } from './notification-service.js';
import type { ChannelPreference } from '@patchwork/shared';

const USER_DID = 'did:example:alice';
const NOW = '2026-03-01T12:00:00.000Z';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('NotificationService', () => {
    let service: NotificationService;

    beforeEach(() => {
        service = new NotificationService();
    });

    // -------------------------------------------------------------------
    // sendNotification
    // -------------------------------------------------------------------

    describe('sendNotification', () => {
        it('creates a notification and routes to in_app by default', () => {
            const result = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'New request',
                body: 'Someone needs help nearby',
                now: NOW,
            });

            expect(result.notification.id).toBeTruthy();
            expect(result.notification.type).toBe('request_created');
            expect(result.notification.read).toBe(false);
            expect(result.channels).toContain('in_app');
            expect(result.deduplicated).toBe(false);
        });

        it('deduplicates within the dedupe window', () => {
            const first = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'New request',
                body: 'Test',
                contextKey: 'post-123',
                now: NOW,
            });
            expect(first.deduplicated).toBe(false);

            const second = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'New request',
                body: 'Test',
                contextKey: 'post-123',
                now: NOW,
            });
            expect(second.deduplicated).toBe(true);
            expect(second.channels).toEqual([]);
        });

        it('does not deduplicate with different context keys', () => {
            service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Request A',
                body: 'Test',
                contextKey: 'post-1',
                now: NOW,
            });

            const second = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Request B',
                body: 'Test',
                contextKey: 'post-2',
                now: NOW,
            });
            expect(second.deduplicated).toBe(false);
        });

        it('routes to multiple channels when user preferences enable them', () => {
            service.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: true, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const result = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Multi-channel',
                body: 'Test',
                now: NOW,
            });

            expect(result.channels).toContain('in_app');
            expect(result.channels).toContain('email');
            expect(result.channels).toContain('push');
            expect(result.channels).not.toContain('webhook');
        });

        it('urgent notifications bypass global mute', () => {
            service.updatePreferences(USER_DID, {
                globalMute: true,
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const result = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Urgent',
                body: 'Critical',
                priority: 'urgent',
                now: NOW,
            });

            expect(result.channels).toContain('in_app');
            expect(result.channels).toContain('push');
        });
    });

    // -------------------------------------------------------------------
    // Read/unread controls
    // -------------------------------------------------------------------

    describe('read/unread controls', () => {
        it('marks a notification as read', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Test',
                body: 'Test',
                now: NOW,
            });

            expect(service.markRead(USER_DID, notification.id)).toBe(true);
            const notifs = service.getNotifications(USER_DID);
            expect(notifs[0]!.read).toBe(true);
        });

        it('marks a notification as unread', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Test',
                body: 'Test',
                now: NOW,
            });

            service.markRead(USER_DID, notification.id);
            expect(service.markUnread(USER_DID, notification.id)).toBe(true);
            const notifs = service.getNotifications(USER_DID);
            expect(notifs[0]!.read).toBe(false);
        });

        it('marks all as read', () => {
            service.sendNotification({ recipientDid: USER_DID, type: 'request_created', title: 'A', body: 'A', now: NOW });
            service.sendNotification({ recipientDid: USER_DID, type: 'message_received', title: 'B', body: 'B', now: NOW });

            const count = service.markAllRead(USER_DID);
            expect(count).toBe(2);
            expect(service.getUnreadCount(USER_DID)).toBe(0);
        });

        it('returns false for unknown user', () => {
            expect(service.markRead('did:example:unknown', 'notif-1')).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Archive
    // -------------------------------------------------------------------

    describe('archive', () => {
        it('archives a notification', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Test',
                body: 'Test',
                now: NOW,
            });

            expect(service.archiveNotification(USER_DID, notification.id)).toBe(true);
            const notifs = service.getNotifications(USER_DID);
            expect(notifs[0]!.archived).toBe(true);
        });

        it('archived notifications are excluded from unread count', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID,
                type: 'request_created',
                title: 'Test',
                body: 'Test',
                now: NOW,
            });

            service.archiveNotification(USER_DID, notification.id);
            expect(service.getUnreadCount(USER_DID)).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------

    describe('getFilteredNotifications', () => {
        it('filters by unread', () => {
            const { notification: n1 } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'A', body: 'A', now: NOW,
            });
            service.sendNotification({
                recipientDid: USER_DID, type: 'message_received', title: 'B', body: 'B', now: NOW,
            });
            service.markRead(USER_DID, n1.id);

            const result = service.getFilteredNotifications(USER_DID, 'unread');
            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.type).toBe('message_received');
        });

        it('filters by archived', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'A', body: 'A', now: NOW,
            });
            service.sendNotification({
                recipientDid: USER_DID, type: 'message_received', title: 'B', body: 'B', now: NOW,
            });
            service.archiveNotification(USER_DID, notification.id);

            const result = service.getFilteredNotifications(USER_DID, 'archived');
            expect(result.items).toHaveLength(1);
        });

        it('paginates results', () => {
            for (let i = 0; i < 5; i++) {
                service.sendNotification({
                    recipientDid: USER_DID, type: 'request_created', title: `N${i}`, body: `B${i}`, now: NOW,
                });
            }

            const page1 = service.getFilteredNotifications(USER_DID, 'all', undefined, 2);
            expect(page1.items).toHaveLength(2);
            expect(page1.nextCursor).toBeDefined();
            expect(page1.total).toBe(5);

            const page2 = service.getFilteredNotifications(USER_DID, 'all', page1.nextCursor, 2);
            expect(page2.items).toHaveLength(2);
        });
    });

    // -------------------------------------------------------------------
    // Channel preferences
    // -------------------------------------------------------------------

    describe('preferences', () => {
        it('returns default preferences for new user', () => {
            const prefs = service.getPreferences(USER_DID);
            expect(prefs.userDid).toBe(USER_DID);
            expect(prefs.globalMute).toBe(false);
            expect(prefs.channels).toHaveLength(4);
        });

        it('updates preferences', () => {
            const updated = service.updatePreferences(USER_DID, {
                globalMute: true,
            });
            expect(updated.globalMute).toBe(true);

            const fetched = service.getPreferences(USER_DID);
            expect(fetched.globalMute).toBe(true);
        });

        it('updates channel configuration', () => {
            const channels: ChannelPreference[] = [
                { channel: 'in_app', enabled: true, allowedTypes: [] },
                { channel: 'email', enabled: true, allowedTypes: ['message_received'] },
                { channel: 'push', enabled: false, allowedTypes: [] },
                { channel: 'webhook', enabled: false, allowedTypes: [] },
            ];

            const updated = service.updatePreferences(USER_DID, { channels });
            const emailChannel = updated.channels.find(c => c.channel === 'email');
            expect(emailChannel?.enabled).toBe(true);
            expect(emailChannel?.allowedTypes).toContain('message_received');
        });
    });

    // -------------------------------------------------------------------
    // Delivery attempts and retry
    // -------------------------------------------------------------------

    describe('delivery tracking', () => {
        it('creates delivery attempts for each channel', () => {
            service.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = service.getDeliveryAttempts(notification.id);
            expect(attempts).toHaveLength(2);
            expect(attempts.map(a => a.channel).sort()).toEqual(['email', 'in_app']);
        });

        it('marks in_app as delivered immediately', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = service.getDeliveryAttempts(notification.id);
            const inApp = attempts.find(a => a.channel === 'in_app');
            expect(inApp?.status).toBe('delivered');
        });

        it('auto-retries on failure', () => {
            service.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = service.getDeliveryAttempts(notification.id);
            const emailAttempt = attempts.find(a => a.channel === 'email')!;

            const failResult = service.failDelivery(notification.id, emailAttempt.id, 'SMTP error');
            expect(failResult.attempt.status).toBe('failed');
            expect(failResult.retried).toBe(true);
            expect(failResult.retryAttempt).toBeDefined();
            expect(failResult.retryAttempt!.attemptNumber).toBe(2);
        });

        it('stops retrying after max attempts', () => {
            const limited = new NotificationService({ maxAttempts: 1, backoffMs: 100, backoffMultiplier: 2 });
            limited.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const { notification } = limited.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = limited.getDeliveryAttempts(notification.id);
            const emailAttempt = attempts.find(a => a.channel === 'email')!;

            const failResult = limited.failDelivery(notification.id, emailAttempt.id, 'SMTP error');
            expect(failResult.retried).toBe(false);
        });

        it('confirms delivery', () => {
            service.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = service.getDeliveryAttempts(notification.id);
            const emailAttempt = attempts.find(a => a.channel === 'email')!;

            const confirmed = service.confirmDelivery(notification.id, emailAttempt.id);
            expect(confirmed?.status).toBe('delivered');
        });
    });

    // -------------------------------------------------------------------
    // Metrics
    // -------------------------------------------------------------------

    describe('metrics', () => {
        it('tracks delivery metrics', () => {
            service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'A', body: 'A', now: NOW,
            });
            service.sendNotification({
                recipientDid: USER_DID, type: 'message_received', title: 'B', body: 'B', now: NOW,
            });

            const metrics = service.getMetrics();
            expect(metrics.totalSent).toBe(2);
            expect(metrics.totalDelivered).toBe(2); // in_app auto-delivered
            expect(metrics.deliveryRate).toBe(1);
            expect(metrics.byChannel.in_app.delivered).toBe(2);
        });

        it('reflects failures in metrics', () => {
            service.updatePreferences(USER_DID, {
                channels: [
                    { channel: 'in_app', enabled: true, allowedTypes: [] },
                    { channel: 'email', enabled: true, allowedTypes: [] },
                    { channel: 'push', enabled: false, allowedTypes: [] },
                    { channel: 'webhook', enabled: false, allowedTypes: [] },
                ],
            });

            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const attempts = service.getDeliveryAttempts(notification.id);
            const emailAttempt = attempts.find(a => a.channel === 'email')!;
            service.failDelivery(notification.id, emailAttempt.id, 'SMTP error');

            const metrics = service.getMetrics();
            expect(metrics.totalFailed).toBe(1);
            expect(metrics.totalRetried).toBe(1);
            expect(metrics.byChannel.email.failed).toBe(1);
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('route handlers', () => {
        it('getNotificationsFromParams returns notifications', () => {
            service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const result = service.getNotificationsFromParams(toParams({ userDid: USER_DID }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { items: unknown[]; total: number };
            expect(body.items).toHaveLength(1);
        });

        it('getNotificationsFromParams returns 400 without userDid', () => {
            const result = service.getNotificationsFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('markReadFromParams marks as read', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const result = service.markReadFromParams({ userDid: USER_DID, notificationId: notification.id });
            expect(result.statusCode).toBe(200);
        });

        it('markReadFromParams returns 404 for nonexistent', () => {
            const result = service.markReadFromParams({ userDid: USER_DID, notificationId: 'nope' });
            expect(result.statusCode).toBe(404);
        });

        it('markUnreadFromParams marks as unread', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });
            service.markRead(USER_DID, notification.id);

            const result = service.markUnreadFromParams({ userDid: USER_DID, notificationId: notification.id });
            expect(result.statusCode).toBe(200);
        });

        it('archiveFromParams archives notification', () => {
            const { notification } = service.sendNotification({
                recipientDid: USER_DID, type: 'request_created', title: 'Test', body: 'T', now: NOW,
            });

            const result = service.archiveFromParams({ userDid: USER_DID, notificationId: notification.id });
            expect(result.statusCode).toBe(200);
        });

        it('getPreferencesFromParams returns preferences', () => {
            const result = service.getPreferencesFromParams(toParams({ userDid: USER_DID }));
            expect(result.statusCode).toBe(200);
        });

        it('updatePreferencesFromParams updates preferences', () => {
            const result = service.updatePreferencesFromParams({ userDid: USER_DID, globalMute: true });
            expect(result.statusCode).toBe(200);
            const body = result.body as { globalMute: boolean };
            expect(body.globalMute).toBe(true);
        });

        it('getMetricsFromParams returns metrics', () => {
            const result = service.getMetricsFromParams();
            expect(result.statusCode).toBe(200);
            const body = result.body as { totalSent: number };
            expect(typeof body.totalSent).toBe('number');
        });
    });
});
