import { deepClone } from '@patchwork/shared';
import type {
    ModerationAuditRecord,
    ModerationAuditStore,
    ModerationPolicyAction,
} from '@patchwork/shared';

/**
 * In-memory implementation of ModerationAuditStore.
 * Suitable for tests and development.
 * Data is lost on process restart unless externally serialized.
 */
export class InMemoryAuditStore implements ModerationAuditStore {
    private readonly records: ModerationAuditRecord[] = [];
    private readonly idempotencyIndex = new Map<string, ModerationAuditRecord>();

    recordAction(record: ModerationAuditRecord): void {
        // Idempotency: skip duplicate records with the same key
        if (this.idempotencyIndex.has(record.idempotencyKey)) {
            return;
        }

        const cloned = deepClone(record);
        this.records.push(cloned);
        this.idempotencyIndex.set(record.idempotencyKey, cloned);
    }

    getAuditTrail(subjectUri: string): ModerationAuditRecord[] {
        return this.records
            .filter(record => record.subjectUri === subjectUri)
            .map(record => deepClone(record));
    }

    getActions(filter?: {
        subjectUri?: string;
        action?: ModerationPolicyAction;
        actorDid?: string;
    }): ModerationAuditRecord[] {
        return this.records
            .filter(record => {
                if (
                    filter?.subjectUri &&
                    record.subjectUri !== filter.subjectUri
                ) {
                    return false;
                }
                if (filter?.action && record.action !== filter.action) {
                    return false;
                }
                if (filter?.actorDid && record.actorDid !== filter.actorDid) {
                    return false;
                }
                return true;
            })
            .map(record => deepClone(record));
    }

    findByIdempotencyKey(key: string): ModerationAuditRecord | null {
        const found = this.idempotencyIndex.get(key);
        return found ? deepClone(found) : null;
    }

    /** Expose the total record count for metrics. */
    totalCount(): number {
        return this.records.length;
    }

    /**
     * Export a snapshot of all records for serialization/persistence.
     * Used for restart recovery testing.
     */
    snapshot(): ModerationAuditRecord[] {
        return this.records.map(record => deepClone(record));
    }

    /**
     * Restore records from a previously exported snapshot.
     * Used for restart recovery testing.
     */
    restore(records: ModerationAuditRecord[]): void {
        for (const record of records) {
            if (!this.idempotencyIndex.has(record.idempotencyKey)) {
                const cloned = deepClone(record);
                this.records.push(cloned);
                this.idempotencyIndex.set(record.idempotencyKey, cloned);
            }
        }
    }
}
