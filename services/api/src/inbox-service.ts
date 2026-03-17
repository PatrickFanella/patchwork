import type {
    InboxCounts,
    InboxFilter,
    InboxItem,
    InboxItemType,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local filter implementation (avoids cross-workspace runtime import issues)
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

export interface InboxRouteResult {
    statusCode: number;
    body: unknown;
}

export class InboxService {
    private readonly inboxes = new Map<string, InboxItem[]>();

    addItem(userDid: string, item: InboxItem): InboxItem {
        const items = this.inboxes.get(userDid) ?? [];
        items.unshift(item);
        this.inboxes.set(userDid, items);
        return item;
    }

    getInbox(
        userDid: string,
        filter: InboxFilter = 'all',
        cursor?: string,
        limit: number = 20,
    ): { items: InboxItem[]; nextCursor?: string; total: number } {
        const allItems = this.inboxes.get(userDid) ?? [];
        const filtered = allItems.filter(item => matchesFilter(item, filter));

        let startIndex = 0;
        if (cursor) {
            const cursorIdx = filtered.findIndex(item => item.id === cursor);
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

    markRead(userDid: string, itemId: string): boolean {
        const items = this.inboxes.get(userDid);
        if (!items) return false;
        const item = items.find(i => i.id === itemId);
        if (!item) return false;
        item.read = true;
        return true;
    }

    markAllRead(userDid: string): number {
        const items = this.inboxes.get(userDid);
        if (!items) return 0;
        let count = 0;
        for (const item of items) {
            if (!item.read) {
                item.read = true;
                count++;
            }
        }
        return count;
    }

    getCounts(userDid: string): InboxCounts {
        const items = this.inboxes.get(userDid) ?? [];
        const byType: Partial<Record<InboxItemType, number>> = {};
        let unread = 0;

        for (const item of items) {
            byType[item.type] = (byType[item.type] ?? 0) + 1;
            if (!item.read) {
                unread++;
            }
        }

        return { total: items.length, unread, byType };
    }

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    getInboxFromParams(params: URLSearchParams): InboxRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        const filter = (params.get('filter')?.trim() ?? 'all') as InboxFilter;
        const cursor = params.get('cursor')?.trim() || undefined;
        const limitStr = params.get('limit')?.trim();
        const limit = limitStr ? parseInt(limitStr, 10) : 20;

        const result = this.getInbox(userDid, filter, cursor, limit);
        return { statusCode: 200, body: result };
    }

    markReadFromParams(body: unknown): InboxRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        const itemId = (typeof obj?.itemId === 'string' ? obj.itemId : '').trim();

        if (!userDid || !itemId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: userDid, itemId.' } },
            };
        }

        const success = this.markRead(userDid, itemId);
        if (!success) {
            return {
                statusCode: 404,
                body: { error: { code: 'NOT_FOUND', message: 'Inbox item not found.' } },
            };
        }

        return { statusCode: 200, body: { ok: true } };
    }

    markAllReadFromParams(body: unknown): InboxRouteResult {
        const obj = body as Record<string, unknown> | null;
        const userDid = (typeof obj?.userDid === 'string' ? obj.userDid : '').trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        const count = this.markAllRead(userDid);
        return { statusCode: 200, body: { ok: true, markedRead: count } };
    }

    getCountsFromParams(params: URLSearchParams): InboxRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        const counts = this.getCounts(userDid);
        return { statusCode: 200, body: counts };
    }
}

export const createInboxService = (): InboxService => {
    return new InboxService();
};
