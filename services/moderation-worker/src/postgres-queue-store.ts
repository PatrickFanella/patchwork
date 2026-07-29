import type { ModerationQueueItem } from '@patchwork/shared';
import type { Pool } from 'pg';

export interface ClaimModerationWorkCommand {
    workerId: string;
    now: string;
    leaseMs: number;
}

export interface FailModerationWorkCommand {
    subjectUri: string;
    workerId: string;
    now: string;
    failureCode: string;
    nextAttemptAt?: string;
    terminal: boolean;
}

export interface AckModerationWorkCommand {
    subjectUri: string;
    workerId: string;
    now: string;
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
    priority: 'low' | 'normal' | 'high' | 'urgent';
    reason_codes: string[];
    safe_preview: Record<string, string>;
    automated_decision: 'accepted' | 'quarantined' | 'rejected' | null;
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
    priority: row.priority,
    reasonCodes: row.reason_codes,
    safePreview: row.safe_preview,
    automatedDecision: row.automated_decision,
});

export class PostgresModerationQueueStore {
    constructor(private readonly pool: Pool) {}

    async enqueue(item: ModerationQueueItem): Promise<void> {
        await this.pool.query(
            `INSERT INTO moderation_queue_items (
                subject_uri, queue_id, subject_type, reasons, latest_reason,
                report_count, queue_status, visibility, appeal_state, context,
                priority, reason_codes, safe_preview, automated_decision,
                created_at, requested_at, updated_at
             ) VALUES (
                $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb,
                $11, $12::jsonb, $13::jsonb, $14, $15, $16, $17
             )
             ON CONFLICT (subject_uri) DO UPDATE
             SET reasons = EXCLUDED.reasons,
                 latest_reason = EXCLUDED.latest_reason,
                 report_count = EXCLUDED.report_count,
                 queue_status = EXCLUDED.queue_status,
                 visibility = EXCLUDED.visibility,
                 appeal_state = EXCLUDED.appeal_state,
                 context = EXCLUDED.context,
                 priority = EXCLUDED.priority,
                 reason_codes = EXCLUDED.reason_codes,
                 safe_preview = EXCLUDED.safe_preview,
                 automated_decision = EXCLUDED.automated_decision,
                 requested_at = EXCLUDED.requested_at,
                 updated_at = EXCLUDED.updated_at,
                 retention_until = NULL`,
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
                item.priority ?? 'normal',
                JSON.stringify(item.reasonCodes ?? []),
                JSON.stringify(item.safePreview ?? {}),
                item.automatedDecision ?? null,
                item.createdAt,
                item.requestedAt,
                item.updatedAt,
            ],
        );
    }

    async get(subjectUri: string): Promise<ModerationQueueItem | null> {
        const result = await this.pool.query<ModerationQueueRow>(
            'SELECT * FROM moderation_queue_items WHERE subject_uri = $1',
            [subjectUri],
        );
        const row = result.rows[0];
        return row ? toItem(row) : null;
    }

    async list(): Promise<ModerationQueueItem[]> {
        const result = await this.pool.query<ModerationQueueRow>(
            `SELECT * FROM moderation_queue_items
             ORDER BY requested_at ASC, subject_uri ASC`,
        );
        return result.rows.map(toItem);
    }

    async assertReady(): Promise<void> {
        await this.pool.query(
            `SELECT queue_id, attempts FROM moderation_queue_items LIMIT 1`,
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

    async fail(command: FailModerationWorkCommand): Promise<void> {
        const result = await this.pool.query(
            `UPDATE moderation_queue_items
             SET lease_owner = NULL,
                 lease_expires_at = NULL,
                 next_attempt_at = $4,
                 last_failure_code = $5,
                 terminal_failure = $6,
                 updated_at = $3
             WHERE subject_uri = $1
               AND lease_owner = $2`,
            [
                command.subjectUri,
                command.workerId,
                command.now,
                command.terminal ? null : command.nextAttemptAt ?? null,
                command.failureCode,
                command.terminal,
            ],
        );
        if (result.rowCount !== 1) {
            throw new Error('MODERATION_LEASE_NOT_OWNED');
        }
    }

    async ack(command: AckModerationWorkCommand): Promise<void> {
        const result = await this.pool.query(
            `UPDATE moderation_queue_items
             SET queue_status = 'resolved',
                 lease_owner = NULL,
                 lease_expires_at = NULL,
                 next_attempt_at = NULL,
                 last_failure_code = NULL,
                 updated_at = $3
             WHERE subject_uri = $1
               AND lease_owner = $2`,
            [command.subjectUri, command.workerId, command.now],
        );
        if (result.rowCount !== 1) {
            throw new Error('MODERATION_LEASE_NOT_OWNED');
        }
    }
}
