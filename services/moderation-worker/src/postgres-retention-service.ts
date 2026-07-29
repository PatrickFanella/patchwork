import type { Pool } from 'pg';

export interface ModerationRetentionResult {
    auditRecords: number;
    resolvedCases: number;
    submissionReviews: number;
    notificationEvents: number;
}

export class PostgresModerationRetentionService {
    constructor(private readonly pool: Pool) {}

    async enforce(now = new Date()): Promise<ModerationRetentionResult> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const auditRecords = await client.query(
                `DELETE FROM moderation_audit_records
                 WHERE retention_until <= $1`,
                [now.toISOString()],
            );
            const submissionReviews = await client.query(
                `DELETE FROM moderation_submission_reviews
                 WHERE retention_until <= $1`,
                [now.toISOString()],
            );
            const notificationEvents = await client.query(
                `DELETE FROM moderation_notification_events
                 WHERE retention_until <= $1`,
                [now.toISOString()],
            );
            const resolvedCases = await client.query(
                `DELETE FROM moderation_queue_items AS queue
                 WHERE queue.queue_status = 'resolved'
                   AND queue.retention_until IS NOT NULL
                   AND queue.retention_until <= $1
                   AND NOT EXISTS (
                       SELECT 1 FROM moderation_audit_records AS audit
                       WHERE audit.subject_uri = queue.subject_uri
                   )`,
                [now.toISOString()],
            );
            await client.query('COMMIT');
            return {
                auditRecords: auditRecords.rowCount ?? 0,
                resolvedCases: resolvedCases.rowCount ?? 0,
                submissionReviews: submissionReviews.rowCount ?? 0,
                notificationEvents: notificationEvents.rowCount ?? 0,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
