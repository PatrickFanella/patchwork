import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationsTable = 'indexer_schema_migrations';
const migrationFilename = /^\d+.*\.sql$/;

export interface RunIndexerMigrationsOptions {
    pool?: Pool;
    databaseUrl?: string;
    migrationsDirectory?: string;
}

export interface IndexerMigrationResult {
    applied: string[];
    skipped: string[];
}

const defaultMigrationsDirectory = (): string =>
    resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');

export const runIndexerMigrations = async (
    options: RunIndexerMigrationsOptions = {},
): Promise<IndexerMigrationResult> => {
    const ownsPool = !options.pool;
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!options.pool && !databaseUrl) {
        throw new Error('DATABASE_URL is required to run indexer migrations.');
    }
    const pool = options.pool ?? new Pool({ connectionString: databaseUrl });
    const directory = options.migrationsDirectory ?? defaultMigrationsDirectory();
    const entries = await readdir(directory, { withFileTypes: true });
    const names = entries
        .filter(entry => entry.isFile() && migrationFilename.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
    const migrations = await Promise.all(
        names.map(async name => {
            const sql = await readFile(resolve(directory, name), 'utf8');
            return {
                name,
                sql,
                checksum: createHash('sha256').update(sql).digest('hex'),
            };
        }),
    );
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${migrationsTable} (
                migration_name TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext('patchwork-indexer-migrations'))`,
        );
        const existing = await client.query<{
            migration_name: string;
            checksum: string;
        }>(`SELECT migration_name, checksum FROM ${migrationsTable}`);
        const checksums = new Map(
            existing.rows.map(row => [row.migration_name, row.checksum]),
        );
        const result: IndexerMigrationResult = { applied: [], skipped: [] };

        for (const migration of migrations) {
            const checksum = checksums.get(migration.name);
            if (checksum && checksum !== migration.checksum) {
                throw new Error(
                    `Checksum mismatch for already-applied indexer migration ${migration.name}.`,
                );
            }
            if (checksum) {
                result.skipped.push(migration.name);
                continue;
            }
            await client.query(migration.sql);
            await client.query(
                `INSERT INTO ${migrationsTable} (migration_name, checksum) VALUES ($1, $2)`,
                [migration.name, migration.checksum],
            );
            result.applied.push(migration.name);
        }
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        if (ownsPool) await pool.end();
    }
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    runIndexerMigrations()
        .then(result => {
            console.log(
                `[indexer:db:migrate] applied=${result.applied.length} skipped=${result.skipped.length}`,
            );
        })
        .catch(error => {
            console.error('[indexer:db:migrate] failed:', error);
            process.exitCode = 1;
        });
}
