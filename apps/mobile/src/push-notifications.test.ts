import { describe, expect, it } from 'vitest';
import {
    PushNotificationHandler,
    type PushNotificationPayload,
} from './push-notifications.js';
import { mobileContractStubs } from '@patchwork/shared';

const createHandler = () =>
    new PushNotificationHandler(mobileContractStubs.deviceInfo);

describe('PushNotificationHandler', () => {
    it('registers a push token', () => {
        const handler = createHandler();
        const result = handler.register('new-token-xyz');

        expect(result.registered).toBe(true);
        expect(result.pushToken).toBe('new-token-xyz');
        expect(result.platform).toBe('ios');
        expect(handler.getPushToken()).toBe('new-token-xyz');
    });

    it('returns existing push token from device info', () => {
        const handler = createHandler();
        expect(handler.getPushToken()).toBe('push-token-stub-abc123');
    });

    it('resolves actionUrl /post/abc-123 to post flow', () => {
        const handler = createHandler();
        const payload: PushNotificationPayload = {
            notificationId: 'notif-1',
            type: 'request_created',
            title: 'New request',
            body: 'Someone needs help.',
            actionUrl: '/post/abc-123',
        };

        const intent = handler.resolveNavigationIntent(payload);
        expect(intent.flow).toBe('post');
        expect(intent.params).toEqual({ id: 'abc-123' });
    });

    it('resolves actionUrl /chat/conv-456 to chat flow', () => {
        const handler = createHandler();
        const payload: PushNotificationPayload = {
            notificationId: 'notif-2',
            type: 'message_received',
            title: 'New message',
            body: 'You have a new message.',
            actionUrl: '/chat/conv-456',
        };

        const intent = handler.resolveNavigationIntent(payload);
        expect(intent.flow).toBe('chat');
        expect(intent.params).toEqual({ conversationId: 'conv-456' });
    });

    it('resolves actionUrl /inbox to inbox flow', () => {
        const handler = createHandler();
        const payload: PushNotificationPayload = {
            notificationId: 'notif-3',
            type: 'request_assigned',
            title: 'Assignment',
            body: 'You have been assigned.',
            actionUrl: '/inbox',
        };

        const intent = handler.resolveNavigationIntent(payload);
        expect(intent.flow).toBe('inbox');
        expect(intent.params).toEqual({});
    });

    it('falls back to type-based routing when no actionUrl', () => {
        const handler = createHandler();
        const payload: PushNotificationPayload = {
            notificationId: 'notif-4',
            type: 'message_received',
            title: 'Message',
            body: 'New chat message.',
        };

        const intent = handler.resolveNavigationIntent(payload);
        expect(intent.flow).toBe('chat');
    });

    it('falls back to notifications flow for system announcements', () => {
        const handler = createHandler();
        const payload: PushNotificationPayload = {
            notificationId: 'notif-5',
            type: 'system_announcement',
            title: 'Update',
            body: 'Platform update available.',
        };

        const intent = handler.resolveNavigationIntent(payload);
        expect(intent.flow).toBe('notifications');
    });

    it('stores handled notifications', () => {
        const handler = createHandler();
        expect(handler.getReceivedCount()).toBe(0);

        handler.handleNotification({
            notificationId: 'notif-1',
            type: 'request_created',
            title: 'Title',
            body: 'Body',
        });

        handler.handleNotification({
            notificationId: 'notif-2',
            type: 'message_received',
            title: 'Title 2',
            body: 'Body 2',
        });

        expect(handler.getReceivedCount()).toBe(2);
        const received = handler.getReceivedNotifications();
        expect(received).toHaveLength(2);
        expect(received[0]!.notificationId).toBe('notif-1');
        expect(received[1]!.notificationId).toBe('notif-2');
    });

    it('handleNotification returns navigation intent', () => {
        const handler = createHandler();
        const intent = handler.handleNotification({
            notificationId: 'notif-1',
            type: 'handoff_completed',
            title: 'Handoff',
            body: 'Delivery completed.',
            actionUrl: '/inbox',
        });

        expect(intent.flow).toBe('inbox');
    });

    it('resolves unknown actionUrl via type fallback', () => {
        const handler = createHandler();
        const intent = handler.resolveNavigationIntent({
            notificationId: 'notif-x',
            type: 'shift_reminder',
            title: 'Shift',
            body: 'Your shift starts soon.',
            actionUrl: '/unknown/path',
        });

        expect(intent.flow).toBe('inbox');
    });
});
