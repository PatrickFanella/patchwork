import { describe, expect, it, beforeEach } from 'vitest';
import { SyncQueue } from './offline-sync.js';

describe('SyncQueue', () => {
    let queue: SyncQueue;

    beforeEach(() => {
        queue = new SyncQueue();
    });

    // -------------------------------------------------------------------
    // enqueue
    // -------------------------------------------------------------------

    describe('enqueue', () => {
        it('adds an item with pending status', () => {
            const item = queue.enqueue('create', '/api/posts', { title: 'test' });
            expect(item.id).toBeDefined();
            expect(item.action).toBe('create');
            expect(item.resource).toBe('/api/posts');
            expect(item.status).toBe('pending');
            expect(item.retryCount).toBe(0);
        });

        it('assigns unique IDs', () => {
            const item1 = queue.enqueue('create', '/api/posts', {});
            const item2 = queue.enqueue('update', '/api/posts', {});
            expect(item1.id).not.toBe(item2.id);
        });

        it('stores payload', () => {
            const payload = { title: 'test', body: 'content' };
            const item = queue.enqueue('create', '/api/posts', payload);
            expect(item.payload).toEqual(payload);
        });
    });

    // -------------------------------------------------------------------
    // dequeue
    // -------------------------------------------------------------------

    describe('dequeue', () => {
        it('returns the first pending item', () => {
            queue.enqueue('create', '/api/a', {});
            queue.enqueue('create', '/api/b', {});

            const item = queue.dequeue();
            expect(item).toBeDefined();
            expect(item!.resource).toBe('/api/a');
            expect(item!.status).toBe('syncing');
        });

        it('marks dequeued item as syncing', () => {
            queue.enqueue('create', '/api/a', {});
            const item = queue.dequeue();
            expect(item!.status).toBe('syncing');
        });

        it('returns undefined when no pending items', () => {
            expect(queue.dequeue()).toBeUndefined();
        });

        it('skips syncing items', () => {
            queue.enqueue('create', '/api/a', {});
            queue.enqueue('create', '/api/b', {});

            queue.dequeue(); // first becomes syncing
            const second = queue.dequeue();
            expect(second!.resource).toBe('/api/b');
        });
    });

    // -------------------------------------------------------------------
    // markSynced
    // -------------------------------------------------------------------

    describe('markSynced', () => {
        it('marks item as synced', () => {
            const item = queue.enqueue('create', '/api/a', {});
            queue.dequeue();

            expect(queue.markSynced(item.id)).toBe(true);
            expect(queue.getPending()).toHaveLength(0);
        });

        it('returns false for unknown id', () => {
            expect(queue.markSynced('nonexistent')).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // markFailed
    // -------------------------------------------------------------------

    describe('markFailed', () => {
        it('marks item as failed with error', () => {
            const item = queue.enqueue('create', '/api/a', {});
            queue.dequeue();

            expect(queue.markFailed(item.id, 'Network error')).toBe(true);

            const all = queue.getAll();
            const failed = all.find(i => i.id === item.id);
            expect(failed!.status).toBe('failed');
            expect(failed!.retryCount).toBe(1);
            expect(failed!.lastError).toBe('Network error');
        });

        it('increments retry count on repeated failures', () => {
            const item = queue.enqueue('create', '/api/a', {});
            queue.dequeue();
            queue.markFailed(item.id, 'Error 1');
            queue.markFailed(item.id, 'Error 2');

            const all = queue.getAll();
            const failed = all.find(i => i.id === item.id);
            expect(failed!.retryCount).toBe(2);
            expect(failed!.lastError).toBe('Error 2');
        });

        it('returns false for unknown id', () => {
            expect(queue.markFailed('nonexistent', 'error')).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // getPending
    // -------------------------------------------------------------------

    describe('getPending', () => {
        it('returns pending and syncing items', () => {
            queue.enqueue('create', '/api/a', {});
            queue.enqueue('create', '/api/b', {});
            queue.dequeue(); // a becomes syncing

            const pending = queue.getPending();
            expect(pending).toHaveLength(2);
        });

        it('excludes synced and failed items', () => {
            const item1 = queue.enqueue('create', '/api/a', {});
            const item2 = queue.enqueue('create', '/api/b', {});
            queue.enqueue('create', '/api/c', {});

            queue.dequeue(); // item1 -> syncing
            queue.markSynced(item1.id);

            queue.dequeue(); // item2 -> syncing
            queue.markFailed(item2.id, 'error');

            const pending = queue.getPending();
            expect(pending).toHaveLength(1);
            expect(pending[0]!.resource).toBe('/api/c');
        });
    });

    // -------------------------------------------------------------------
    // Conflict detection
    // -------------------------------------------------------------------

    describe('getConflicts', () => {
        it('returns items that failed with conflict', () => {
            const item = queue.enqueue('update', '/api/a', {});
            queue.dequeue();
            queue.markFailed(item.id, 'conflict: version mismatch');

            const conflicts = queue.getConflicts();
            expect(conflicts).toHaveLength(1);
            expect(conflicts[0]!.id).toBe(item.id);
        });

        it('excludes non-conflict failures', () => {
            const item = queue.enqueue('update', '/api/a', {});
            queue.dequeue();
            queue.markFailed(item.id, 'Network error');

            const conflicts = queue.getConflicts();
            expect(conflicts).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // resolveConflict
    // -------------------------------------------------------------------

    describe('resolveConflict', () => {
        it('resolves a conflict and sets status to pending', () => {
            const item = queue.enqueue('update', '/api/a', {});
            queue.dequeue();
            queue.markFailed(item.id, 'conflict: version mismatch');

            expect(queue.resolveConflict(item.id, 'local_wins')).toBe(true);

            const all = queue.getAll();
            const resolved = all.find(i => i.id === item.id);
            expect(resolved!.status).toBe('pending');
            expect(resolved!.conflictResolution).toBe('local_wins');
        });

        it('returns false for non-failed items', () => {
            const item = queue.enqueue('create', '/api/a', {});
            expect(queue.resolveConflict(item.id, 'remote_wins')).toBe(false);
        });

        it('returns false for unknown id', () => {
            expect(queue.resolveConflict('nonexistent', 'local_wins')).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // size
    // -------------------------------------------------------------------

    describe('size', () => {
        it('tracks total items', () => {
            expect(queue.size()).toBe(0);
            queue.enqueue('create', '/api/a', {});
            expect(queue.size()).toBe(1);
            queue.enqueue('create', '/api/b', {});
            expect(queue.size()).toBe(2);
        });
    });
});
