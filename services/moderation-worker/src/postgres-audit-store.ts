import {
    applyModerationTransition,
    type ModerationAuditRecord,
    type ModerationPolicyAction,
    type ModerationQueueItem,
} from '@patchwork/shared';
import type { Pool, PoolClient } from 'pg';

export interface ApplyDurablePolicyCommand {
    subjectUri: string;
    actorDid: string;
    action: ModerationPolicyAction;
    reason: string;
    occurredAt: string;
    idempotencyKey: string;
}

export interface ApplyDurablePolicyOutcome {
    applied: boolean;
    item: ModerationQueueItem;
    audit: ModerationAuditRecord;
}

interface QueueRow {
    queue_id: string;
    subject_uri: string;
    subject_type: ModerationQueueItem['subjectType'];
    reasons: string[];
    latest_reason: string;
    report_count: number;
    queue_status: ModerationQueueItem['queueStatus'];
    visibility: ModerationQueueItem['visibility'];
    appeal_state: ModerationQueueItem['appealState'];
    context: ModerationQueueItem['context'];
    created_at: Date | string;
    requested_at: Date | string;
    updated_at: Date | string;
}

interface AuditRow {
    action_id: string;
    queue_id: string;
    subject_uri: string;
    actor_did: string;
    action: ModerationPolicyAction;
    reason: string;
    occurred_at: Date | string;
    idempotency_key: string;
    previous_state: ModerationAuditRecord['previousState'];
    next_state: ModerationAuditRecord['nextState'];
}

const toItem = (row: QueueRow): ModerationQueueItem => ({
    queueId: row.queue_id,
    subjectUri: row.subject_uri,
    subjectType: row.subject_type,
    reasons: row.reasons,
    latestReason: row.latest_reason,
    reportCount: row.report_count,
    queueStatus: row.queue_status,
    visibility: row.visibility,
    appealState: row.appeal_state,
    context: row.context,
    createdAt: new Date(row.created_at).toISOString(),
    requestedAt: new Date(row.requested_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
});

const toAudit = (row: AuditRow): ModerationAuditRecord => ({
    actionId: row.action_id,
    queueId: row.queue_id,
    subjectUri: row.subject_uri,
    actorDid: row.actor_did,
    action: row.action,
    reason: row.reason,
    occurredAt: new Date(row.occurred_at).toISOString(),
    idempotencyKey: row.idempotency_key,
    previousState: row.previous_state,
    nextState: row.next_state,
});

const withTransaction = async <T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export class PostgresModerationAuditStore {
    constructor(private readonly pool: Pool) {}

    async applyPolicyAction(
        command: ApplyDurablePolicyCommand,
    ): Promise<ApplyDurablePolicyOutcome> {
        return withTransaction(this.pool, async client => {
            const duplicate = await client.query<AuditRow>(
                `SELECT * FROM moderation_audit_records
                 WHERE idempotency_key = $1`,
                [command.idempotencyKey],
            );
            const existing = duplicate.rows[0];
            if (existing) {
                const current = await client.query<QueueRow>(
                    'SELECT * FROM moderation_queue_items WHERE subject_uri = $1',
                    [existing.subject_uri],
                );
                const item = current.rows[0];
                if (!item) throw new Error('MODERATION_QUEUE_ITEM_NOT_FOUND');
                return {
                    applied: false,
                    item: toItem(item),
                    audit: toAudit(existing),
                };
            }

            const locked = await client.query<QueueRow>(
                `SELECT * FROM moderation_queue_items
                 WHERE subject_uri = $1 FOR UPDATE`,
                [command.subjectUri],
            );
            const row = locked.rows[0];
            if (!row) throw new Error('MODERATION_QUEUE_ITEM_NOT_FOUND');
            const current = toItem(row);
            const concurrentDuplicate = await client.query<AuditRow>(
                `SELECT * FROM moderation_audit_records
                 WHERE idempotency_key = $1`,
                [command.idempotencyKey],
            );
            const concurrentlyInserted = concurrentDuplicate.rows[0];
            if (concurrentlyInserted) {
                return {
                    applied: false,
                    item: current,
                    audit: toAudit(concurrentlyInserted),
                };
            }
            const next = applyModerationTransition(current, command.action);
            const retentionUntil = new Date(
                new Date(command.occurredAt).getTime() + 7 * 24 * 60 * 60 * 1_000,
            ).toISOString();
            const audit: ModerationAuditRecord = {
                actionId: `action:${command.idempotencyKey}`,
                queueId: current.queueId,
                subjectUri: current.subjectUri,
                actorDid: command.actorDid,
                action: command.action,
                reason: command.reason,
                occurredAt: command.occurredAt,
                idempotencyKey: command.idempotencyKey,
                previousState: {
                    queueStatus: current.queueStatus,
                    visibility: current.visibility,
                    appealState: current.appealState,
                },
                nextState: next,
            };

            await client.query(
                `UPDATE moderation_queue_items
                 SET queue_status = $2, visibility = $3, appeal_state = $4,
                     updated_at = $5, lease_owner = NULL, lease_expires_at = NULL,
                     retention_until = $6
                 WHERE subject_uri = $1`,
                [
                    current.subjectUri,
                    next.queueStatus,
                    next.visibility,
                    next.appealState,
                    command.occurredAt,
                    next.queueStatus === 'resolved' ? retentionUntil : null,
                ],
            );
            await client.query(
                `INSERT INTO moderation_audit_records (
                    action_id, queue_id, subject_uri, actor_did, action, reason,
                    occurred_at, idempotency_key, previous_state, next_state,
                    retention_until
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
                [
                    audit.actionId,
                    audit.queueId,
                    audit.subjectUri,
                    audit.actorDid,
                    audit.action,
                    audit.reason,
                    audit.occurredAt,
                    audit.idempotencyKey,
                    JSON.stringify(audit.previousState),
                    JSON.stringify(audit.nextState),
                    retentionUntil,
                ],
            );
            return {
                applied: true,
                item: { ...current, ...next, updatedAt: command.occurredAt },
                audit,
            };
        });
    }

    async getAuditTrail(subjectUri: string): Promise<ModerationAuditRecord[]> {
        const result = await this.pool.query<AuditRow>(
            `SELECT * FROM moderation_audit_records
             WHERE subject_uri = $1
             ORDER BY occurred_at ASC, action_id ASC`,
            [subjectUri],
        );
        return result.rows.map(toAudit);
    }
}
