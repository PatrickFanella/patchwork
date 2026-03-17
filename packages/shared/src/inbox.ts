import { z } from 'zod';

// ---------------------------------------------------------------------------
// Inbox item types
// ---------------------------------------------------------------------------

export const inboxItemTypeValues = [
    'request_created',
    'request_assigned',
    'assignment_accepted',
    'assignment_declined',
    'handoff_completed',
    'message_received',
    'feedback_requested',
] as const;

export const inboxItemTypeSchema = z.enum(inboxItemTypeValues);
export type InboxItemType = z.infer<typeof inboxItemTypeSchema>;

// ---------------------------------------------------------------------------
// Inbox filter
// ---------------------------------------------------------------------------

export const inboxFilterValues = [
    'all',
    'unread',
    'requests',
    'messages',
    'assignments',
] as const;

export const inboxFilterSchema = z.enum(inboxFilterValues);
export type InboxFilter = z.infer<typeof inboxFilterSchema>;

// ---------------------------------------------------------------------------
// Inbox item
// ---------------------------------------------------------------------------

export const inboxItemSchema = z.object({
    id: z.string().min(1),
    type: inboxItemTypeSchema,
    title: z.string().min(1),
    summary: z.string(),
    timestamp: z.string().datetime({ offset: true }),
    read: z.boolean(),
    actionUrl: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

// ---------------------------------------------------------------------------
// Inbox counts
// ---------------------------------------------------------------------------

export interface InboxCounts {
    total: number;
    unread: number;
    byType: Partial<Record<InboxItemType, number>>;
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

const REQUEST_TYPES: ReadonlySet<InboxItemType> = new Set([
    'request_created',
    'handoff_completed',
    'feedback_requested',
]);

const MESSAGE_TYPES: ReadonlySet<InboxItemType> = new Set([
    'message_received',
]);

const ASSIGNMENT_TYPES: ReadonlySet<InboxItemType> = new Set([
    'request_assigned',
    'assignment_accepted',
    'assignment_declined',
]);

export const matchesFilter = (
    item: InboxItem,
    filter: InboxFilter,
): boolean => {
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
