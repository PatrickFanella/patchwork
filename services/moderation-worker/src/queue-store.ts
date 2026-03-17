import { deepClone } from '@patchwork/shared';
import type {
    ModerationAppealState,
    ModerationQueueItem,
    ModerationQueueStatus,
    ModerationQueueStore,
    ModerationVisibilityState,
} from '@patchwork/shared';

/**
 * In-memory implementation of ModerationQueueStore.
 * Suitable for tests and development.
 * Data is lost on process restart unless externally serialized.
 */
export class InMemoryQueueStore implements ModerationQueueStore {
    private readonly items = new Map<string, ModerationQueueItem>();

    enqueue(item: ModerationQueueItem): void {
        this.items.set(item.subjectUri, deepClone(item));
    }

    dequeue(subjectUri: string): ModerationQueueItem | null {
        const item = this.items.get(subjectUri);
        if (!item) {
            return null;
        }
        this.items.delete(subjectUri);
        return deepClone(item);
    }

    peek(subjectUri: string): ModerationQueueItem | null {
        const item = this.items.get(subjectUri);
        return item ? deepClone(item) : null;
    }

    ack(subjectUri: string): void {
        const item = this.items.get(subjectUri);
        if (item) {
            item.queueStatus = 'resolved';
            item.updatedAt = new Date().toISOString();
        }
    }

    nack(subjectUri: string): void {
        const item = this.items.get(subjectUri);
        if (item) {
            item.queueStatus = 'queued';
            item.updatedAt = new Date().toISOString();
        }
    }

    listPending(): ModerationQueueItem[] {
        return [...this.items.values()]
            .filter(item => item.queueStatus === 'queued')
            .map(item => deepClone(item));
    }

    listAll(filters?: {
        queueStatus?: ModerationQueueStatus;
        visibility?: ModerationVisibilityState;
        appealState?: ModerationAppealState;
    }): ModerationQueueItem[] {
        return [...this.items.values()]
            .filter(item => {
                if (
                    filters?.queueStatus &&
                    item.queueStatus !== filters.queueStatus
                ) {
                    return false;
                }
                if (
                    filters?.visibility &&
                    item.visibility !== filters.visibility
                ) {
                    return false;
                }
                if (
                    filters?.appealState &&
                    item.appealState !== filters.appealState
                ) {
                    return false;
                }
                return true;
            })
            .map(item => deepClone(item));
    }

    /** Expose the internal size for metrics. */
    size(): number {
        return this.items.size;
    }

    /** Expose pending count for metrics. */
    pendingCount(): number {
        return [...this.items.values()].filter(
            item => item.queueStatus === 'queued',
        ).length;
    }

    /**
     * Export a snapshot of all items for serialization/persistence.
     * Used for restart recovery testing.
     */
    snapshot(): ModerationQueueItem[] {
        return [...this.items.values()].map(item => deepClone(item));
    }

    /**
     * Restore items from a previously exported snapshot.
     * Used for restart recovery testing.
     */
    restore(items: ModerationQueueItem[]): void {
        for (const item of items) {
            this.items.set(item.subjectUri, deepClone(item));
        }
    }
}
