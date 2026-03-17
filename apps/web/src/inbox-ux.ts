import type {
    InboxCounts,
    InboxFilter,
    InboxItem,
    InboxItemType,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local filter implementation
// ---------------------------------------------------------------------------

const REQUEST_TYPES = new Set<string>([
    'request_created',
    'handoff_completed',
    'feedback_requested',
]);

const MESSAGE_TYPES = new Set<string>(['message_received']);

const ASSIGNMENT_TYPES = new Set<string>([
    'request_assigned',
    'assignment_accepted',
    'assignment_declined',
]);

const matchesFilter = (item: InboxItem, filter: InboxFilter): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'unread':
            return !item.read;
        case 'requests':
            return REQUEST_TYPES.has(item.type);
        case 'messages':
            return MESSAGE_TYPES.has(item.type);
        case 'assignments':
            return ASSIGNMENT_TYPES.has(item.type);
    }
};

// ---------------------------------------------------------------------------
// Inbox card view model
// ---------------------------------------------------------------------------

export interface InboxCardViewModel {
    id: string;
    type: InboxItemType;
    typeIcon: string;
    typeLabel: string;
    title: string;
    summary: string;
    timeAgo: string;
    read: boolean;
    actionUrl: string;
}

const TYPE_ICON_MAP: Record<InboxItemType, string> = {
    request_created: 'plus-circle',
    request_assigned: 'user-plus',
    assignment_accepted: 'check-circle',
    assignment_declined: 'x-circle',
    handoff_completed: 'package',
    message_received: 'message-circle',
    feedback_requested: 'star',
};

const TYPE_LABEL_MAP: Record<InboxItemType, string> = {
    request_created: 'New Request',
    request_assigned: 'Assignment',
    assignment_accepted: 'Accepted',
    assignment_declined: 'Declined',
    handoff_completed: 'Handoff',
    message_received: 'Message',
    feedback_requested: 'Feedback',
};

export const formatTimeAgo = (timestamp: string): string => {
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

export const toInboxCard = (item: InboxItem): InboxCardViewModel => ({
    id: item.id,
    type: item.type,
    typeIcon: TYPE_ICON_MAP[item.type],
    typeLabel: TYPE_LABEL_MAP[item.type],
    title: item.title,
    summary: item.summary,
    timeAgo: formatTimeAgo(item.timestamp),
    read: item.read,
    actionUrl: item.actionUrl,
});

// ---------------------------------------------------------------------------
// Counts badge view model
// ---------------------------------------------------------------------------

export interface InboxCountsBadge {
    total: number;
    unread: number;
    label: string;
    visible: boolean;
}

export const toCountsBadge = (counts: InboxCounts): InboxCountsBadge => ({
    total: counts.total,
    unread: counts.unread,
    label: counts.unread > 99 ? '99+' : String(counts.unread),
    visible: counts.unread > 0,
});

// ---------------------------------------------------------------------------
// Dashboard view model
// ---------------------------------------------------------------------------

export interface InboxDashboardViewModel {
    cards: InboxCardViewModel[];
    countsBadge: InboxCountsBadge;
    activeFilter: InboxFilter;
    hasMore: boolean;
    isEmpty: boolean;
    loading: boolean;
}

export const toInboxDashboard = (
    items: InboxItem[],
    counts: InboxCounts,
    filter: InboxFilter = 'all',
    hasMore: boolean = false,
    loading: boolean = false,
): InboxDashboardViewModel => {
    const filtered = items.filter(item => matchesFilter(item, filter));

    return {
        cards: filtered.map(toInboxCard),
        countsBadge: toCountsBadge(counts),
        activeFilter: filter,
        hasMore,
        isEmpty: filtered.length === 0,
        loading,
    };
};
