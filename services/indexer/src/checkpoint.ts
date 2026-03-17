import type {
    CheckpointData,
    CheckpointHealth,
    CheckpointStore,
} from '@patchwork/shared';

/**
 * In-memory checkpoint store for tests and fixture mode.
 * State is lost when the process exits.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
    private checkpoint: CheckpointData | null = null;
    private sequence = 0;

    async load(): Promise<CheckpointData | null> {
        return this.checkpoint;
    }

    async save(cursor: number): Promise<CheckpointData> {
        this.sequence += 1;
        this.checkpoint = {
            cursor,
            savedAt: new Date().toISOString(),
            sequence: this.sequence,
        };
        return { ...this.checkpoint };
    }

    async health(): Promise<CheckpointHealth> {
        if (!this.checkpoint) {
            return { healthy: true, lagSeconds: null, lastCheckpoint: null };
        }

        const lagSeconds =
            (Date.now() - new Date(this.checkpoint.savedAt).getTime()) / 1_000;

        return {
            healthy: true,
            lagSeconds: Math.round(lagSeconds * 1_000) / 1_000,
            lastCheckpoint: { ...this.checkpoint },
        };
    }
}

const CHECKPOINTS_TABLE = 'indexer_checkpoints';

const ensureCheckpointsTableSql = `
CREATE TABLE IF NOT EXISTS ${CHECKPOINTS_TABLE} (
    id TEXT PRIMARY KEY DEFAULT 'default',
    cursor BIGINT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sequence BIGINT NOT NULL DEFAULT 1
);
`;

const loadCheckpointSql = `
SELECT cursor, saved_at, sequence
FROM ${CHECKPOINTS_TABLE}
WHERE id = 'default'
`;

const upsertCheckpointSql = `
INSERT INTO ${CHECKPOINTS_TABLE} (id, cursor, saved_at, sequence)
VALUES ('default', $1, NOW(), 1)
ON CONFLICT (id)
DO UPDATE SET
    cursor = $1,
    saved_at = NOW(),
    sequence = ${CHECKPOINTS_TABLE}.sequence + 1
RETURNING cursor, saved_at, sequence
`;

interface CheckpointRow {
    cursor: string | number;
    saved_at: string | Date;
    sequence: string | number;
}

/**
 * Pool-like interface so we don't depend on the full pg module at type level.
 * Compatible with pg.Pool.
 */
export interface PostgresPoolLike {
    query<R = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
    ): Promise<{ rows: R[] }>;
}

/**
 * Persistent checkpoint store backed by Postgres.
 * Uses the `indexer_checkpoints` table with a single row (id='default').
 */
export class PostgresCheckpointStore implements CheckpointStore {
    private initialized = false;

    constructor(private readonly pool: PostgresPoolLike) {}

    private async ensureTable(): Promise<void> {
        if (this.initialized) {
            return;
        }
        await this.pool.query(ensureCheckpointsTableSql);
        this.initialized = true;
    }

    async load(): Promise<CheckpointData | null> {
        await this.ensureTable();
        const result = await this.pool.query<CheckpointRow>(loadCheckpointSql);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0]!;
        return {
            cursor: Number(row.cursor),
            savedAt: new Date(row.saved_at).toISOString(),
            sequence: Number(row.sequence),
        };
    }

    async save(cursor: number): Promise<CheckpointData> {
        await this.ensureTable();
        const result = await this.pool.query<CheckpointRow>(
            upsertCheckpointSql,
            [cursor],
        );

        const row = result.rows[0]!;
        return {
            cursor: Number(row.cursor),
            savedAt: new Date(row.saved_at).toISOString(),
            sequence: Number(row.sequence),
        };
    }

    async health(): Promise<CheckpointHealth> {
        try {
            await this.ensureTable();
            const checkpoint = await this.load();

            if (!checkpoint) {
                return {
                    healthy: true,
                    lagSeconds: null,
                    lastCheckpoint: null,
                };
            }

            const lagSeconds =
                (Date.now() - new Date(checkpoint.savedAt).getTime()) / 1_000;

            return {
                healthy: true,
                lagSeconds: Math.round(lagSeconds * 1_000) / 1_000,
                lastCheckpoint: checkpoint,
            };
        } catch {
            return {
                healthy: false,
                lagSeconds: null,
                lastCheckpoint: null,
            };
        }
    }
}
