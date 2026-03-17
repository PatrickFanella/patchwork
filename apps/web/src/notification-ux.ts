import type {
    DeliveryChannel,
    Notification,
    NotificationFilter,
    NotificationPriority,
    NotificationType,
    UserNotificationPreferences,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Notification card view model
// ---------------------------------------------------------------------------

export interface NotificationCardViewModel {
    id: string;
    type: NotificationType;
    typeIcon: string;
    typeLabel: string;
    title: string;
    body: string;
    priority: NotificationPriority;
    priorityBadge: { label: string; tone: 'neutral' | 'info' | 'danger' };
    timeAgo: string;
    read: boolean;
    archived: boolean;
    actionUrl?: string;
}

const TYPE_ICON_MAP: Record<NotificationType, string> = {
    request_created: 'plus-circle',
    request_assigned: 'user-plus',
    assignment_accepted: 'check-circle',
    assignment_declined: 'x-circle',
    handoff_completed: 'package',
    message_received: 'message-circle',
    feedback_requested: 'star',
    shift_reminder: 'clock',
    shift_conflict: 'alert-triangle',
    shift_no_show: 'user-x',
    system_announcement: 'megaphone',
};

const TYPE_LABEL_MAP: Record<NotificationType, string> = {
    request_created: 'New Request',
    request_assigned: 'Assignment',
    assignment_accepted: 'Accepted',
    assignment_declined: 'Declined',
    handoff_completed: 'Handoff',
    message_received: 'Message',
    feedback_requested: 'Feedback',
    shift_reminder: 'Shift Reminder',
    shift_conflict: 'Schedule Conflict',
    shift_no_show: 'No-Show Alert',
    system_announcement: 'Announcement',
};

const PRIORITY_BADGE_MAP: Record<NotificationPriority, { label: string; tone: 'neutral' | 'info' | 'danger' }> = {
    low: { label: 'Low', tone: 'neutral' },
    normal: { label: 'Normal', tone: 'neutral' },
    high: { label: 'High', tone: 'info' },
    urgent: { label: 'Urgent', tone: 'danger' },
};

export const formatNotificationTimeAgo = (timestamp: string): string => {
    const now = Date.now();
    const then = Date.parse(timestamp);

    if (Number.isNaN(then)) return 'unknown';

    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
};

export const toNotificationCard = (notification: Notification): NotificationCardViewModel => ({
    id: notification.id,
    type: notification.type,
    typeIcon: TYPE_ICON_MAP[notification.type],
    typeLabel: TYPE_LABEL_MAP[notification.type],
    title: notification.title,
    body: notification.body,
    priority: notification.priority,
    priorityBadge: PRIORITY_BADGE_MAP[notification.priority],
    timeAgo: formatNotificationTimeAgo(notification.createdAt),
    read: notification.read,
    archived: notification.archived,
    actionUrl: notification.actionUrl,
});

// ---------------------------------------------------------------------------
// Notification center counts badge
// ---------------------------------------------------------------------------

export interface NotificationCountsBadge {
    total: number;
    unread: number;
    label: string;
    visible: boolean;
}

export const toNotificationCountsBadge = (
    total: number,
    unread: number,
): NotificationCountsBadge => ({
    total,
    unread,
    label: unread > 99 ? '99+' : String(unread),
    visible: unread > 0,
});

// ---------------------------------------------------------------------------
// Notification center dashboard
// ---------------------------------------------------------------------------

export interface NotificationCenterViewModel {
    cards: NotificationCardViewModel[];
    countsBadge: NotificationCountsBadge;
    activeFilter: NotificationFilter;
    hasMore: boolean;
    isEmpty: boolean;
    loading: boolean;
}

export const toNotificationCenter = (
    notifications: Notification[],
    total: number,
    unreadCount: number,
    filter: NotificationFilter = 'all',
    hasMore: boolean = false,
    loading: boolean = false,
): NotificationCenterViewModel => ({
    cards: notifications.map(toNotificationCard),
    countsBadge: toNotificationCountsBadge(total, unreadCount),
    activeFilter: filter,
    hasMore,
    isEmpty: notifications.length === 0,
    loading,
});

// ---------------------------------------------------------------------------
// Channel preference view model
// ---------------------------------------------------------------------------

export interface ChannelPreferenceViewModel {
    channel: DeliveryChannel;
    channelLabel: string;
    channelIcon: string;
    enabled: boolean;
    typeFilterCount: number;
}

const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
    in_app: 'In-App',
    email: 'Email',
    push: 'Push Notifications',
    webhook: 'Webhook',
};

const CHANNEL_ICONS: Record<DeliveryChannel, string> = {
    in_app: 'bell',
    email: 'mail',
    push: 'smartphone',
    webhook: 'link',
};

