import { describe, expect, it } from 'vitest';
import type { SyncQueueItem } from '@patchwork/shared';
import {
    toOfflineStatus,
    toSyncQueueItemView,
    toSyncQueueView,
    type SyncQueueReader,
} from './offline-ux.js';

// ---------------------------------------------------------------------------
// Lightweight in-memory queue for test purposes
// (Avoids importing SyncQueue class across workspace boundaries)
// ---------------------------------------------------------------------------

class TestSyncQueue implements SyncQueueReader {
    private items: SyncQueueItem[] = [];
    private nextId = 1;

    enqueue(action: 'create' | 'update' | 'delete', resource: string, payload: unknown): SyncQueueItem {
        const item: SyncQueueItem = {
            id: `sync-${this.nextId++}`,
            action,
            resource,
            payload,
            createdAt: new Date().toISOString(),
            status: 'pending',
            retryCount: 0,
        };
        this.items.push(item);
        return item;
    }

    dequeue(): SyncQueueItem | undefined {
        for (const item of this.items) {
            if (item.status === 'pending') {
                item.status = 'syncing';
                return item;
            }
        }
        return undefined;
    }

    markFailed(id: string, error: string): void {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.status = 'failed';
            item.retryCount += 1;
            item.lastError = error;
        }
    }

    markSynced(id: string): void {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.status = 'synced';
        }
    }

    getAll(): SyncQueueItem[] {
        return [...this.items];
    }
}

describe('toOfflineStatus', () => {
    it('shows online status with empty queue', () => {
        const queue = new TestSyncQueue();
        const status = toOfflineStatus(true, queue);
        expect(status.isOnline).toBe(true);
        expect(status.statusLabel).toBe('Online');
        expect(status.statusTone).toBe('success');
        expect(status.pendingSyncCount).toBe(0);
        expect(status.showSyncIndicator).toBe(false);
    });

    it('shows offline status', () => {
        const queue = new TestSyncQueue();
        const status = toOfflineStatus(false, queue);
        expect(status.isOnline).toBe(false);
        expect(status.statusLabel).toBe('Offline');
        expect(status.statusTone).toBe('danger');
    });

    it('shows syncing status when items pending', () => {
        const queue = new TestSyncQueue();
        queue.enqueue('create', '/api/posts', {});
        const status = toOfflineStatus(true, queue);
        expect(status.statusLabel).toBe('Syncing...');
        expect(status.statusTone).toBe('info');
        expect(status.pendingSyncCount).toBe(1);
        expect(status.showSyncIndicator).toBe(true);
    });

    it('counts failed items', () => {
        const queue = new TestSyncQueue();
        const item = queue.enqueue('create', '/api/posts', {});
        queue.dequeue();
        queue.markFailed(item.id, 'error');

        const status = toOfflineStatus(true, queue);
        expect(status.failedSyncCount).toBe(1);
        expect(status.showSyncIndicator).toBe(true);
    });

    it('includes lastSyncedAt', () => {
        const queue = new TestSyncQueue();
        const status = toOfflineStatus(true, queue, '2026-03-01T12:00:00.000Z');
        expect(status.lastSyncedAt).toBe('2026-03-01T12:00:00.000Z');
    });
});

describe('toSyncQueueItemView', () => {
    it('maps pending item', () => {
        const queue = new TestSyncQueue();
        const item = queue.enqueue('create', '/api/posts', { title: 'test' });

        const view = toSyncQueueItemView(item);
        expect(view.status).toBe('pending');
        expect(view.statusLabel).toBe('Pending');
        expect(view.statusTone).toBe('neutral');
        expect(view.canRetry).toBe(false);
        expect(view.lastError).toBeNull();
    });

    it('maps failed item with retry', () => {
        const queue = new TestSyncQueue();
        const item = queue.enqueue('update', '/api/posts', {});
        queue.dequeue();
        queue.markFailed(item.id, 'Network error');

        const all = queue.getAll();
        const failedItem = all.find(i => i.id === item.id)!;
        const view = toSyncQueueItemView(failedItem);

        expect(view.status).toBe('failed');
        expect(view.statusLabel).toBe('Failed');
        expect(view.statusTone).toBe('danger');
        expect(view.canRetry).toBe(true);
        expect(view.lastError).toBe('Network error');
        expect(view.retryCount).toBe(1);
    });

    it('maps synced item', () => {
        const queue = new TestSyncQueue();
        const item = queue.enqueue('create', '/api/posts', {});
        queue.dequeue();
        queue.markSynced(item.id);

        const all = queue.getAll();
        const syncedItem = all.find(i => i.id === item.id)!;
        const view = toSyncQueueItemView(syncedItem);

        expect(view.status).toBe('synced');
        expect(view.statusLabel).toBe('Synced');
        expect(view.statusTone).toBe('success');
        expect(view.canRetry).toBe(false);
    });
});

describe('toSyncQueueView', () => {
    it('shows empty state', () => {
        const queue = new TestSyncQueue();
        const view = toSyncQueueView(queue);
        expect(view.isEmpty).toBe(true);
        expect(view.items).toHaveLength(0);
        expect(view.totalPending).toBe(0);
        expect(view.totalFailed).toBe(0);
    });

    it('counts pending and failed items', () => {
        const queue = new TestSyncQueue();
        queue.enqueue('create', '/api/a', {});
        const item2 = queue.enqueue('update', '/api/b', {});
        queue.dequeue(); // item at /api/a becomes syncing
        queue.dequeue(); // item2 becomes syncing
        queue.markFailed(item2.id, 'error');

        const view = toSyncQueueView(queue);
        expect(view.isEmpty).toBe(false);
        expect(view.items).toHaveLength(2);
        expect(view.totalPending).toBe(1); // syncing counts as pending
        expect(view.totalFailed).toBe(1);
    });
});
