import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CONTRACT_VERSION,
    loadModerationWorkerConfig,
    validateProductionServiceConfig,
    checkServiceHealth,
    type ModerationDecisionEvent,
    type ServiceHealth,
    type HealthCheck,
    type ModerationPolicyAction,
    SliCollector,
} from '@patchwork/shared';
import { ModerationMetrics } from './metrics.js';
import { createModerationRuntime } from './moderation-runtime.js';

const config = loadModerationWorkerConfig();

// Production startup guard
validateProductionServiceConfig(config);

const databaseUrl = process.env.DATABASE_URL;

const metrics = new ModerationMetrics();
const runtime = await createModerationRuntime({
    nodeEnv: config.NODE_ENV,
    ...(databaseUrl ? { databaseUrl } : {}),
    metrics,
});
const durableService = runtime.mode === 'postgres' ? runtime.service : undefined;

const sliCollector = new SliCollector();

const buildModerationHealthChecks = (): HealthCheck[] => {
    return [
        {
            name: 'queue_store',
            check: async () => {
                try {
                    if (runtime.mode === 'postgres') await runtime.queue.assertReady();
                    else runtime.queue.listPending();
                    return { status: 'ok' as const };
                } catch {
                    return {
                        status: 'not_ready' as const,
                        message: 'Queue store unreachable',
                    };
                }
            },
        },
    ];
};

const renderPrometheusMetrics = (): string => {
    const uptimeSeconds = Math.floor(process.uptime());

    const baseMetrics = [
        '# HELP patchwork_service_up Service health status (1 = up).',
        '# TYPE patchwork_service_up gauge',
        'patchwork_service_up{project="patchwork",service="moderation-worker",component="thimble"} 1',
        '# HELP patchwork_process_uptime_seconds Process uptime in seconds.',
        '# TYPE patchwork_process_uptime_seconds counter',
        `patchwork_process_uptime_seconds{project="patchwork",service="moderation-worker",component="thimble"} ${uptimeSeconds}`,
    ].join('\n');

    const moderationMetricsText = metrics.renderPrometheus();
    const sliMetricsText = sliCollector.renderPrometheus('moderation-worker');

    return `${baseMetrics}\n${moderationMetricsText}\n${sliMetricsText}`;
};

const sampleDecision: ModerationDecisionEvent = {
    eventId: 'mod-phase1-sample',
    subjectUri: 'at://did:example:author/app.mutual.aid/abc123',
    action: 'none',
    reason: 'phase1 baseline stub',
    decidedAt: new Date().toISOString(),
};

interface ModerationRouteResult {
    statusCode: number;
    body: unknown;
    contentType?: string;
}

type ModerationRouteHandler = (
    body: unknown,
) => ModerationRouteResult | Promise<ModerationRouteResult>;

interface ModerationRouteDefinition {
    method: 'GET' | 'POST';
    handler: ModerationRouteHandler;
}

const required = (body: unknown, key: string): string => {
    const record =
        typeof body === 'object' && body !== null ?
            (body as Record<string, unknown>)
        :   {};
    const raw = record[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) throw new Error(`Missing required parameter: ${key}`);
    return value;
};

const optional = (body: unknown, key: string): string | undefined => {
    if (typeof body !== 'object' || body === null || !(key in body)) return undefined;
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
    }
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) {
                reject(new Error('REQUEST_BODY_TOO_LARGE'));
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new Error('MALFORMED_JSON'));
            }
        });
        request.on('error', reject);
    });
};

const policyAction = (value: string): ModerationPolicyAction => {
    const actions: ModerationPolicyAction[] = [
        'delist',
        'suspend-visibility',
        'restore-visibility',
        'open-appeal',
        'start-appeal-review',
        'resolve-appeal-upheld',
        'resolve-appeal-rejected',
    ];
    const action = actions.find(candidate => candidate === value);
    if (!action) throw new Error('Unsupported moderation policy action.');
    return action;
};

