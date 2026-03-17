/**
 * Mobile-optimized offline sync using shared offline-sync contracts.
 *
 * Extends the shared SyncQueue with mobile-specific concerns:
 * - Connectivity state tracking
 * - Background sync scheduling
 * - Offline duration enforcement
 * - Automatic flush on reconnect
 */

import {
    SyncQueue,
    type SyncAction,
    type SyncQueueItem,
    type MobileAppConfig,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Mobile sync state
// ---------------------------------------------------------------------------

export interface MobileOfflineSyncState {
    isOnline: boolean;
    lastOnlineAt: string | undefined;
    lastSyncAt: string | undefined;
    pendingCount: number;
    failedCount: number;
    offlineDurationMs: number;
    maxOfflineDurationMs: number;
    exceedsMaxOfflineDuration: boolean;
}

// ---------------------------------------------------------------------------
// MobileOfflineSync
// ---------------------------------------------------------------------------

export class MobileOfflineSync {
    private readonly queue: SyncQueue;
    private readonly maxQueueSize: number;
    private readonly maxOfflineDurationMs: number;
    private isOnline: boolean;
    private lastOnlineAt: string | undefined;
    private lastSyncAt: string | undefined;

    constructor(config: MobileAppConfig['offlineSyncConfig']) {
        this.queue = new SyncQueue();
        this.maxQueueSize = config.maxQueueSize;
        this.maxOfflineDurationMs = config.maxOfflineDurationMs;
        this.isOnline = true;
        this.lastOnlineAt = new Date().toISOString();
        this.lastSyncAt = undefined;
    }

    // -----------------------------------------------------------------------
    // Connectivity
    // -----------------------------------------------------------------------

    /**
     * Set the device connectivity state.
     * When transitioning from offline to online, triggers a flush.
     */
    setOnline(online: boolean, now?: string): SyncQueueItem[] {
        const wasOffline = !this.isOnline;
        this.isOnline = online;

        if (online) {
            this.lastOnlineAt = now ?? new Date().toISOString();
        }

        // Auto-flush pending items when coming back online
        if (online && wasOffline) {
            return this.flush(now);
        }

        return [];
    }

    getIsOnline(): boolean {
        return this.isOnline;
    }

    // -----------------------------------------------------------------------
    // Queue operations
    // -----------------------------------------------------------------------

    /**
     * Enqueue an action for sync. Respects the max queue size.
     * Returns the queued item, or null if the queue is full.
     */
    enqueue(
        action: SyncAction,
        resource: string,
        payload: unknown,
    ): SyncQueueItem | null {
        if (this.queue.size() >= this.maxQueueSize) {
            return null;
        }

        return this.queue.enqueue(action, resource, payload);
    }

    /**
     * Process the next pending item in the queue.
     * In a real implementation this would call the API client.
     * Returns the dequeued item, or undefined if none are pending.
     */
    processNext(): SyncQueueItem | undefined {
        if (!this.isOnline) {
            return undefined;
        }

        const item = this.queue.dequeue();
        if (item) {
            // In a real implementation, the API call would happen here.
            // For the contract scaffold, we mark as synced immediately.
            this.queue.markSynced(item.id);
            this.lastSyncAt = new Date().toISOString();
        }
        return item;
    }

    /**
     * Flush all pending items. Returns the items that were processed.
     */
    flush(now?: string): SyncQueueItem[] {
        if (!this.isOnline) {
            return [];
        }

        const flushed: SyncQueueItem[] = [];
        let item = this.queue.dequeue();

        while (item) {
            this.queue.markSynced(item.id);
            flushed.push(item);
            item = this.queue.dequeue();
        }

        if (flushed.length > 0) {
            this.lastSyncAt = now ?? new Date().toISOString();
        }

        return flushed;
    }

    /**
     * Mark a specific item as failed with an error message.
     */
    markFailed(id: string, error: string): boolean {
        return this.queue.markFailed(id, error);
    }

    // -----------------------------------------------------------------------
    // State queries
    // -----------------------------------------------------------------------

    /**
     * Get the current offline sync state snapshot.
     */
    getState(now?: string): MobileOfflineSyncState {
        const currentTime = now ? new Date(now) : new Date();
        const lastOnlineTime = this.lastOnlineAt
            ? new Date(this.lastOnlineAt)
            : currentTime;

        const offlineDurationMs = this.isOnline
            ? 0
            : currentTime.getTime() - lastOnlineTime.getTime();

        const allItems = this.queue.getAll();
        const pendingCount = allItems.filter(
            (item) => item.status === 'pending' || item.status === 'syncing',
        ).length;
        const failedCount = allItems.filter(
            (item) => item.status === 'failed',
        ).length;

        return {
            isOnline: this.isOnline,
            lastOnlineAt: this.lastOnlineAt,
            lastSyncAt: this.lastSyncAt,
            pendingCount,
            failedCount,
            offlineDurationMs,
            maxOfflineDurationMs: this.maxOfflineDurationMs,
            exceedsMaxOfflineDuration:
                offlineDurationMs > this.maxOfflineDurationMs,
        };
    }

    /**
     * Get all items currently in the queue.
     */
    getAllItems(): SyncQueueItem[] {
        return this.queue.getAll();
    }

    /**
     * Get items that failed and may have conflicts.
     */
    getConflicts(): SyncQueueItem[] {
        return this.queue.getConflicts();
    }

    /**
     * Get the pending item count.
     */
    getPendingCount(): number {
        return this.queue.getPending().length;
    }

    /**
     * Get the total queue size.
     */
    getQueueSize(): number {
        return this.queue.size();
    }
}
