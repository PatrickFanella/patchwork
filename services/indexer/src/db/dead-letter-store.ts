import { createHash } from 'node:crypto';
import {
    redactSensitiveText,
    type IngestionFailure,
} from '@patchwork/shared';
import type { Pool } from 'pg';

export interface DeadLetter {
    fingerprint: string;
    sourceCursor: number | null;
    failureCode: IngestionFailure['code'];
    diagnostic: string;
    receivedAt: string;
}

interface DeadLetterRow {
    event_fingerprint: string;
    source_cursor: string | number | null;
    failure_code: IngestionFailure['code'];
    diagnostic: string;
    received_at: Date | string;
}

const fingerprintFailure = (failure: IngestionFailure): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                code: failure.code,
                seq: failure.seq,
                rawEvent: failure.rawEvent,
            }),
        )
        .digest('hex');

export class PostgresDeadLetterStore {
    constructor(private readonly pool: Pool) {}

    async append(failure: IngestionFailure): Promise<void> {
        const diagnostic = redactSensitiveText(failure.message).slice(0, 500);
        await this.pool.query(
            `INSERT INTO indexer_dead_letters (
                event_fingerprint, source_cursor, failure_code, diagnostic,
                received_at
             ) VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (event_fingerprint) DO NOTHING`,
            [
                fingerprintFailure(failure),
                failure.seq,
                failure.code,
                diagnostic,
            ],
        );
    }

    async list(): Promise<DeadLetter[]> {
        const result = await this.pool.query<DeadLetterRow>(
            `SELECT event_fingerprint, source_cursor, failure_code, diagnostic,
                    received_at
             FROM indexer_dead_letters
             ORDER BY id`,
        );
        return result.rows.map(row => ({
            fingerprint: row.event_fingerprint,
            sourceCursor:
                row.source_cursor === null ? null : Number(row.source_cursor),
            failureCode: row.failure_code,
            diagnostic: row.diagnostic,
            receivedAt: new Date(row.received_at).toISOString(),
        }));
    }
}
