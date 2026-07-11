import {
    buildModerationQueueItem,
    type ApplyModerationPolicyActionInput,
    type EnqueueModerationReviewInput,
    type ModerationAuditRecord,
    type ModerationQueueItem,
} from '@patchwork/shared';
import type { PostgresModerationAuditStore } from './postgres-audit-store.js';
import type { PostgresModerationQueueStore } from './postgres-queue-store.js';

export class DurableModerationWorkerService {
    constructor(
        private readonly queue: PostgresModerationQueueStore,
        private readonly audit: PostgresModerationAuditStore,
    ) {}

    async enqueue(
        input: EnqueueModerationReviewInput,
    ): Promise<ModerationQueueItem> {
        const existing = await this.queue.get(input.subjectUri);
        const item = buildModerationQueueItem(input, existing);
        await this.queue.enqueue(item);
        return item;
    }

    async applyPolicy(
        input: ApplyModerationPolicyActionInput & {
            occurredAt: string;
            idempotencyKey: string;
        },
    ): Promise<ModerationQueueItem> {
        const outcome = await this.audit.applyPolicyAction({
            subjectUri: input.subjectUri,
            actorDid: input.actorDid,
            action: input.action,
            reason: input.reason,
            occurredAt: input.occurredAt,
            idempotencyKey: input.idempotencyKey,
        });
        return outcome.item;
    }

    getState(subjectUri: string): Promise<ModerationQueueItem | null> {
        return this.queue.get(subjectUri);
    }

    listQueue(): Promise<ModerationQueueItem[]> {
        return this.queue.list();
    }

    listAudit(subjectUri: string): Promise<ModerationAuditRecord[]> {
        return this.audit.getAuditTrail(subjectUri);
    }
}
