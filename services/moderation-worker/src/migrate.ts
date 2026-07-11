import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationsTable = 'moderation_schema_migrations';
const migrationFilename = /^\d+.*\.sql$/;

interface MigrationFile {
    name: string;
    sql: string;
    checksum: string;
}

export interface ModerationMigrationResult {
    applied: string[];
    skipped: string[];
}

export interface RunModerationMigrationsOptions {
    pool?: Pool;
    databaseUrl?: string;
    migrationsDirectory?: string;
}

const defaultMigrationsDirectory = (): string =>
    resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');

const loadMigrations = async (directory: string): Promise<MigrationFile[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const names = entries
        .filter(entry => entry.isFile() && migrationFilename.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));

    return Promise.all(
        names.map(async name => {
            const sql = await readFile(resolve(directory, name), 'utf8');
            return {
                name,
                sql,
                checksum: createHash('sha256').update(sql).digest('hex'),
            };
        }),
    );
};

export const runModerationMigrations = async (
    options: RunModerationMigrationsOptions = {},
): Promise<ModerationMigrationResult> => {
    const ownsPool = !options.pool;
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!options.pool && !databaseUrl) {
        throw new Error('DATABASE_URL is required to run moderation migrations.');
    }
    const pool = options.pool ?? new Pool({ connectionString: databaseUrl });
    const migrations = await loadMigrations(
        options.migrationsDirectory ?? defaultMigrationsDirectory(),
    );
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(
            `CREATE TABLE IF NOT EXISTS ${migrationsTable} (
                migration_name TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
        );
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext('patchwork-moderation-migrations'))`,
        );
        const existing = await client.query<{
            migration_name: string;
            checksum: string;
        }>(`SELECT migration_name, checksum FROM ${migrationsTable}`);
        const checksums = new Map(
            existing.rows.map(row => [row.migration_name, row.checksum]),
        );
        const result: ModerationMigrationResult = { applied: [], skipped: [] };

        for (const migration of migrations) {
            const checksum = checksums.get(migration.name);
            if (checksum && checksum !== migration.checksum) {
                throw new Error(
                    `Checksum mismatch for already-applied moderation migration ${migration.name}.`,
                );
            }
            if (checksum) {
                result.skipped.push(migration.name);
                continue;
            }
            await client.query(migration.sql);
            await client.query(
                `INSERT INTO ${migrationsTable} (migration_name, checksum)
                 VALUES ($1, $2)`,
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
    runModerationMigrations()
        .then(result => {
            console.log(
                `[moderation:db:migrate] applied=${result.applied.length} skipped=${result.skipped.length}`,
            );
        })
        .catch(error => {
            console.error('[moderation:db:migrate] failed:', error);
            process.exitCode = 1;
        });
}
