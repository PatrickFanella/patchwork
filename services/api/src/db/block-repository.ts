import type { Pool } from 'pg';

export interface CreateBlockInput {
    commandId: string;
    blockerDid: string;
    subjectDid: string;
    reason?: string;
    retentionUntil?: string;
    createdAt: string;
}

export interface CreateBlockResult {
    created: boolean;
    blockId: string;
}

export class PostgresBlockRepository {
    constructor(private readonly pool: Pool) {}

    async create(input: CreateBlockInput): Promise<CreateBlockResult> {
        const result = await this.pool.query<{
            block_id: string | number;
            inserted: boolean;
        }>(
            `INSERT INTO user_blocks (
                command_id, blocker_did, subject_did, reason,
                retention_until, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (command_id) DO UPDATE
             SET command_id = EXCLUDED.command_id
             RETURNING block_id, (xmax = 0) AS inserted`,
            [
                input.commandId,
                input.blockerDid,
                input.subjectDid,
                input.reason ?? null,
                input.retentionUntil ?? null,
                input.createdAt,
            ],
        );
        const row = result.rows[0];
        if (!row) {
            throw new Error('BLOCK_INSERT_FAILED');
        }
        return { created: row.inserted, blockId: String(row.block_id) };
    }

    async isBlocked(blockerDid: string, subjectDid: string): Promise<boolean> {
        const result = await this.pool.query(
            `SELECT 1 FROM user_blocks
             WHERE blocker_did = $1 AND subject_did = $2 AND deleted_at IS NULL`,
            [blockerDid, subjectDid],
        );
        return result.rowCount === 1;
    }

    async deleteSubject(subjectDid: string, deletedAt: string): Promise<number> {
        const result = await this.pool.query(
            `UPDATE user_blocks SET deleted_at = $2
             WHERE subject_did = $1 AND deleted_at IS NULL`,
            [subjectDid, deletedAt],
        );
        return result.rowCount ?? 0;
    }
}
