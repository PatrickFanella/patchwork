import { describe, expect, it, beforeEach } from 'vitest';
import { InboxService } from './inbox-service.js';
import type { InboxItem } from '@patchwork/shared';

const USER_DID = 'did:example:alice';
const NOW = '2026-03-01T12:00:00.000Z';

const makeItem = (overrides: Partial<InboxItem> = {}): InboxItem => ({
    id: `item-${Date.now()}-${Math.random()}`,
    type: 'request_created',
    title: 'New food request',
    summary: 'Someone needs groceries nearby',
    timestamp: NOW,
    read: false,
    actionUrl: '/feed/request-123',
    ...overrides,
});

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('InboxService', () => {
    let service: InboxService;

    beforeEach(() => {
        service = new InboxService();
    });

    // -------------------------------------------------------------------
    // addItem + getInbox
    // -------------------------------------------------------------------

    describe('addItem', () => {
        it('adds an item to the user inbox', () => {
            const item = makeItem({ id: 'item-1' });
            service.addItem(USER_DID, item);

            const result = service.getInbox(USER_DID);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.id).toBe('item-1');
        });

        it('prepends new items (most recent first)', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1', title: 'First' }));
            service.addItem(USER_DID, makeItem({ id: 'item-2', title: 'Second' }));

            const result = service.getInbox(USER_DID);
            expect(result.items[0]!.id).toBe('item-2');
            expect(result.items[1]!.id).toBe('item-1');
        });
    });

    // -------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------

    describe('getInbox with filter', () => {
        it('returns all items with "all" filter', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', type: 'request_created' }));
            service.addItem(USER_DID, makeItem({ id: 'i2', type: 'message_received' }));

            const result = service.getInbox(USER_DID, 'all');
            expect(result.items).toHaveLength(2);
        });

        it('returns only unread items with "unread" filter', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', read: false }));
            service.addItem(USER_DID, makeItem({ id: 'i2', read: true }));

            const result = service.getInbox(USER_DID, 'unread');
            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.id).toBe('i1');
        });

        it('filters by requests', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', type: 'request_created' }));
            service.addItem(USER_DID, makeItem({ id: 'i2', type: 'message_received' }));
            service.addItem(USER_DID, makeItem({ id: 'i3', type: 'handoff_completed' }));

            const result = service.getInbox(USER_DID, 'requests');
            expect(result.items).toHaveLength(2);
        });

        it('filters by messages', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', type: 'message_received' }));
            service.addItem(USER_DID, makeItem({ id: 'i2', type: 'request_created' }));

            const result = service.getInbox(USER_DID, 'messages');
            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.type).toBe('message_received');
        });

        it('filters by assignments', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', type: 'request_assigned' }));
            service.addItem(USER_DID, makeItem({ id: 'i2', type: 'assignment_accepted' }));
            service.addItem(USER_DID, makeItem({ id: 'i3', type: 'message_received' }));

            const result = service.getInbox(USER_DID, 'assignments');
            expect(result.items).toHaveLength(2);
        });
    });

    // -------------------------------------------------------------------
    // Pagination
    // -------------------------------------------------------------------

    describe('pagination', () => {
        it('limits results', () => {
            for (let i = 0; i < 5; i++) {
                service.addItem(USER_DID, makeItem({ id: `item-${i}` }));
            }

            const result = service.getInbox(USER_DID, 'all', undefined, 2);
            expect(result.items).toHaveLength(2);
            expect(result.nextCursor).toBeDefined();
            expect(result.total).toBe(5);
        });

        it('paginates with cursor', () => {
            for (let i = 0; i < 5; i++) {
                service.addItem(USER_DID, makeItem({ id: `item-${i}` }));
            }

            const page1 = service.getInbox(USER_DID, 'all', undefined, 2);
            expect(page1.items).toHaveLength(2);

            const page2 = service.getInbox(USER_DID, 'all', page1.nextCursor, 2);
            expect(page2.items).toHaveLength(2);
            expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
        });

        it('returns no cursor on last page', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1' }));

            const result = service.getInbox(USER_DID, 'all', undefined, 10);
            expect(result.nextCursor).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------
    // Read state
    // -------------------------------------------------------------------

    describe('markRead', () => {
        it('marks an item as read', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1', read: false }));

            const success = service.markRead(USER_DID, 'item-1');
            expect(success).toBe(true);

            const result = service.getInbox(USER_DID);
            expect(result.items[0]!.read).toBe(true);
        });

        it('returns false for non-existent item', () => {
            expect(service.markRead(USER_DID, 'nonexistent')).toBe(false);
        });

        it('returns false for non-existent user', () => {
            expect(service.markRead('did:example:unknown', 'item-1')).toBe(false);
        });
    });

    describe('markAllRead', () => {
        it('marks all items as read', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1', read: false }));
            service.addItem(USER_DID, makeItem({ id: 'item-2', read: false }));
            service.addItem(USER_DID, makeItem({ id: 'item-3', read: true }));

            const count = service.markAllRead(USER_DID);
            expect(count).toBe(2);

            const counts = service.getCounts(USER_DID);
            expect(counts.unread).toBe(0);
        });

        it('returns 0 for unknown user', () => {
            expect(service.markAllRead('did:example:unknown')).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Counts
    // -------------------------------------------------------------------

    describe('getCounts', () => {
        it('returns correct counts', () => {
            service.addItem(USER_DID, makeItem({ id: 'i1', type: 'request_created', read: false }));
            service.addItem(USER_DID, makeItem({ id: 'i2', type: 'request_created', read: true }));
            service.addItem(USER_DID, makeItem({ id: 'i3', type: 'message_received', read: false }));

            const counts = service.getCounts(USER_DID);
            expect(counts.total).toBe(3);
            expect(counts.unread).toBe(2);
            expect(counts.byType['request_created']).toBe(2);
            expect(counts.byType['message_received']).toBe(1);
        });

        it('returns zero counts for unknown user', () => {
            const counts = service.getCounts('did:example:unknown');
            expect(counts.total).toBe(0);
            expect(counts.unread).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('getInboxFromParams', () => {
        it('returns inbox items', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1' }));

            const result = service.getInboxFromParams(toParams({ userDid: USER_DID }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { items: unknown[]; total: number };
            expect(body.items).toHaveLength(1);
        });

        it('returns 400 without userDid', () => {
            const result = service.getInboxFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    describe('markReadFromParams', () => {
        it('marks item as read', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1' }));

            const result = service.markReadFromParams(
                { userDid: USER_DID, itemId: 'item-1' },
            );
            expect(result.statusCode).toBe(200);
        });

        it('returns 404 for nonexistent item', () => {
            const result = service.markReadFromParams(
                { userDid: USER_DID, itemId: 'nope' },
            );
            expect(result.statusCode).toBe(404);
        });

        it('returns 400 without required fields', () => {
            const result = service.markReadFromParams({});
            expect(result.statusCode).toBe(400);
        });
    });

    describe('markAllReadFromParams', () => {
        it('marks all items as read', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1', read: false }));
            service.addItem(USER_DID, makeItem({ id: 'item-2', read: false }));

            const result = service.markAllReadFromParams({ userDid: USER_DID });
            expect(result.statusCode).toBe(200);
            const body = result.body as { markedRead: number };
            expect(body.markedRead).toBe(2);
        });

        it('returns 400 without userDid', () => {
            const result = service.markAllReadFromParams({});
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getCountsFromParams', () => {
        it('returns counts', () => {
            service.addItem(USER_DID, makeItem({ id: 'item-1', read: false }));

            const result = service.getCountsFromParams(toParams({ userDid: USER_DID }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { total: number; unread: number };
            expect(body.total).toBe(1);
            expect(body.unread).toBe(1);
        });

        it('returns 400 without userDid', () => {
            const result = service.getCountsFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });
});
