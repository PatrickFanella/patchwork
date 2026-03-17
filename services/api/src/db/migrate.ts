import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiConfig } from '@patchwork/shared';
import { createPostgresPool } from './discovery-events.js';

const MIGRATIONS_TABLE = 'schema_migrations';
const migrationFilenamePattern = /^\d+.*\.sql$/;

const ensureMigrationsTableSql = `
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    migration_name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

interface AppliedMigrationRow {
    migration_name: string;
    checksum: string;
}

interface MigrationFile {
    name: string;
    sql: string;
    checksum: string;
}

export interface MigrationResult {
    applied: string[];
    skipped: string[];
}

const parseMigrationDirectory = (argv: readonly string[]): string | undefined => {
    const dirArg = argv.find(argument => argument.startsWith('--dir='));
    if (!dirArg) {
        return undefined;
    }

    return dirArg.slice('--dir='.length).trim();
};

const resolveDatabaseUrl = (): string => {
    const config = loadApiConfig();
    const databaseUrl = config.API_DATABASE_URL ?? config.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error(
            'API_DATABASE_URL (or DATABASE_URL) must be set to run migrations.',
        );
    }

    return databaseUrl;
};

const defaultMigrationsDirectory = (): string => {
    return resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
};

const listMigrationFiles = async (
    migrationsDirectory: string,
): Promise<MigrationFile[]> => {
    const entries = await readdir(migrationsDirectory, {
        withFileTypes: true,
    });

    const migrationNames = entries
        .filter(entry => entry.isFile() && migrationFilenamePattern.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));

    const migrationFiles = await Promise.all(
        migrationNames.map(async migrationName => {
            const migrationPath = resolve(migrationsDirectory, migrationName);
            const sql = await readFile(migrationPath, 'utf8');
            const checksum = createHash('sha256').update(sql).digest('hex');

            return {
                name: migrationName,
                sql,
                checksum,
            } satisfies MigrationFile;
        }),
    );

    return migrationFiles;
};

export const runPostgresMigrations = async (
    migrationsDirectory: string = defaultMigrationsDirectory(),
): Promise<MigrationResult> => {
    const migrationFiles = await listMigrationFiles(migrationsDirectory);
    const pool = createPostgresPool(resolveDatabaseUrl());

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(ensureMigrationsTableSql);

            const existingRows = await client.query<AppliedMigrationRow>(`
                SELECT migration_name, checksum
                FROM ${MIGRATIONS_TABLE}
            `);

            const existingMigrations = new Map(
                existingRows.rows.map(row => [row.migration_name, row.checksum]),
            );

            const applied: string[] = [];
            const skipped: string[] = [];

            for (const migration of migrationFiles) {
                const existingChecksum = existingMigrations.get(migration.name);

                if (existingChecksum && existingChecksum !== migration.checksum) {
                    throw new Error(
                        `Checksum mismatch for already-applied migration ${migration.name}. Expected ${existingChecksum}, got ${migration.checksum}.`,
                    );
                }

                if (existingChecksum) {
                    skipped.push(migration.name);
                    continue;
                }

                await client.query(migration.sql);
                await client.query(
                    `
                    INSERT INTO ${MIGRATIONS_TABLE} (migration_name, checksum)
                    VALUES ($1, $2)
                    `,
                    [migration.name, migration.checksum],
                );
                applied.push(migration.name);
            }

            await client.query('COMMIT');

            return {
                applied,
                skipped,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } finally {
        await pool.end();
    }
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    const customDirectory = parseMigrationDirectory(process.argv.slice(2));

    runPostgresMigrations(customDirectory)
        .then(result => {
            console.log(
                `[api:db:migrate] applied=${result.applied.length} skipped=${result.skipped.length}`,
            );
            if (result.applied.length > 0) {
                console.log(
                    `[api:db:migrate] applied migrations: ${result.applied.join(', ')}`,
                );
            }
        })
        .catch(error => {
            console.error('[api:db:migrate] failed:', error);
            process.exitCode = 1;
        });
}
