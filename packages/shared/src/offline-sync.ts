// ---------------------------------------------------------------------------
// Sync queue types
// ---------------------------------------------------------------------------

export type SyncAction = 'create' | 'update' | 'delete';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type ConflictResolution = 'local_wins' | 'remote_wins' | 'manual_merge';

export interface SyncQueueItem {
    id: string;
    action: SyncAction;
    resource: string;
    payload: unknown;
    createdAt: string;
    status: SyncStatus;
    retryCount: number;
    lastError?: string;
    conflictResolution?: ConflictResolution;
}

// ---------------------------------------------------------------------------
// Sync queue
// ---------------------------------------------------------------------------

let nextId = 1;

export class SyncQueue {
    private readonly items = new Map<string, SyncQueueItem>();

    enqueue(action: SyncAction, resource: string, payload: unknown): SyncQueueItem {
        const id = `sync-${nextId++}`;
        const item: SyncQueueItem = {
            id,
            action,
            resource,
            payload,
            createdAt: new Date().toISOString(),
            status: 'pending',
            retryCount: 0,
        };
        this.items.set(id, item);
        return item;
    }

    dequeue(): SyncQueueItem | undefined {
        for (const item of this.items.values()) {
            if (item.status === 'pending') {
                item.status = 'syncing';
                return item;
            }
        }
        return undefined;
    }

    markSynced(id: string): boolean {
        const item = this.items.get(id);
        if (!item) return false;
        item.status = 'synced';
        return true;
    }

    markFailed(id: string, error: string): boolean {
        const item = this.items.get(id);
        if (!item) return false;
        item.status = 'failed';
        item.retryCount += 1;
        item.lastError = error;
        return true;
    }

    getPending(): SyncQueueItem[] {
        return [...this.items.values()].filter(
            item => item.status === 'pending' || item.status === 'syncing',
        );
    }

    getConflicts(): SyncQueueItem[] {
        return [...this.items.values()].filter(
            item => item.status === 'failed' && item.lastError?.includes('conflict'),
        );
    }

    resolveConflict(id: string, resolution: ConflictResolution): boolean {
        const item = this.items.get(id);
        if (!item || item.status !== 'failed') return false;
        item.conflictResolution = resolution;
        item.status = 'pending';
        return true;
    }

    getAll(): SyncQueueItem[] {
        return [...this.items.values()];
    }

    size(): number {
        return this.items.size;
    }
}
