import type { Pool } from 'pg';

export interface CreateReportInput {
    commandId: string;
    reporterDid: string;
    subjectUri: string;
    subjectDid?: string;
    reason: string;
    details?: string;
    retentionUntil: string;
    createdAt: string;
}

export interface CreateReportResult {
    created: boolean;
    reportId: string;
}

export interface ReportRepository {
    create(input: CreateReportInput): Promise<CreateReportResult>;
    deleteSubject(subjectUri: string, deletedAt: string): Promise<number>;
}

export class PostgresReportRepository implements ReportRepository {
    constructor(private readonly pool: Pool) {}

    async create(input: CreateReportInput): Promise<CreateReportResult> {
        const result = await this.pool.query<{
            report_id: string | number;
            inserted: boolean;
        }>(
            `INSERT INTO abuse_reports (
                command_id, reporter_did, subject_uri, subject_did, reason,
                details, retention_until, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (command_id) DO UPDATE
             SET command_id = EXCLUDED.command_id
             RETURNING report_id, (xmax = 0) AS inserted`,
            [
                input.commandId,
                input.reporterDid,
                input.subjectUri,
                input.subjectDid ?? null,
                input.reason,
                input.details ?? null,
                input.retentionUntil,
                input.createdAt,
            ],
        );
        const row = result.rows[0];
        if (!row) {
            throw new Error('REPORT_INSERT_FAILED');
        }
        return { created: row.inserted, reportId: String(row.report_id) };
    }

    async deleteSubject(subjectUri: string, deletedAt: string): Promise<number> {
        const result = await this.pool.query(
            `UPDATE abuse_reports
             SET deleted_at = $2, details = NULL
             WHERE subject_uri = $1 AND deleted_at IS NULL`,
            [subjectUri, deletedAt],
        );
        return result.rowCount ?? 0;
    }
}
