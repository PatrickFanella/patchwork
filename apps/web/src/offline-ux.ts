import type { SyncQueueItem, SyncStatus } from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Queue interface (avoids cross-workspace runtime class import)
// ---------------------------------------------------------------------------

export interface SyncQueueReader {
    getAll(): SyncQueueItem[];
}

// ---------------------------------------------------------------------------
// Offline status view model
// ---------------------------------------------------------------------------

export interface OfflineStatusViewModel {
    isOnline: boolean;
    statusLabel: string;
    statusTone: 'success' | 'danger' | 'info';
    pendingSyncCount: number;
    failedSyncCount: number;
    lastSyncedAt: string | null;
    showSyncIndicator: boolean;
}

export const toOfflineStatus = (
    isOnline: boolean,
    queue: SyncQueueReader,
    lastSyncedAt: string | null = null,
): OfflineStatusViewModel => {
    const allItems = queue.getAll();
    const pendingSyncCount = allItems.filter(
        i => i.status === 'pending' || i.status === 'syncing',
    ).length;
    const failedSyncCount = allItems.filter(i => i.status === 'failed').length;

    const statusLabel = isOnline
        ? pendingSyncCount > 0
            ? 'Syncing...'
            : 'Online'
        : 'Offline';

    const statusTone: OfflineStatusViewModel['statusTone'] = isOnline
        ? pendingSyncCount > 0
            ? 'info'
            : 'success'
        : 'danger';

    return {
        isOnline,
        statusLabel,
        statusTone,
        pendingSyncCount,
        failedSyncCount,
        lastSyncedAt,
        showSyncIndicator: pendingSyncCount > 0 || failedSyncCount > 0,
    };
};

// ---------------------------------------------------------------------------
// Sync queue item view
// ---------------------------------------------------------------------------

export interface SyncQueueItemView {
    id: string;
    action: string;
    resource: string;
    status: SyncStatus;
    statusLabel: string;
    statusTone: 'neutral' | 'info' | 'success' | 'danger';
    retryCount: number;
    canRetry: boolean;
    lastError: string | null;
    createdAt: string;
}

const STATUS_LABELS: Record<SyncStatus, string> = {
    pending: 'Pending',
    syncing: 'Syncing',
    synced: 'Synced',
    failed: 'Failed',
};

const STATUS_TONES: Record<SyncStatus, SyncQueueItemView['statusTone']> = {
    pending: 'neutral',
    syncing: 'info',
    synced: 'success',
    failed: 'danger',
};

export const toSyncQueueItemView = (item: SyncQueueItem): SyncQueueItemView => ({
    id: item.id,
    action: item.action,
    resource: item.resource,
    status: item.status,
    statusLabel: STATUS_LABELS[item.status],
    statusTone: STATUS_TONES[item.status],
    retryCount: item.retryCount,
    canRetry: item.status === 'failed',
    lastError: item.lastError ?? null,
    createdAt: item.createdAt,
});

// ---------------------------------------------------------------------------
// Sync queue view
// ---------------------------------------------------------------------------

export interface SyncQueueView {
    items: SyncQueueItemView[];
    totalPending: number;
    totalFailed: number;
    isEmpty: boolean;
}

export const toSyncQueueView = (queue: SyncQueueReader): SyncQueueView => {
    const allItems = queue.getAll();
    const items = allItems.map(toSyncQueueItemView);

    return {
        items,
        totalPending: items.filter(
            i => i.status === 'pending' || i.status === 'syncing',
        ).length,
        totalFailed: items.filter(i => i.status === 'failed').length,
        isEmpty: items.length === 0,
    };
};
