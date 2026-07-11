import type { ModerationQueueItem } from '@patchwork/shared';
import type { Pool } from 'pg';

export interface ClaimModerationWorkCommand {
    workerId: string;
    now: string;
    leaseMs: number;
}

interface ModerationQueueRow {
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

const toItem = (row: ModerationQueueRow): ModerationQueueItem => ({
    queueId: row.queue_id,
    subjectUri: row.subject_uri,
    subjectType: row.subject_type,
    reasons: row.reasons,
    latestReason: row.latest_reason,
    reportCount: row.report_count,
    queueStatus: row.queue_status,
    visibility: row.visibility,
    appealState: row.appeal_state,
    createdAt: new Date(row.created_at).toISOString(),
    requestedAt: new Date(row.requested_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    context: row.context,
});

export class PostgresModerationQueueStore {
    constructor(private readonly pool: Pool) {}

    async enqueue(item: ModerationQueueItem): Promise<void> {
        await this.pool.query(
            `INSERT INTO moderation_queue_items (
                subject_uri, queue_id, subject_type, reasons, latest_reason,
                report_count, queue_status, visibility, appeal_state, context,
                created_at, requested_at, updated_at
             ) VALUES (
                $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb,
                $11, $12, $13
             )
             ON CONFLICT (subject_uri) DO UPDATE
             SET reasons = EXCLUDED.reasons,
                 latest_reason = EXCLUDED.latest_reason,
                 report_count = EXCLUDED.report_count,
                 queue_status = EXCLUDED.queue_status,
                 visibility = EXCLUDED.visibility,
                 appeal_state = EXCLUDED.appeal_state,
                 context = EXCLUDED.context,
                 requested_at = EXCLUDED.requested_at,
                 updated_at = EXCLUDED.updated_at`,
            [
                item.subjectUri,
                item.queueId,
                item.subjectType,
                JSON.stringify(item.reasons),
                item.latestReason,
                item.reportCount,
                item.queueStatus,
                item.visibility,
                item.appealState,
                JSON.stringify(item.context),
                item.createdAt,
                item.requestedAt,
                item.updatedAt,
            ],
        );
    }

    async claim(
        command: ClaimModerationWorkCommand,
    ): Promise<ModerationQueueItem | null> {
        const leaseExpiresAt = new Date(
            new Date(command.now).getTime() + command.leaseMs,
        ).toISOString();
        const result = await this.pool.query<ModerationQueueRow>(
            `WITH candidate AS (
                SELECT subject_uri
                FROM moderation_queue_items
                WHERE queue_status = 'queued'
                  AND terminal_failure = FALSE
                  AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
                  AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
                ORDER BY requested_at ASC, subject_uri ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
             )
             UPDATE moderation_queue_items AS queue
             SET lease_owner = $2,
                 lease_expires_at = $3,
                 attempts = queue.attempts + 1,
                 updated_at = $1
             FROM candidate
             WHERE queue.subject_uri = candidate.subject_uri
             RETURNING queue.*`,
            [command.now, command.workerId, leaseExpiresAt],
        );
        const row = result.rows[0];
        return row ? toItem(row) : null;
    }
}
