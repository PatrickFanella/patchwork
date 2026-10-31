import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

const directory = new URL('../../db/migrations/', import.meta.url);

/** Apply every API migration in order, for tests that use an isolated schema. */
export const applyApiMigrations = async (pool: Pool): Promise<void> => {
    const names = (await readdir(directory))
        .filter(name => /^\d+.*\.sql$/u.test(name))
        .sort((left, right) => left.localeCompare(right));
    for (const name of names) {
        await pool.query(await readFile(new URL(name, directory), 'utf8'));
    }
};
