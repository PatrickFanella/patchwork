import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const findWorkspaceRoot = (startDir: string): string => {
    let current = resolve(startDir);

    while (current !== resolve(current, '..')) {
        if (existsSync(resolve(current, 'package-lock.json'))) {
            return current;
        }

        current = resolve(current, '..');
    }

    return resolve(startDir);
};

const parseEnvContent = (content: string): Record<string, string> => {
    const entries: Record<string, string> = {};

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        entries[key] = value.replace(/^['\"]|['\"]$/g, '');
    }

    return entries;
};

export const loadWorkspaceEnvFiles = (cwd = process.cwd()): void => {
    const root = findWorkspaceRoot(cwd);
    const candidates = [resolve(root, '.env'), resolve(root, '.env.local')];

    for (const filePath of candidates) {
        if (!existsSync(filePath)) {
            continue;
        }

        const parsed = parseEnvContent(readFileSync(filePath, 'utf8'));
        for (const [key, value] of Object.entries(parsed)) {
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    }
};
