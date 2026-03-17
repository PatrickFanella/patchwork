import { createServer, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CONTRACT_VERSION,
    loadIndexerConfig,
    validateProductionServiceConfig,
    checkServiceHealth,
    type ServiceHealth,
    type HealthCheck,
    SliCollector,
} from '@patchwork/shared';
import { PostgresCheckpointStore } from './checkpoint.js';
import { renderPrometheusRuntimeMetrics } from './metrics.js';
import { createFixtureIndexerPipeline, IndexerPipeline } from './pipeline.js';

const config = loadIndexerConfig();

// Production startup guard
validateProductionServiceConfig(config);

const DATABASE_URL = process.env['DATABASE_URL'] ?? process.env['INDEXER_DATABASE_URL'];

const createPipeline = async (): Promise<IndexerPipeline> => {
    if (!DATABASE_URL) {
        console.log('[indexer] no DATABASE_URL — booting in fixture mode');
        return createFixtureIndexerPipeline();
    }

    console.log('[indexer] DATABASE_URL detected — booting in persistent mode');

    // Dynamic import of pg to avoid hard dependency in fixture mode
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });

    const checkpointStore = new PostgresCheckpointStore(pool);
    const pipeline = new IndexerPipeline({
        checkpointStore,
        checkpointInterval: 100,
    });

    const cursor = await pipeline.loadCheckpoint();
    if (cursor !== null) {
        console.log(`[indexer] resuming from checkpoint cursor=${cursor}`);
    } else {
        console.log('[indexer] no checkpoint found — starting from scratch');
    }

    return pipeline;
};

const sliCollector = new SliCollector();

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
) => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
};

interface IndexerRouteResult {
    statusCode: number;
    body: unknown;
    contentType?: string;
}

type IndexerRouteHandler = (
    requestUrl: URL,
) => IndexerRouteResult | Promise<IndexerRouteResult>;

const createRouteHandlers = (
    pipeline: IndexerPipeline,
): Readonly<Record<string, IndexerRouteHandler>> => ({
    '/health': async () => {
        const healthChecks: HealthCheck[] = [
            {
                name: 'checkpoint',
                check: async () => {
                    const runtimeMetrics = await pipeline.getRuntimeMetrics();
                    if (!runtimeMetrics.checkpointHealthy) {
                        return {
                            status: 'degraded' as const,
                            message: 'Checkpoint store unhealthy',
                        };
                    }
                    return { status: 'ok' as const };
                },
            },
        ];
        const result = await checkServiceHealth(healthChecks);
        const payload: ServiceHealth = {
            service: 'indexer',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        };
        return { statusCode: 200, body: payload };
    },
    '/health/ready': async () => {
        const healthChecks: HealthCheck[] = [
            {
                name: 'checkpoint',
                check: async () => {
                    const runtimeMetrics = await pipeline.getRuntimeMetrics();
                    if (!runtimeMetrics.checkpointHealthy) {
                        return {
                            status: 'not_ready' as const,
                            message: 'Checkpoint store not ready',
                        };
                    }
                    return { status: 'ok' as const };
                },
            },
        ];
        const result = await checkServiceHealth(healthChecks);
        const payload: ServiceHealth = {
            service: 'indexer',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        };
        return {
            statusCode: result.status === 'not_ready' ? 503 : 200,
            body: payload,
        };
    },
    '/metrics': async () => {
        const runtimeMetrics = await pipeline.getRuntimeMetrics();
        const base = renderPrometheusRuntimeMetrics(runtimeMetrics);
        const sli = sliCollector.renderPrometheus('indexer');
        return {
            statusCode: 200,
            body: `${base}\n${sli}`,
            contentType: 'text/plain; version=0.0.4',
        };
    },
    '/ingestion/metrics': async () => {
        const runtimeMetrics = await pipeline.getRuntimeMetrics();
        return {
            statusCode: 200,
            body: {
                metrics: pipeline.getMetrics(),
                checkpointSeq: pipeline.getCheckpointSeq(),
                runtime: runtimeMetrics,
            },
        };
    },
    '/ingestion/logs': () => ({
        statusCode: 200,
        body: {
            logs: pipeline.getLogs(),
        },
    }),
    '/indexes/stats': () => ({
        statusCode: 200,
        body: {
            stats: pipeline.getStats(),
        },
    }),
    '/events/sample': () => ({
        statusCode: 200,
        body: {
            sampleFeed: pipeline.queryFeed({
                latitude: 40.7128,
                longitude: -74.006,
                radiusKm: 25,
                page: 1,
                pageSize: 1,
                nowIso: '2026-02-26T13:00:00.000Z',
            }),
        },
    }),
});

export const createIndexerServer = (pipeline: IndexerPipeline) => {
    const routeHandlers = createRouteHandlers(pipeline);

    return createServer(async (request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');

        const handler = routeHandlers[requestUrl.pathname];
        if (handler) {
            const startTime = Date.now();
            try {
                const result = await handler(requestUrl);
                sliCollector.recordRequest(
                    requestUrl.pathname,
                    Date.now() - startTime,
                );
                if (result.statusCode >= 500) {
                    sliCollector.recordError(requestUrl.pathname);
                }

                if (result.contentType) {
                    response.writeHead(result.statusCode, {
                        'content-type': result.contentType,
                    });
                    response.end(String(result.body));
                    return;
                }

                writeJson(response, result.statusCode, result.body);
            } catch (error) {
                sliCollector.recordRequest(
                    requestUrl.pathname,
                    Date.now() - startTime,
                );
                sliCollector.recordError(requestUrl.pathname);
                console.error('[indexer] route error:', error);
                writeJson(response, 500, { error: 'Internal Server Error' });
            }
            return;
        }

        writeJson(response, 404, { error: 'Not Found' });
    });
};

export const startIndexerServer = async () => {
    const pipeline = await createPipeline();
    const server = createIndexerServer(pipeline);
    server.listen(config.INDEXER_PORT, '0.0.0.0', () => {
        console.log(
            `[indexer] listening on http://0.0.0.0:${config.INDEXER_PORT} (firehose=${config.INDEXER_FIREHOSE_URL}, contracts=${CONTRACT_VERSION}, mode=${DATABASE_URL ? 'persistent' : 'fixture'})`,
        );
    });
    return server;
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    startIndexerServer();
}
