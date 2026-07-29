import { createServer, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
    CONTRACT_VERSION,
    loadIndexerConfig,
    recordNsid,
    validateProductionServiceConfig,
    checkServiceHealth,
    type ServiceHealth,
    type HealthCheck,
    SliCollector,
} from '@patchwork/shared';
import { PostgresCheckpointStore } from './checkpoint.js';
import { PostgresDeadLetterStore } from './db/dead-letter-store.js';
import { PostgresLifecycleEventReconciler } from './db/lifecycle-reconciler.js';
import { PostgresProjectionStore } from './db/projection-store.js';
import { renderPrometheusRuntimeMetrics } from './metrics.js';
import { IndexerPipeline } from './pipeline.js';
import { IndexerRuntime } from './runtime.js';
import type { AtEventSource } from './stream/event-source.js';
import { JetstreamEventSource } from './stream/jetstream-source.js';

const config = loadIndexerConfig();

// Production startup guard
validateProductionServiceConfig(config);

const DATABASE_URL = process.env['DATABASE_URL'] ?? process.env['INDEXER_DATABASE_URL'];

interface PersistentPipeline {
    pipeline: IndexerPipeline;
    pool: Pool;
    projectionStore: PostgresProjectionStore;
}

const createPipeline = async (): Promise<PersistentPipeline> => {
    if (!DATABASE_URL) {
        throw new Error(
            'FATAL: DATABASE_URL or INDEXER_DATABASE_URL is required for the indexer runtime.',
        );
    }

    console.log('[indexer] DATABASE_URL detected — booting in persistent mode');
    const pool = new Pool({
        connectionString: DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
    const schema = await pool.query<{
        projections: string | null;
        directoryProjections: string | null;
        state: string | null;
        workflows: string | null;
        audit: string | null;
        deactivations: string | null;
    }>(
        `SELECT
            to_regclass('indexer_aid_post_projections')::TEXT AS projections,
            to_regclass('indexer_directory_resource_projections')::TEXT
                AS "directoryProjections",
            to_regclass('indexer_projection_state')::TEXT AS state,
            to_regclass('request_workflows')::TEXT AS workflows,
            to_regclass('operational_audit_events')::TEXT AS audit,
            to_regclass('account_deactivations')::TEXT AS deactivations`,
    );
    if (
        !schema.rows[0]?.projections ||
        !schema.rows[0]?.directoryProjections ||
        !schema.rows[0]?.state ||
        !schema.rows[0]?.workflows ||
        !schema.rows[0]?.audit ||
        !schema.rows[0]?.deactivations
    ) {
        await pool.end();
        throw new Error(
            'FATAL: indexer projection, lifecycle reconciliation, or account suppression schema is missing; run API and indexer migrations before startup.',
        );
    }

    const checkpointStore = new PostgresCheckpointStore(pool);
    const projectionStore = new PostgresProjectionStore(pool);
    const pipeline = new IndexerPipeline({
        checkpointStore,
        checkpointInterval: 100,
        projectionStore,
        deadLetterStore: new PostgresDeadLetterStore(pool),
        lifecycleReconciler: new PostgresLifecycleEventReconciler(pool),
    });

    const cursor = await pipeline.loadCheckpoint();
    if (cursor !== null) {
        console.log(`[indexer] resuming from checkpoint cursor=${cursor}`);
    } else {
        console.log('[indexer] no checkpoint found — starting from scratch');
    }

    return { pipeline, pool, projectionStore };
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
    source?: AtEventSource,
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
        if (source) {
            healthChecks.push({
                name: 'event-source',
                check: () =>
                    source.getMetrics().connected ?
                        { status: 'ok' as const }
                    :   {
                            status: 'not_ready' as const,
                            message: 'AT event source is disconnected',
                        },
            });
        }
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
        const base = renderPrometheusRuntimeMetrics(
            runtimeMetrics,
            source?.getMetrics(),
        );
        const sli = sliCollector.renderHttpPrometheus('indexer');
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
                source: source?.getMetrics() ?? null,
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

export const createIndexerServer = (
    pipeline: IndexerPipeline,
    source?: AtEventSource,
) => {
    const routeHandlers = createRouteHandlers(pipeline, source);

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
    const { pipeline, pool, projectionStore } = await createPipeline();
    const source = new JetstreamEventSource({
        url: config.INDEXER_FIREHOSE_URL,
        collections: [
            recordNsid.aidPost,
            recordNsid.directoryResource,
            recordNsid.volunteerProfile,
        ],
    });
    const runtime = new IndexerRuntime({
        pipeline,
        source,
        heartbeat: cursor => projectionStore.recordHeartbeat(cursor),
    });
    await runtime.start();
    const server = createIndexerServer(pipeline, source);
    await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(config.INDEXER_PORT, '0.0.0.0', () => {
            server.off('error', rejectListen);
            resolveListen();
        });
    });
    console.log(
        `[indexer] listening on http://0.0.0.0:${config.INDEXER_PORT} (contracts=${CONTRACT_VERSION}, mode=persistent)`,
    );

    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        await runtime.stop();
        await closeServer(server);
        await pool.end();
    };
    process.once('SIGTERM', () => void shutdown());
    process.once('SIGINT', () => void shutdown());
    return server;
};

const closeServer = (server: Server): Promise<void> =>
    new Promise((resolveClose, rejectClose) => {
        server.close(error => {
            if (error) rejectClose(error);
            else resolveClose();
        });
    });

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    startIndexerServer();
}