const routeHandlers: Readonly<Record<string, ModerationRouteDefinition>> = {
    '/health': { method: 'GET', handler: async () => {
        const result = await checkServiceHealth(
            buildModerationHealthChecks(),
        );
        const payload: ServiceHealth = {
            service: 'moderation-worker',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        };
        return { statusCode: 200, body: payload };
    } },
    '/health/ready': { method: 'GET', handler: async () => {
        const result = await checkServiceHealth(
            buildModerationHealthChecks(),
        );
        const payload: ServiceHealth = {
            service: 'moderation-worker',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        };
        return {
            statusCode: result.status === 'not_ready' ? 503 : 200,
            body: payload,
        };
    } },
    '/metrics': { method: 'GET', handler: () => ({
        statusCode: 200,
        body: renderPrometheusMetrics(),
        contentType: 'text/plain; version=0.0.4',
    }) },
    '/decisions/sample': { method: 'GET', handler: () => ({
        statusCode: 200,
        body: sampleDecision,
    }) },
    '/moderation/queue/enqueue': { method: 'POST', handler: async body => {
        if (!durableService) return { statusCode: 503, body: { error: { code: 'DURABLE_MODERATION_REQUIRED' } } };
        const item = await durableService.enqueue({
            subjectUri: required(body, 'subjectUri'),
            reason: required(body, 'reason'),
            requestedAt: optional(body, 'requestedAt'),
        });
        return { statusCode: 200, body: { item } };
    } },
    '/moderation/queue': { method: 'GET', handler: async () => {
        if (!durableService) return { statusCode: 503, body: { error: { code: 'DURABLE_MODERATION_REQUIRED' } } };
        const items = await durableService.listQueue();
        return { statusCode: 200, body: { total: items.length, results: items } };
    } },
    '/moderation/policy/apply': { method: 'POST', handler: async body => {
        if (!durableService) return { statusCode: 503, body: { error: { code: 'DURABLE_MODERATION_REQUIRED' } } };
        const item = await durableService.applyPolicy({
            subjectUri: required(body, 'subjectUri'),
            actorDid: required(body, 'actorDid'),
            action: policyAction(required(body, 'action')),
            reason: required(body, 'reason'),
            occurredAt: required(body, 'occurredAt'),
            idempotencyKey: required(body, 'idempotencyKey'),
        });
        return { statusCode: 200, body: { item } };
    } },
    '/moderation/state': { method: 'POST', handler: async body => {
        if (!durableService) return { statusCode: 503, body: { error: { code: 'DURABLE_MODERATION_REQUIRED' } } };
        const subjectUri = required(body, 'subjectUri');
        const item = await durableService.getState(subjectUri);
        return {
            statusCode: item ? 200 : 404,
            body: item ? { item } : { error: { code: 'QUEUE_ITEM_NOT_FOUND' } },
        };
    } },
    '/moderation/audit': { method: 'POST', handler: async body => {
        if (!durableService) return { statusCode: 503, body: { error: { code: 'DURABLE_MODERATION_REQUIRED' } } };
        const entries = await durableService.listAudit(
            required(body, 'subjectUri'),
        );
        return { statusCode: 200, body: { total: entries.length, results: entries } };
    } },
};

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
): void => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
};

export const createModerationServer = () => createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    const route = routeHandlers[requestUrl.pathname];
    if (route) {
        if (request.method !== route.method) {
            response.setHeader('allow', route.method);
            writeJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
            return;
        }
        const startTime = Date.now();
        void Promise.resolve()
            .then(() => route.method === 'POST' ? readJsonBody(request) : undefined)
            .then(body => route.handler(body))
            .then(result => {
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
            })
            .catch(error => {
                sliCollector.recordRequest(
                    requestUrl.pathname,
                    Date.now() - startTime,
                );
                sliCollector.recordError(requestUrl.pathname);
                console.error('[moderation-worker] route error:', error);
                writeJson(response, 500, { error: 'Internal Server Error' });
            });
        return;
    }

    writeJson(response, 404, { error: 'Not Found' });
});

export const startModerationServer = () => {
    const server = createModerationServer();
    server.listen(config.MODERATION_PORT, '0.0.0.0', () => {
        console.log(
            `[moderation-worker] listening on http://0.0.0.0:${config.MODERATION_PORT} (concurrency=${config.MODERATION_WORKER_CONCURRENCY})`,
        );
    });
    return server;
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    const server = startModerationServer();
    process.on('SIGTERM', () => {
        server.close(() => {
            void runtime.close();
        });
    });
}