export const toChannelPreferenceViewModels = (
    preferences: UserNotificationPreferences,
): ChannelPreferenceViewModel[] =>
    preferences.channels.map(pref => ({
        channel: pref.channel,
        channelLabel: CHANNEL_LABELS[pref.channel],
        channelIcon: CHANNEL_ICONS[pref.channel],
        enabled: pref.enabled,
        typeFilterCount: pref.allowedTypes.length,
    }));

// ---------------------------------------------------------------------------
// Preferences panel view model
// ---------------------------------------------------------------------------

export interface PreferencesPanelViewModel {
    globalMute: boolean;
    channels: ChannelPreferenceViewModel[];
    lastUpdated: string;
}

export const toPreferencesPanel = (
    preferences: UserNotificationPreferences,
): PreferencesPanelViewModel => ({
    globalMute: preferences.globalMute,
    channels: toChannelPreferenceViewModels(preferences),
    lastUpdated: preferences.updatedAt,
});

// ---------------------------------------------------------------------------
// Notification center state reducer
// ---------------------------------------------------------------------------

export type NotificationCenterEvent =
    | { type: 'load'; notifications: Notification[]; total: number; unread: number; filter: NotificationFilter; hasMore: boolean }
    | { type: 'load-more-start' }
    | { type: 'load-more-complete'; notifications: Notification[]; hasMore: boolean }
    | { type: 'mark-read'; notificationId: string }
    | { type: 'mark-unread'; notificationId: string }
    | { type: 'mark-all-read' }
    | { type: 'archive'; notificationId: string }
    | { type: 'filter-change'; filter: NotificationFilter }
    | { type: 'new-notification'; notification: Notification };

export const defaultNotificationCenterState: Readonly<NotificationCenterViewModel> = Object.freeze({
    cards: [],
    countsBadge: { total: 0, unread: 0, label: '0', visible: false },
    activeFilter: 'all' as NotificationFilter,
    hasMore: false,
    isEmpty: true,
    loading: false,
});

export const reduceNotificationCenterState = (
    current: NotificationCenterViewModel,
    event: NotificationCenterEvent,
): NotificationCenterViewModel => {
    switch (event.type) {
        case 'load':
            return toNotificationCenter(
                event.notifications,
                event.total,
                event.unread,
                event.filter,
                event.hasMore,
                false,
            );

        case 'load-more-start':
            return { ...current, loading: true };

        case 'load-more-complete': {
            const newCards = event.notifications.map(toNotificationCard);
            return {
                ...current,
                cards: [...current.cards, ...newCards],
                hasMore: event.hasMore,
                loading: false,
                isEmpty: current.cards.length + newCards.length === 0,
            };
        }

        case 'mark-read':
            return {
                ...current,
                cards: current.cards.map(c =>
                    c.id === event.notificationId ? { ...c, read: true } : c,
                ),
                countsBadge: {
                    ...current.countsBadge,
                    unread: Math.max(0, current.countsBadge.unread - 1),
                    label: (() => {
                        const newUnread = Math.max(0, current.countsBadge.unread - 1);
                        return newUnread > 99 ? '99+' : String(newUnread);
                    })(),
                    visible: current.countsBadge.unread - 1 > 0,
                },
            };

        case 'mark-unread':
            return {
                ...current,
                cards: current.cards.map(c =>
                    c.id === event.notificationId ? { ...c, read: false } : c,
                ),
                countsBadge: {
                    ...current.countsBadge,
                    unread: current.countsBadge.unread + 1,
                    label: (() => {
                        const newUnread = current.countsBadge.unread + 1;
                        return newUnread > 99 ? '99+' : String(newUnread);
                    })(),
                    visible: true,
                },
            };

        case 'mark-all-read':
            return {
                ...current,
                cards: current.cards.map(c => ({ ...c, read: true })),
                countsBadge: {
                    ...current.countsBadge,
                    unread: 0,
                    label: '0',
                    visible: false,
                },
            };

        case 'archive':
            return {
                ...current,
                cards: current.cards.filter(c => c.id !== event.notificationId),
                isEmpty: current.cards.length - 1 === 0,
            };

        case 'filter-change':
            return {
                ...current,
                activeFilter: event.filter,
                loading: true,
            };

        case 'new-notification': {
            const card = toNotificationCard(event.notification);
            const newCards = [card, ...current.cards];
            return {
                ...current,
                cards: newCards,
                countsBadge: {
                    ...current.countsBadge,
                    total: current.countsBadge.total + 1,
                    unread: current.countsBadge.unread + 1,
                    label: (() => {
                        const newUnread = current.countsBadge.unread + 1;
                        return newUnread > 99 ? '99+' : String(newUnread);
                    })(),
                    visible: true,
                },
                isEmpty: false,
            };
        }
    }
};
