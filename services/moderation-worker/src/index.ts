import { createServer, type ServerResponse } from 'node:http';
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
const fixtureService = runtime.mode === 'fixture' ? runtime.service : undefined;

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
    requestUrl: URL,
) => ModerationRouteResult | Promise<ModerationRouteResult>;

const required = (params: URLSearchParams, key: string): string => {
    const value = params.get(key)?.trim();
    if (!value) throw new Error(`Missing required parameter: ${key}`);
    return value;
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

const routeHandlers: Readonly<Record<string, ModerationRouteHandler>> = {
    '/health': async () => {
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
    },
    '/health/ready': async () => {
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
    },
    '/metrics': () => ({
        statusCode: 200,
        body: renderPrometheusMetrics(),
        contentType: 'text/plain; version=0.0.4',
    }),
    '/decisions/sample': () => ({
        statusCode: 200,
        body: sampleDecision,
    }),
    '/moderation/queue/enqueue': async requestUrl => {
        if (!durableService) return fixtureService!.enqueueFromParams(requestUrl.searchParams);
        const item = await durableService.enqueue({
            subjectUri: required(requestUrl.searchParams, 'subjectUri'),
            reason: required(requestUrl.searchParams, 'reason'),
            requestedAt: requestUrl.searchParams.get('requestedAt') ?? undefined,
        });
        return { statusCode: 200, body: { item } };
    },
    '/moderation/queue': async requestUrl => {
        if (!durableService) return fixtureService!.listQueueFromParams(requestUrl.searchParams);
        const items = await durableService.listQueue();
        return { statusCode: 200, body: { total: items.length, results: items } };
    },
    '/moderation/policy/apply': async requestUrl => {
        if (!durableService) return fixtureService!.applyPolicyFromParams(requestUrl.searchParams);
        const item = await durableService.applyPolicy({
            subjectUri: required(requestUrl.searchParams, 'subjectUri'),
            actorDid: required(requestUrl.searchParams, 'actorDid'),
            action: policyAction(required(requestUrl.searchParams, 'action')),
            reason: required(requestUrl.searchParams, 'reason'),
            occurredAt: required(requestUrl.searchParams, 'occurredAt'),
            idempotencyKey: required(requestUrl.searchParams, 'idempotencyKey'),
        });
        return { statusCode: 200, body: { item } };
    },
    '/moderation/state': async requestUrl => {
        if (!durableService) return fixtureService!.getStateFromParams(requestUrl.searchParams);
        const subjectUri = required(requestUrl.searchParams, 'subjectUri');
        const item = await durableService.getState(subjectUri);
        return {
            statusCode: item ? 200 : 404,
            body: item ? { item } : { error: { code: 'QUEUE_ITEM_NOT_FOUND' } },
        };
    },
    '/moderation/audit': async requestUrl => {
        if (!durableService) return fixtureService!.listAuditFromParams(requestUrl.searchParams);
        const entries = await durableService.listAudit(
            required(requestUrl.searchParams, 'subjectUri'),
        );
        return { statusCode: 200, body: { total: entries.length, results: entries } };
    },
};

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
): void => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
};

const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    const handler = routeHandlers[requestUrl.pathname];
    if (handler) {
        const startTime = Date.now();
        void Promise.resolve()
            .then(() => handler(requestUrl))
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

process.on('SIGTERM', () => {
    server.close(() => {
        void runtime.close();
    });
});

server.listen(config.MODERATION_PORT, '0.0.0.0', () => {
    console.log(
        `[moderation-worker] listening on http://0.0.0.0:${config.MODERATION_PORT} (concurrency=${config.MODERATION_WORKER_CONCURRENCY})`,
    );
});
