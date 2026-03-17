/**
 * Push notification registration and handling for mobile clients.
 *
 * Integrates with the shared notification contracts and provides
 * mobile-specific push token management, payload parsing, and
 * navigation intent resolution.
 */

import type {
    CoreMobileFlow,
    MobileDeviceInfo,
    MobilePlatform,
    NotificationType,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Push notification payload
// ---------------------------------------------------------------------------

export interface PushNotificationPayload {
    notificationId: string;
    type: NotificationType;
    title: string;
    body: string;
    actionUrl?: string;
    data?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Registration result
// ---------------------------------------------------------------------------

export interface PushRegistrationResult {
    registered: boolean;
    pushToken: string;
    platform: MobilePlatform;
    registeredAt: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Navigation intent from push notification
// ---------------------------------------------------------------------------

export interface PushNavigationIntent {
    flow: CoreMobileFlow;
    params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Push notification handler
// ---------------------------------------------------------------------------

/**
 * Action URL to flow mapping.
 */
const ACTION_URL_FLOW_MAP: ReadonlyArray<{
    prefix: string;
    flow: CoreMobileFlow;
    paramKey?: string;
}> = [
    { prefix: '/map', flow: 'map' },
    { prefix: '/feed', flow: 'feed' },
    { prefix: '/post/', flow: 'post', paramKey: 'id' },
    { prefix: '/chat/', flow: 'chat', paramKey: 'conversationId' },
    { prefix: '/inbox', flow: 'inbox' },
    { prefix: '/notifications', flow: 'notifications' },
    { prefix: '/profile', flow: 'profile' },
    { prefix: '/settings', flow: 'settings' },
];

/**
 * Notification type to default flow mapping.
 */
const TYPE_DEFAULT_FLOW: Partial<Record<NotificationType, CoreMobileFlow>> = {
    message_received: 'chat',
    request_created: 'feed',
    request_assigned: 'inbox',
    assignment_accepted: 'inbox',
    assignment_declined: 'inbox',
    handoff_completed: 'inbox',
    feedback_requested: 'inbox',
    shift_reminder: 'inbox',
    shift_conflict: 'inbox',
    shift_no_show: 'inbox',
    system_announcement: 'notifications',
};

export class PushNotificationHandler {
    private pushToken: string | undefined;
    private readonly deviceInfo: MobileDeviceInfo;
    private readonly receivedNotifications: PushNotificationPayload[] = [];

    constructor(deviceInfo: MobileDeviceInfo) {
        this.deviceInfo = deviceInfo;
        this.pushToken = deviceInfo.pushToken;
    }

    /**
     * Simulate push token registration. In a real implementation this
     * would call the native push API (APNs / FCM).
     */
    register(pushToken: string): PushRegistrationResult {
        this.pushToken = pushToken;
        return {
            registered: true,
            pushToken,
            platform: this.deviceInfo.platform,
            registeredAt: new Date().toISOString(),
        };
    }

    /**
     * Get the current push token, if registered.
     */
    getPushToken(): string | undefined {
        return this.pushToken;
    }

    /**
     * Handle an incoming push notification payload.
     * Stores the notification and returns a navigation intent.
     */
    handleNotification(
        payload: PushNotificationPayload,
    ): PushNavigationIntent {
        this.receivedNotifications.push(payload);
        return this.resolveNavigationIntent(payload);
    }

    /**
     * Resolve a push notification to a navigation intent based on
     * the actionUrl or notification type.
     */
    resolveNavigationIntent(
        payload: PushNotificationPayload,
    ): PushNavigationIntent {
        // Try actionUrl first
        if (payload.actionUrl) {
            const path =
                payload.actionUrl.startsWith('/')
                    ? payload.actionUrl
                    : `/${payload.actionUrl}`;

            for (const mapping of ACTION_URL_FLOW_MAP) {
                if (path.startsWith(mapping.prefix)) {
                    const params: Record<string, string> = {};
                    if (mapping.paramKey) {
                        const value = path.slice(mapping.prefix.length);
                        if (value.length > 0) {
                            params[mapping.paramKey] = value;
                        }
                    }
                    return { flow: mapping.flow, params };
                }
            }
        }

        // Fall back to type-based routing
        const defaultFlow = TYPE_DEFAULT_FLOW[payload.type] ?? 'notifications';
        return {
            flow: defaultFlow,
            params: payload.data ?? {},
        };
    }

    /**
     * Get all received notifications since handler creation.
     */
    getReceivedNotifications(): readonly PushNotificationPayload[] {
        return [...this.receivedNotifications];
    }

    /**
     * Get unread count (simple count of received notifications).
     */
    getReceivedCount(): number {
        return this.receivedNotifications.length;
    }
}
