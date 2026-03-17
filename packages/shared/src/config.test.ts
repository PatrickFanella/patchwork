import { describe, expect, it } from 'vitest';
import {
    loadApiConfig,
    validateProductionConfig,
    validateProductionServiceConfig,
    checkServiceHealth,
} from './config.js';

describe('config schema', () => {
    it('fails fast with a clear message for invalid DID', () => {
        const previous = process.env.ATPROTO_SERVICE_DID;
        process.env.ATPROTO_SERVICE_DID = 'not-a-did';

        expect(() => loadApiConfig()).toThrowError(/ATPROTO_SERVICE_DID/);

        if (previous === undefined) {
            delete process.env.ATPROTO_SERVICE_DID;
        } else {
            process.env.ATPROTO_SERVICE_DID = previous;
        }
    });

    it('requires API_DATABASE_URL (or DATABASE_URL) when API_DATA_SOURCE is postgres', () => {
        const previousSource = process.env.API_DATA_SOURCE;
        const previousApiDatabaseUrl = process.env.API_DATABASE_URL;
        const previousDatabaseUrl = process.env.DATABASE_URL;
        const previousDid = process.env.ATPROTO_SERVICE_DID;

        process.env.API_DATA_SOURCE = 'postgres';
        process.env.API_DATABASE_URL = '';
        process.env.DATABASE_URL = '';
        process.env.ATPROTO_SERVICE_DID = 'did:example:test-service';

        expect(() => loadApiConfig()).toThrowError(
            /API_DATABASE_URL \(or DATABASE_URL\) is required/,
        );

        process.env.API_DATA_SOURCE = previousSource;

        if (previousApiDatabaseUrl === undefined) {
            delete process.env.API_DATABASE_URL;
        } else {
            process.env.API_DATABASE_URL = previousApiDatabaseUrl;
        }

        if (previousDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previousDatabaseUrl;
        }

        if (previousDid === undefined) {
            delete process.env.ATPROTO_SERVICE_DID;
        } else {
            process.env.ATPROTO_SERVICE_DID = previousDid;
        }
    });
});

describe('validateProductionConfig', () => {
    it('does nothing when NODE_ENV is not production', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'development',
                ATPROTO_SERVICE_DID: 'did:example:test-service',
                API_DATA_SOURCE: 'fixture',
            }),
        ).not.toThrow();
    });

    it('throws when fixture mode is used in production', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:web:prod.example.com',
                API_DATA_SOURCE: 'fixture',
                DATABASE_URL: 'postgresql://localhost/db',
            }),
        ).toThrowError(/API_DATA_SOURCE=fixture is not allowed in production/);
    });

    it('throws when no DATABASE_URL is set in production', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:web:prod.example.com',
                API_DATA_SOURCE: 'postgres',
            }),
        ).toThrowError(
            /DATABASE_URL or API_DATABASE_URL must be set in production/,
        );
    });

    it('throws when ATPROTO_SERVICE_DID uses did:example: in production', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:example:test-service',
                API_DATA_SOURCE: 'postgres',
                DATABASE_URL: 'postgresql://localhost/db',
            }),
        ).toThrowError(
            /ATPROTO_SERVICE_DID must not use a did:example: value in production/,
        );
    });

    it('passes with valid production config', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:web:patchwork.example.com',
                API_DATA_SOURCE: 'postgres',
                DATABASE_URL: 'postgresql://localhost/patchwork',
            }),
        ).not.toThrow();
    });

    it('accepts API_DATABASE_URL as alternative to DATABASE_URL', () => {
        expect(() =>
            validateProductionConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:web:patchwork.example.com',
                API_DATA_SOURCE: 'postgres',
                API_DATABASE_URL: 'postgresql://localhost/patchwork',
            }),
        ).not.toThrow();
    });
});

describe('validateProductionServiceConfig', () => {
    it('does nothing when NODE_ENV is not production', () => {
        expect(() =>
            validateProductionServiceConfig({
                NODE_ENV: 'development',
                ATPROTO_SERVICE_DID: 'did:example:test',
            }),
        ).not.toThrow();
    });

    it('throws for did:example: in production', () => {
        expect(() =>
            validateProductionServiceConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:example:bad',
            }),
        ).toThrowError(/did:example:/);
    });

    it('passes with valid production DID', () => {
        expect(() =>
            validateProductionServiceConfig({
                NODE_ENV: 'production',
                ATPROTO_SERVICE_DID: 'did:web:indexer.example.com',
            }),
        ).not.toThrow();
    });
});

describe('checkServiceHealth', () => {
    it('returns ok when all checks pass', async () => {
        const result = await checkServiceHealth([
            { name: 'db', check: () => ({ status: 'ok' }) },
            { name: 'cache', check: () => ({ status: 'ok' }) },
        ]);
        expect(result.status).toBe('ok');
        expect(result.checks['db']?.status).toBe('ok');
        expect(result.checks['cache']?.status).toBe('ok');
    });

    it('returns degraded when any check is degraded', async () => {
        const result = await checkServiceHealth([
            { name: 'db', check: () => ({ status: 'ok' }) },
            {
                name: 'cache',
                check: () => ({
                    status: 'degraded',
                    message: 'high latency',
                }),
            },
        ]);
        expect(result.status).toBe('degraded');
    });

    it('returns not_ready when any check is not_ready', async () => {
        const result = await checkServiceHealth([
            {
                name: 'db',
                check: () => ({
                    status: 'not_ready',
                    message: 'connecting',
                }),
            },
            { name: 'cache', check: () => ({ status: 'degraded' }) },
        ]);
        expect(result.status).toBe('not_ready');
    });

    it('handles async checks', async () => {
        const result = await checkServiceHealth([
            {
                name: 'db',
                check: async () => ({ status: 'ok' as const }),
            },
        ]);
        expect(result.status).toBe('ok');
    });

    it('catches errors in checks and marks them degraded', async () => {
        const result = await checkServiceHealth([
            {
                name: 'db',
                check: () => {
                    throw new Error('connection refused');
                },
            },
        ]);
        expect(result.status).toBe('degraded');
        expect(result.checks['db']?.message).toBe('connection refused');
    });

    it('returns ok for empty checks array', async () => {
        const result = await checkServiceHealth([]);
        expect(result.status).toBe('ok');
    });
});
