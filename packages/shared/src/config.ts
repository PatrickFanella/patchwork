import { z } from 'zod';
import { DID_PATTERN } from './schemas.js';

const nodeEnvSchema = z
    .enum(['development', 'test', 'production'])
    .default('development');

const baseSchema = z.object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const atprotoSchema = z.object({
    ATPROTO_SERVICE_DID: z
        .string()
        .regex(DID_PATTERN, 'ATPROTO_SERVICE_DID must be a valid DID string.'),
    ATPROTO_PDS_URL: z.string().url().default('https://bsky.social'),
});

const webSchema = baseSchema.extend({
    VITE_APP_NAME: z.string().min(1).default('Patchwork'),
    VITE_API_BASE_URL: z.string().url().default('http://localhost:4000'),
});

const optionalUrlField = z
    .preprocess(
        (value: unknown) =>
            typeof value === 'string' && value.trim() === '' ?
                undefined
            :   value,
        z.string().url().optional(),
    )
    .optional();

const apiSchema = baseSchema.merge(atprotoSchema).extend({
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
    API_DATA_SOURCE: z.enum(['fixture', 'postgres']).default('fixture'),
    API_DATABASE_URL: optionalUrlField,
    DATABASE_URL: optionalUrlField,
});

const apiSchemaWithRefinements = apiSchema.superRefine((value, context) => {
    if (
        value.API_DATA_SOURCE === 'postgres' &&
        !value.API_DATABASE_URL &&
        !value.DATABASE_URL
    ) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['API_DATABASE_URL'],
            message:
                'API_DATABASE_URL (or DATABASE_URL) is required when API_DATA_SOURCE=postgres.',
        });
    }
});

const indexerSchema = baseSchema.merge(atprotoSchema).extend({
    INDEXER_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    INDEXER_FIREHOSE_URL: z.string().url().default('wss://bsky.network'),
});

const moderationWorkerSchema = baseSchema.merge(atprotoSchema).extend({
    MODERATION_PORT: z.coerce.number().int().min(1).max(65535).default(4200),
    MODERATION_WORKER_CONCURRENCY: z.coerce
        .number()
        .int()
        .min(1)
        .max(64)
        .default(2),
});

type AnySchema = z.ZodTypeAny;

const formatZodErrors = (error: z.ZodError): string => {
    return error.issues
        .map(issue => {
            const path =
                issue.path.length === 0 ? '<root>' : issue.path.join('.');
            return `${path}: ${issue.message}`;
        })
        .join('; ');
};

/**
 * Dynamically load workspace .env files in Node.js environments only.
 * Uses createRequire so the static import graph stays browser-safe for Vite/Rollup.
 */
const loadEnvFiles = (): void => {
    if (typeof globalThis.process?.versions?.node !== 'string') return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createRequire } = globalThis.process.getBuiltinModule?.('node:module')
            ?? { createRequire: undefined };
        if (createRequire) {
            const req = createRequire(import.meta.url);
            req('./env-file.js').loadWorkspaceEnvFiles();
        }
    } catch { /* not available in this runtime */ }
};

const parseEnv = <T extends AnySchema>(
    scope: string,
    schema: T,
): z.infer<T> => {
    loadEnvFiles();
    const result = schema.safeParse(process.env);

    if (!result.success) {
        throw new Error(
            `Invalid ${scope} configuration: ${formatZodErrors(result.error)}`,
        );
    }

    return result.data;
};

export type WebConfig = z.infer<typeof webSchema>;
export type ApiConfig = z.infer<typeof apiSchemaWithRefinements>;
export type IndexerConfig = z.infer<typeof indexerSchema>;
export type ModerationWorkerConfig = z.infer<typeof moderationWorkerSchema>;

export const loadWebConfig = (): WebConfig => parseEnv('web', webSchema);
export const loadApiConfig = (): ApiConfig =>
    parseEnv('api', apiSchemaWithRefinements);
