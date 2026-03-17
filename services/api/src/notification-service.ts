import type {
    ChannelPreference,
    DeliveryAttempt,
    DeliveryChannel,
    DeliveryReliabilityMetrics,
    Notification,
    NotificationFilter,
    NotificationPriority,
    NotificationType,
    RetryPolicy,
    UserNotificationPreferences,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local implementations (avoids cross-workspace runtime import issues)
// ---------------------------------------------------------------------------

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxAttempts: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
};

const DEFAULT_CHANNEL_PREFERENCES: ChannelPreference[] = [
    { channel: 'in_app', enabled: true, allowedTypes: [] },
    { channel: 'email', enabled: false, allowedTypes: [] },
    { channel: 'push', enabled: false, allowedTypes: [] },
    { channel: 'webhook', enabled: false, allowedTypes: [] },
];

const buildDedupeKey = (
    recipientDid: string,
    type: NotificationType,
    contextKey: string,
): string => `${recipientDid}:${type}:${contextKey}`;

const canRetryDelivery = (
    attemptNumber: number,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean => attemptNumber < policy.maxAttempts;

const computeDeliveryRate = (delivered: number, total: number): number => {
    if (total === 0) return 1;
    return delivered / total;
};

const createDefaultPreferences = (
    userDid: string,
    now?: string,
): UserNotificationPreferences => ({
    userDid,
    channels: DEFAULT_CHANNEL_PREFERENCES.map(c => ({ ...c })),
    globalMute: false,
    updatedAt: now ?? new Date().toISOString(),
});

const createEmptyMetrics = (now?: string): DeliveryReliabilityMetrics => ({
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalSkipped: 0,
    totalRetried: 0,
    deliveryRate: 1,
    byChannel: {
        in_app: { sent: 0, delivered: 0, failed: 0 },
        email: { sent: 0, delivered: 0, failed: 0 },
        push: { sent: 0, delivered: 0, failed: 0 },
        webhook: { sent: 0, delivered: 0, failed: 0 },
    },
    computedAt: now ?? new Date().toISOString(),
});

const matchesNotificationFilter = (
    notification: Notification,
    filter: NotificationFilter,
): boolean => {
    switch (filter) {
        case 'all': return !notification.archived;
        case 'unread': return !notification.read && !notification.archived;
        case 'read': return notification.read && !notification.archived;
        case 'archived': return notification.archived;
    }
};

const resolveChannels = (
    notification: Pick<Notification, 'type' | 'priority'>,
    preferences: UserNotificationPreferences,
): DeliveryChannel[] => {
    if (notification.priority === 'urgent') {
        const channels: DeliveryChannel[] = ['in_app'];
        for (const pref of preferences.channels) {
            if (pref.channel !== 'in_app' && pref.enabled) {
                if (pref.allowedTypes.length === 0 || pref.allowedTypes.includes(notification.type)) {
                    channels.push(pref.channel);
                }
            }
        }
        return channels;
    }
    if (preferences.globalMute) return ['in_app'];
    const channels: DeliveryChannel[] = [];
    for (const pref of preferences.channels) {
        if (!pref.enabled) continue;
        if (pref.allowedTypes.length === 0 || pref.allowedTypes.includes(notification.type)) {
            channels.push(pref.channel);
        }
    }
    if (!channels.includes('in_app')) channels.unshift('in_app');
    return channels;
};

// ---------------------------------------------------------------------------
// Route result types
// ---------------------------------------------------------------------------

export interface NotificationRouteResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// Notification service
// ---------------------------------------------------------------------------

export class NotificationService {
    private readonly notifications = new Map<string, Notification[]>();
    private readonly preferences = new Map<string, UserNotificationPreferences>();
    private readonly deliveryAttempts = new Map<string, DeliveryAttempt[]>();
    private readonly dedupeCache = new Map<string, number>(); // key -> timestamp
    private readonly metrics: DeliveryReliabilityMetrics;
    private readonly retryPolicy: RetryPolicy;
    private idCounter = 0;

    constructor(retryPolicy?: RetryPolicy) {
        this.retryPolicy = retryPolicy ?? DEFAULT_RETRY_POLICY;
        this.metrics = createEmptyMetrics();
    }

    // -------------------------------------------------------------------
    // Notification CRUD
    // -------------------------------------------------------------------

    /**
     * Send a notification to a user. Performs dedupe check, resolves
     * delivery channels, and creates delivery attempts.
     */
    sendNotification(input: {
        recipientDid: string;
        type: NotificationType;
        title: string;
        body: string;
        priority?: NotificationPriority;
        actionUrl?: string;
        metadata?: Record<string, unknown>;
        contextKey?: string;
        now?: string;
    }): { notification: Notification; channels: DeliveryChannel[]; deduplicated: boolean } {
        const now = input.now ?? new Date().toISOString();
        const priority = input.priority ?? 'normal';

        // Dedupe check
        if (input.contextKey) {
            const dedupeKey = buildDedupeKey(input.recipientDid, input.type, input.contextKey);
            const lastSent = this.dedupeCache.get(dedupeKey);
            if (lastSent && (new Date(now).getTime() - lastSent) < DEDUPE_WINDOW_MS) {
                // Find the existing notification to return
                const existing = this.getNotifications(input.recipientDid)
                    .find(n => n.type === input.type && !n.archived);
                if (existing) {
                    return { notification: existing, channels: [], deduplicated: true };
                }
            }
            this.dedupeCache.set(dedupeKey, new Date(now).getTime());
        }

        this.idCounter += 1;
        const notification: Notification = {
            id: `notif-${this.idCounter}`,
            type: input.type,
            recipientDid: input.recipientDid,
            title: input.title,
            body: input.body,
            priority,
            read: false,
            archived: false,
            actionUrl: input.actionUrl,
            metadata: input.metadata,
            createdAt: now,
            updatedAt: now,
        };

        const userNotifs = this.notifications.get(input.recipientDid) ?? [];
        userNotifs.unshift(notification);
        this.notifications.set(input.recipientDid, userNotifs);

        // Resolve channels
        const prefs = this.getPreferences(input.recipientDid);
        const channels = resolveChannels(
            { type: notification.type, priority: notification.priority },
            prefs,
        );

        // Create delivery attempts for each channel
        for (const channel of channels) {
            this.createDeliveryAttempt(notification.id, channel, now);
        }

        return { notification, channels, deduplicated: false };
    }

    getNotifications(userDid: string): Notification[] {
        return this.notifications.get(userDid) ?? [];
    }

    getFilteredNotifications(
        userDid: string,
        filter: NotificationFilter = 'all',
        cursor?: string,
        limit: number = 20,
    ): { items: Notification[]; nextCursor?: string; total: number } {
        const allNotifs = this.getNotifications(userDid);
        const filtered = allNotifs.filter(n => matchesNotificationFilter(n, filter));

        let startIndex = 0;
        if (cursor) {
            const cursorIdx = filtered.findIndex(n => n.id === cursor);
            if (cursorIdx >= 0) {
                startIndex = cursorIdx + 1;
            }
        }

        const page = filtered.slice(startIndex, startIndex + limit);
        const hasMore = startIndex + limit < filtered.length;

        return {
            items: page,
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
            total: filtered.length,
        };
    }

    // -------------------------------------------------------------------
    // Read/unread/archive controls
    // -------------------------------------------------------------------

    markRead(userDid: string, notificationId: string): boolean {
        const notifs = this.notifications.get(userDid);
        if (!notifs) return false;
        const notif = notifs.find(n => n.id === notificationId);
        if (!notif) return false;
        notif.read = true;
        notif.updatedAt = new Date().toISOString();
        return true;
    }

    markUnread(userDid: string, notificationId: string): boolean {
        const notifs = this.notifications.get(userDid);
        if (!notifs) return false;
        const notif = notifs.find(n => n.id === notificationId);
        if (!notif) return false;
        notif.read = false;
        notif.updatedAt = new Date().toISOString();
        return true;
    }

    markAllRead(userDid: string): number {
        const notifs = this.notifications.get(userDid);
        if (!notifs) return 0;
        let count = 0;
        for (const notif of notifs) {
            if (!notif.read && !notif.archived) {
                notif.read = true;
                notif.updatedAt = new Date().toISOString();
                count++;
            }
        }
        return count;
    }

    archiveNotification(userDid: string, notificationId: string): boolean {
        const notifs = this.notifications.get(userDid);
        if (!notifs) return false;
        const notif = notifs.find(n => n.id === notificationId);
        if (!notif) return false;
        notif.archived = true;
        notif.updatedAt = new Date().toISOString();
        return true;
    }

    getUnreadCount(userDid: string): number {
        const notifs = this.getNotifications(userDid);
        return notifs.filter(n => !n.read && !n.archived).length;
    }

    // -------------------------------------------------------------------
    // Channel preferences
    // -------------------------------------------------------------------

    getPreferences(userDid: string): UserNotificationPreferences {
        return this.preferences.get(userDid) ?? createDefaultPreferences(userDid);
    }

    updatePreferences(
        userDid: string,
        update: Partial<Pick<UserNotificationPreferences, 'channels' | 'globalMute'>>,
        now?: string,
    ): UserNotificationPreferences {
        const existing = this.getPreferences(userDid);
        const updated: UserNotificationPreferences = {
            ...existing,
            ...update,
            userDid,
            updatedAt: now ?? new Date().toISOString(),
        };
        this.preferences.set(userDid, updated);
        return updated;
    }

    // -------------------------------------------------------------------
    // Delivery attempts and retry
    // -------------------------------------------------------------------

    private createDeliveryAttempt(
        notificationId: string,
        channel: DeliveryChannel,
        now: string,
    ): DeliveryAttempt {
        this.idCounter += 1;
        const attempt: DeliveryAttempt = {
            id: `attempt-${this.idCounter}`,
            notificationId,
            channel,
            status: 'pending',
            attemptNumber: 1,
            createdAt: now,
        };

        const attempts = this.deliveryAttempts.get(notificationId) ?? [];
        attempts.push(attempt);
        this.deliveryAttempts.set(notificationId, attempts);

        // Simulate immediate delivery for in_app channel
        if (channel === 'in_app') {
            attempt.status = 'delivered';
            attempt.deliveredAt = now;
            this.metrics.totalSent += 1;
            this.metrics.totalDelivered += 1;
            this.metrics.byChannel.in_app.sent += 1;
            this.metrics.byChannel.in_app.delivered += 1;
        } else {
            attempt.status = 'sent';
            attempt.sentAt = now;
            this.metrics.totalSent += 1;
            this.metrics.byChannel[channel].sent += 1;
        }

        this.metrics.deliveryRate = computeDeliveryRate(
            this.metrics.totalDelivered,
            this.metrics.totalSent,
        );

        return attempt;
    }

    getDeliveryAttempts(notificationId: string): DeliveryAttempt[] {
        return this.deliveryAttempts.get(notificationId) ?? [];
    }

    /**
     * Mark a delivery attempt as failed and optionally retry.
     */
    failDelivery(
        notificationId: string,
        attemptId: string,
        failureReason: string,
    ): { attempt: DeliveryAttempt; retried: boolean; retryAttempt?: DeliveryAttempt } {
        const attempts = this.deliveryAttempts.get(notificationId) ?? [];
        const attempt = attempts.find(a => a.id === attemptId);
        if (!attempt) {
            throw new Error(`Delivery attempt not found: ${attemptId}`);
        }

        attempt.status = 'failed';
        attempt.failureReason = failureReason;
        this.metrics.totalFailed += 1;
        this.metrics.byChannel[attempt.channel].failed += 1;
        this.metrics.deliveryRate = computeDeliveryRate(
            this.metrics.totalDelivered,
            this.metrics.totalSent,
        );

        // Auto-retry if allowed
        if (canRetryDelivery(attempt.attemptNumber, this.retryPolicy)) {
            this.idCounter += 1;
            const now = new Date().toISOString();
            const retryAttempt: DeliveryAttempt = {
                id: `attempt-${this.idCounter}`,
                notificationId,
                channel: attempt.channel,
                status: 'pending',
                attemptNumber: attempt.attemptNumber + 1,
                createdAt: now,
            };
            attempts.push(retryAttempt);
            this.metrics.totalRetried += 1;

            return { attempt, retried: true, retryAttempt };
        }

        return { attempt, retried: false };
    }

    /**
     * Mark a delivery attempt as delivered.
     */
    confirmDelivery(notificationId: string, attemptId: string): DeliveryAttempt | null {
        const attempts = this.deliveryAttempts.get(notificationId) ?? [];
        const attempt = attempts.find(a => a.id === attemptId);
        if (!attempt) return null;

        attempt.status = 'delivered';
        attempt.deliveredAt = new Date().toISOString();
        this.metrics.totalDelivered += 1;
        this.metrics.byChannel[attempt.channel].delivered += 1;
        this.metrics.deliveryRate = computeDeliveryRate(
            this.metrics.totalDelivered,
            this.metrics.totalSent,
        );

        return attempt;
    }

    // -------------------------------------------------------------------
    // Reliability metrics
    // -------------------------------------------------------------------

    getMetrics(): DeliveryReliabilityMetrics {
        return {
            ...this.metrics,
            computedAt: new Date().toISOString(),
        };
    }

    // -------------------------------------------------------------------
    // Route handlers (URL params pattern)
    // -------------------------------------------------------------------

    getNotificationsFromParams(params: URLSearchParams): NotificationRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        const filter = (params.get('filter')?.trim() ?? 'all') as NotificationFilter;
        const cursor = params.get('cursor')?.trim() || undefined;
        const limitStr = params.get('limit')?.trim();
        const limit = limitStr ? parseInt(limitStr, 10) : 20;

        const result = this.getFilteredNotifications(userDid, filter, cursor, limit);
        return { statusCode: 200, body: result };
    }

    markReadFromParams(body: unknown): NotificationRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        const notificationId = (typeof obj?.notificationId === 'string' ? obj.notificationId : '').trim();

        if (!userDid || !notificationId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: userDid, notificationId.' } },
            };
        }

        const success = this.markRead(userDid, notificationId);
        if (!success) {
            return {
                statusCode: 404,
                body: { error: { code: 'NOT_FOUND', message: 'Notification not found.' } },
            };
        }

        return { statusCode: 200, body: { ok: true } };
    }

    markUnreadFromParams(body: unknown): NotificationRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        const notificationId = (typeof obj?.notificationId === 'string' ? obj.notificationId : '').trim();

        if (!userDid || !notificationId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: userDid, notificationId.' } },
            };
        }

        const success = this.markUnread(userDid, notificationId);
        if (!success) {
            return {
                statusCode: 404,
                body: { error: { code: 'NOT_FOUND', message: 'Notification not found.' } },
            };
        }

        return { statusCode: 200, body: { ok: true } };
    }

    archiveFromParams(body: unknown): NotificationRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        const notificationId = (typeof obj?.notificationId === 'string' ? obj.notificationId : '').trim();

        if (!userDid || !notificationId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: userDid, notificationId.' } },
            };
        }

        const success = this.archiveNotification(userDid, notificationId);
        if (!success) {
            return {
                statusCode: 404,
                body: { error: { code: 'NOT_FOUND', message: 'Notification not found.' } },
            };
        }

        return { statusCode: 200, body: { ok: true } };
    }

    getPreferencesFromParams(params: URLSearchParams): NotificationRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        return { statusCode: 200, body: this.getPreferences(userDid) };
    }

    updatePreferencesFromParams(body: unknown): NotificationRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        const updated = this.updatePreferences(userDid, {
            channels: obj?.channels as UserNotificationPreferences['channels'] | undefined,
            globalMute: typeof obj?.globalMute === 'boolean' ? obj.globalMute : undefined,
        });

        return { statusCode: 200, body: updated };
    }

    getMetricsFromParams(): NotificationRouteResult {
        return { statusCode: 200, body: this.getMetrics() };
    }
}

export const createNotificationService = (
    retryPolicy?: RetryPolicy,
): NotificationService => {
    return new NotificationService(retryPolicy);
};