export const loadIndexerConfig = (): IndexerConfig =>
    parseEnv('indexer', indexerSchema);
export const loadModerationWorkerConfig = (): ModerationWorkerConfig =>
    parseEnv('moderation-worker', moderationWorkerSchema);

// ---------------------------------------------------------------------------
// Production startup guards
// ---------------------------------------------------------------------------

export interface ProductionConfigBase {
    NODE_ENV: string;
    ATPROTO_SERVICE_DID: string;
}

export interface ProductionApiConfig extends ProductionConfigBase {
    API_DATA_SOURCE?: string;
    API_DATABASE_URL?: string;
    DATABASE_URL?: string;
}

/**
 * Validate that a config is safe for production use.
 * Throws with an actionable message if any guard fails.
 */
export const validateProductionConfig = (
    config: ProductionApiConfig,
): void => {
    if (config.NODE_ENV !== 'production') {
        return; // Guards only apply in production
    }

    if (config.API_DATA_SOURCE === 'fixture') {
        throw new Error(
            'FATAL: API_DATA_SOURCE=fixture is not allowed in production. ' +
                'Set API_DATA_SOURCE=postgres and provide a DATABASE_URL.',
        );
    }

    if (!config.API_DATABASE_URL && !config.DATABASE_URL) {
        throw new Error(
            'FATAL: DATABASE_URL or API_DATABASE_URL must be set in production. ' +
                'Provide a valid PostgreSQL connection string.',
        );
    }

    if (
        config.ATPROTO_SERVICE_DID === 'did:example:test-service' ||
        config.ATPROTO_SERVICE_DID.startsWith('did:example:')
    ) {
        throw new Error(
            'FATAL: ATPROTO_SERVICE_DID must not use a did:example: value in production. ' +
                'Set it to your real service DID (e.g. did:web:your-domain.com).',
        );
    }
};

/**
 * Validate production config for services that lack API_DATA_SOURCE
 * (indexer, moderation-worker).
 */
export const validateProductionServiceConfig = (
    config: ProductionConfigBase,
): void => {
    if (config.NODE_ENV !== 'production') {
        return;
    }

    if (
        config.ATPROTO_SERVICE_DID === 'did:example:test-service' ||
        config.ATPROTO_SERVICE_DID.startsWith('did:example:')
    ) {
        throw new Error(
            'FATAL: ATPROTO_SERVICE_DID must not use a did:example: value in production. ' +
                'Set it to your real service DID (e.g. did:web:your-domain.com).',
        );
    }
};

// ---------------------------------------------------------------------------
// Health-check utilities
// ---------------------------------------------------------------------------

import type { HealthStatus } from './contracts.js';

export interface HealthCheck {
    name: string;
    check: () => Promise<{ status: HealthStatus; message?: string }> | { status: HealthStatus; message?: string };
}

/**
 * Run all health checks and compute an aggregate status.
 * Returns 'ok' if all pass, 'degraded' if any are degraded, 'not_ready' if any are not_ready.
 */
export const checkServiceHealth = async (
    checks: HealthCheck[],
): Promise<{
    status: HealthStatus;
    checks: Record<string, { status: HealthStatus; message?: string }>;
}> => {
    const results: Record<string, { status: HealthStatus; message?: string }> =
        {};
    let aggregate: HealthStatus = 'ok';

    for (const { name, check } of checks) {
        try {
            const result = await check();
            results[name] = result;
            if (result.status === 'not_ready') {
                aggregate = 'not_ready';
            } else if (result.status === 'degraded' && aggregate !== 'not_ready') {
                aggregate = 'degraded';
            }
        } catch (error) {
            results[name] = {
                status: 'degraded',
                message:
                    error instanceof Error ?
                        error.message
                    :   'Health check failed',
            };
            if (aggregate !== 'not_ready') {
                aggregate = 'degraded';
            }
        }
    }

    return { status: aggregate, checks: results };
};
