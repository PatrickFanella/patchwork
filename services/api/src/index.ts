import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CONTRACT_VERSION,
    loadApiConfig,
    validateProductionConfig,
    validateAtAuthRuntimeConfig,
    checkServiceHealth,
    type ServiceHealth,
    type HealthCheck,
    SliCollector,
} from '@patchwork/shared';
import { createPostgresPool } from './db/discovery-events.js';
import {
    createFixtureQueryService,
    createPostgresQueryService,
} from './query-service.js';
import { AtClientError } from '@patchwork/at-client';
import { createAtAuthRuntime } from './auth/runtime.js';
import { serializeSessionCookie } from './auth/at-auth-service.js';
import { AidPostCommandService } from './records/aid-post-command-service.js';
import { ZodError } from 'zod';
import { createLifecycleService } from './lifecycle-service.js';
import { getCorsHeaders } from './cors.js';
import { selectLimiter, extractClientIp } from './rate-limiter.js';
import { PostgresBlockRepository } from './db/block-repository.js';
import { PostgresReportRepository } from './db/report-repository.js';
import { PostgresLifecycleRepository } from './db/lifecycle-repository.js';
import { PostgresRoleRepository } from './db/role-repository.js';
import { BlockService } from './block-service.js';
import { ReportService } from './report-service.js';
import { createLifecycleTransitionHandler } from './http/lifecycle-transition-handler.js';
import { createMethodRouter } from './http/router.js';
import { readJsonBody } from './http/json-body.js';
import { authenticateRequest } from './http/authenticated-request.js';
import { createGracefulShutdown } from './http/graceful-shutdown.js';
import { securityHeaders } from './http/security-headers.js';
import {
    assertCsrfProtection,
    createCsrfToken,
    serializeCsrfCookie,
} from './http/csrf.js';
import {
    ensureRequestId,
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './http/error-response.js';

const config = loadApiConfig();

// Production startup guard — fail fast if misconfigured
validateProductionConfig(config);
validateAtAuthRuntimeConfig(config);

const resolveQueryService = async () => {
    if (config.API_DATA_SOURCE !== 'postgres') {
        return createFixtureQueryService();
    }

    return createPostgresQueryService(
        // Config validation guarantees this is set when API_DATA_SOURCE=postgres
        (config.API_DATABASE_URL ?? config.DATABASE_URL)!,
    );
};

const queryService = await resolveQueryService();

const databaseUrl = config.API_DATABASE_URL ?? config.DATABASE_URL;
const postgresPool =
    config.API_DATA_SOURCE === 'postgres' && databaseUrl
        ? createPostgresPool(databaseUrl)
        : undefined;

const blockService =
    postgresPool ? new BlockService(new PostgresBlockRepository(postgresPool)) : undefined;
const reportService =
    postgresPool ?
        new ReportService(new PostgresReportRepository(postgresPool))
    :   undefined;
const lifecycleRepository =
    postgresPool ? new PostgresLifecycleRepository(postgresPool) : undefined;
const lifecycleService = createLifecycleService(lifecycleRepository);
const roleRepository =
    postgresPool ? new PostgresRoleRepository(postgresPool) : undefined;
const atAuthRuntime =
    config.NODE_ENV === 'test' ?
        undefined
    :   createAtAuthRuntime(config, postgresPool!);

const authenticateApiRequest =
    atAuthRuntime && roleRepository ?
        (request: IncomingMessage) =>
            authenticateRequest(request, {
                resolveSession: token => atAuthRuntime.service.current(token),
                resolveRole: did => roleRepository.resolve(did),
            })
    :   undefined;

const aidPostCommandService =
    atAuthRuntime ?
        new AidPostCommandService(
            sessionToken => atAuthRuntime.aidPostClient(sessionToken),
            lifecycleRepository,
            lifecycleRepository,
        )
    :   undefined;

const lifecycleTransitionHandler =
    authenticateApiRequest && postgresPool ?
        createLifecycleTransitionHandler({
            service: lifecycleService,
            authenticate: authenticateApiRequest,
        })
    :   undefined;

const sliCollector = new SliCollector();

const healthChecks: HealthCheck[] = [];

// Add database health check when using postgres
if (postgresPool) {
    healthChecks.push({
        name: 'database',
        check: async () => {
            try {
                const client = await postgresPool.connect();
                try {
                    await client.query('SELECT 1');
                    return { status: 'ok' as const };
                } finally {
                    client.release();
                }
            } catch (error) {
                return {
                    status: 'degraded' as const,
                    message:
                        error instanceof Error ?
                            error.message
                        :   'Database unreachable',
                };
            }
        },
    });
}

const buildHealthPayload = async (): Promise<{
    payload: ServiceHealth;
    httpStatus: number;
}> => {
    if (healthChecks.length === 0) {
        return {
            payload: {
                service: 'api',
                status: 'ok',
                contractVersion: CONTRACT_VERSION,
                did: config.ATPROTO_SERVICE_DID,
            },
            httpStatus: 200,
        };
    }
    const result = await checkServiceHealth(healthChecks);
    return {
        payload: {
            service: 'api',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        },
        httpStatus: 200,
    };
};

const buildReadinessPayload = async (): Promise<{
    payload: ServiceHealth;
    httpStatus: number;
}> => {
    if (healthChecks.length === 0) {
        return {
            payload: {
                service: 'api',
                status: 'ok',
                contractVersion: CONTRACT_VERSION,
                did: config.ATPROTO_SERVICE_DID,
            },
            httpStatus: 200,
        };
    }
    const result = await checkServiceHealth(healthChecks);
    const httpStatus = result.status === 'not_ready' ? 503 : 200;
    return {
        payload: {
            service: 'api',
            status: result.status,
            contractVersion: CONTRACT_VERSION,
            did: config.ATPROTO_SERVICE_DID,
            checks: result.checks,
        },
        httpStatus,
    };
};

const renderPrometheusMetrics = (): string => {
    const uptimeSeconds = Math.floor(process.uptime());

    const baseMetrics = [
        '# HELP patchwork_service_up Service health status (1 = up).',
        '# TYPE patchwork_service_up gauge',
        'patchwork_service_up{project="patchwork",service="api",component="stitch"} 1',
        '# HELP patchwork_process_uptime_seconds Process uptime in seconds.',
        '# TYPE patchwork_process_uptime_seconds counter',
        `patchwork_process_uptime_seconds{project="patchwork",service="api",component="stitch"} ${uptimeSeconds}`,
    ].join('\n');

    const sliMetrics = sliCollector.renderPrometheus('api');

    return `${baseMetrics}\n${sliMetrics}`;
};

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
    extraHeaders?: Record<string, string>,
): void => {
    writeJsonResponse(response, statusCode, body, extraHeaders);
};

const writeRouteError = (response: ServerResponse, error: unknown): void => {
    writePublicError(response, error);
};

const writeAtAuthError = (response: ServerResponse, error: unknown): void => {
    if (error instanceof PublicHttpError) {
        writeRouteError(response, error);
        return;
    }
    if (error instanceof AtClientError) {
        const statusCode =
            error.code === 'SESSION_EXPIRED' ? 401
            : error.code === 'UNAUTHORIZED' ? 403
            : error.code === 'PDS_UNAVAILABLE' ? 503
            : 400;
        writeJson(response, statusCode, {
            error: {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
            },
        });
        return;
    }
    writeJson(response, 500, {
        error: {
            code: 'AUTH_ERROR',
            message: 'AT Protocol authentication failed.',
        },
    });
};

const handleRealAuthRoute = (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!atAuthRuntime) return false;

    if (
        request.method === 'GET' &&
        requestUrl.pathname === '/oauth/client-metadata.json'
    ) {
        writeJson(response, 200, atAuthRuntime.clientMetadata);
        return true;
    }

    const authPaths = new Set([
        '/oauth/login',
        '/oauth/callback',
        '/auth/session',
        '/auth/refresh',
    ]);
    if (!authPaths.has(requestUrl.pathname)) return false;

    void (async () => {
        try {
            if (
                request.method === 'POST' &&
                requestUrl.pathname === '/oauth/login'
            ) {
                const body = await readJsonBody(request);
                const handle =
                    typeof body === 'object' &&
                    body !== null &&
                    'handle' in body &&
                    typeof body.handle === 'string' ?
                        body.handle.trim()
                    :   '';
                const returnTo =
                    typeof body === 'object' &&
                    body !== null &&
                    'returnTo' in body &&
                    typeof body.returnTo === 'string' ?
                        body.returnTo
                    :   '/';
                if (!handle) {
                    writeJson(response, 400, {
                        error: {
                            code: 'INVALID_HANDLE',
                            message: 'handle is required.',
                        },
                    });
                    return;
                }
                const result = await atAuthRuntime.service.beginLogin(
                    handle,
                    returnTo,
                );
                response.writeHead(302, { location: result.authorizationUrl });
                response.end();
                return;
            }

            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/oauth/callback'
            ) {
                const result = await atAuthRuntime.service.completeLogin(
                    requestUrl.searchParams,
                );
                const csrfToken = createCsrfToken();
                response.writeHead(302, {
                    location: result.returnTo,
                    'set-cookie': [
                        serializeSessionCookie(
                            result.sessionToken,
                            config.NODE_ENV === 'production',
                        ),
                        serializeCsrfCookie(
                            csrfToken,
                            config.NODE_ENV === 'production',
                        ),
                    ],
                });
                response.end();
                return;
            }

            const authenticated = await authenticateApiRequest!(request);

            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/auth/session'
            ) {
                writeJson(response, 200, {
                    session: { did: authenticated.principal.did },
                });
                return;
            }

            if (
                request.method === 'POST' &&
                requestUrl.pathname === '/auth/refresh'
            ) {
                const refreshed = await atAuthRuntime.service.refresh(
                    authenticated.sessionToken,
                );
                writeJson(response, 200, { session: refreshed, refreshed: true });
                return;
            }

            if (
                request.method === 'DELETE' &&
                requestUrl.pathname === '/auth/session'
            ) {
                await atAuthRuntime.service.logout(authenticated.sessionToken);
                response.setHeader('set-cookie', [
                    serializeSessionCookie(
                        '',
                        config.NODE_ENV === 'production',
                        0,
                    ),
                    serializeCsrfCookie('', config.NODE_ENV === 'production', 0),
                ]);
                writeJson(
                    response,
                    200,
                    { deleted: true },
                );
                return;
            }

            response.writeHead(405, { allow: 'GET, POST, DELETE' });
            response.end();
        } catch (error) {
            writeAtAuthError(response, error);
        }
    })();
    return true;
};

const writeAidPostCommandError = (
    response: ServerResponse,
    error: unknown,
): void => {
    if (error instanceof PublicHttpError) {
        writeRouteError(response, error);
        return;
    }
    if (error instanceof AtClientError) {
        writeAtAuthError(response, error);
        return;
    }
    if (error instanceof ZodError) {
        writeJson(response, 400, {
            error: {
                code: 'INVALID_COMMAND',
                message: 'The aid-post command payload is invalid.',
            },
        });
        return;
    }
    writeJson(response, 500, {
        error: {
            code: 'AID_POST_COMMAND_ERROR',
            message: 'The aid-post command failed.',
        },
    });
};

const handleDurableSafetyRoute = (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    const isBlock = request.method === 'POST' && requestUrl.pathname === '/blocks';
    const isReport =
        request.method === 'POST' && requestUrl.pathname === '/reports';
    if (!isBlock && !isReport) return false;

    void (async () => {
        try {
            if (!atAuthRuntime || !blockService || !reportService) {
                writeJson(response, 503, {
                    error: {
                        code: 'DURABLE_CORE_UNAVAILABLE',
                        message: 'Durable safety services are unavailable.',
                    },
                });
                return;
            }
            const authenticated = await authenticateApiRequest!(request);
            const body = await readJsonBody(request);
            const result =
                isBlock ?
                    await blockService.block(
                        body,
                        authenticated.principal.authorization,
                    )
                :   await reportService.report(
                        body,
                        authenticated.principal.authorization,
                    );
            writeJson(response, result.statusCode, result.body);
        } catch (error) {
            writeAtAuthError(response, error);
        }
    })();
    return true;
};

const handleAidPostCommandRoute = (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!aidPostCommandService) return false;
    if (!requestUrl.pathname.startsWith('/at/aid-posts')) return false;

    void (async () => {
        try {
            const authenticated = await authenticateApiRequest!(request);
            const sessionToken = authenticated.sessionToken;

            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/at/aid-posts'
            ) {
                const uri = requestUrl.searchParams.get('uri');
                if (!uri) {
                    writeJson(response, 400, {
                        error: {
                            code: 'INVALID_COMMAND',
                            message: 'uri is required.',
                        },
                    });
                    return;
                }
                const result = await aidPostCommandService.get(sessionToken, uri);
                writeJson(response, 200, result);
                return;
            }

            if (
                request.method === 'POST' &&
                requestUrl.pathname === '/at/aid-posts'
            ) {
                const result = await aidPostCommandService.create(
                    sessionToken,
                    await readJsonBody(request),
                );
                writeJson(response, 201, result);
                return;
            }

            if (
                request.method === 'PUT' &&
                requestUrl.pathname === '/at/aid-posts'
            ) {
                const result = await aidPostCommandService.update(
                    sessionToken,
                    await readJsonBody(request),
                );
                writeJson(response, 200, result);
                return;
            }

            if (
                request.method === 'POST' &&
                requestUrl.pathname === '/at/aid-posts/status/reconcile'
            ) {
                const result = await aidPostCommandService.reconcileStatus(
                    sessionToken,
                    await readJsonBody(request),
                );
                writeJson(response, 200, result);
                return;
            }

            if (
                request.method === 'POST' &&
                requestUrl.pathname === '/at/aid-posts/close'
            ) {
                const result = await aidPostCommandService.close(
                    sessionToken,
                    await readJsonBody(request),
                );
                writeJson(response, 200, result);
                return;
            }

            if (
                request.method === 'DELETE' &&
                requestUrl.pathname === '/at/aid-posts'
            ) {
                await aidPostCommandService.delete(
                    sessionToken,
                    await readJsonBody(request),
                );
                response.writeHead(204);
                response.end();
                return;
            }

            response.writeHead(405, {
                allow: 'GET, POST, PUT, DELETE',
            });
            response.end();
        } catch (error) {
            writeAidPostCommandError(response, error);
        }
    })();
    return true;
};

interface ApiRouteResult {
    statusCode: number;
    body: unknown;
    contentType?: string;
}

type ApiRouteHandler =
    | ((requestUrl: URL) => ApiRouteResult)
    | ((requestUrl: URL) => Promise<ApiRouteResult>);

const contractRoutes = [
    '/oauth/client-metadata.json',
    '/oauth/login',
    '/oauth/callback',
    '/auth/session',
    '/auth/refresh',
    '/at/aid-posts',
    '/at/aid-posts/close',
    '/at/aid-posts/status/reconcile',
    '/query/map',
    '/query/feed',
    '/query/directory',
    '/aid/post/transition',
    '/aid/post/assign',
    '/aid/post/accept',
    '/aid/post/decline',
    '/aid/post/handoff',
    '/blocks',
    '/reports',
    '/health',
    '/health/ready',
    '/metrics',
    '/contracts',
] as const;

const routeHandlers: Readonly<Record<string, ApiRouteHandler>> = {
    '/health': async () => {
        const { payload, httpStatus } = await buildHealthPayload();
        return { statusCode: httpStatus, body: payload };
    },
    '/health/ready': async () => {
        const { payload, httpStatus } = await buildReadinessPayload();
        return { statusCode: httpStatus, body: payload };
    },
    '/metrics': () => ({
        statusCode: 200,
        body: renderPrometheusMetrics(),
        contentType: 'text/plain; version=0.0.4',
    }),
    '/contracts': () => ({
        statusCode: 200,
        body: {
            contractVersion: CONTRACT_VERSION,
            routes: contractRoutes,
        },
    }),
    '/query/map': requestUrl => queryService.queryMap(requestUrl.searchParams),
    '/query/feed': requestUrl =>
        queryService.queryFeed(requestUrl.searchParams),
    '/query/directory': requestUrl =>
        queryService.queryDirectory(requestUrl.searchParams),
};

const readPaths = new Set([
    '/health',
    '/health/ready',
    '/metrics',
    '/contracts',
    '/query/map',
    '/query/feed',
    '/query/directory',
]);

const routeRouter = createMethodRouter(
    Object.entries(routeHandlers).map(([pathname, handler]) => ({
        method: readPaths.has(pathname) ? 'GET' : 'POST',
        pathname,
        handler,
    })),
);

export const createApiServer = () => {
    return createServer((request, response) => {
        ensureRequestId(response);
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');

        // --- CORS headers on every response ---
        const origin = request.headers.origin as string | undefined;
        const corsHeaders = getCorsHeaders(
            origin,
            config.NODE_ENV,
            config.API_PUBLIC_ORIGIN,
        );
        for (const [key, value] of Object.entries(corsHeaders)) {
            response.setHeader(key, value);
        }
        for (const [key, value] of Object.entries(securityHeaders(config.NODE_ENV))) {
            response.setHeader(key, value);
        }

        // --- Handle OPTIONS preflight ---
        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }

        try {
            assertCsrfProtection(request, config.API_PUBLIC_ORIGIN);
        } catch (error) {
            writePublicError(response, error);
            return;
        }

        // --- Rate limiting ---
        const clientIp = extractClientIp(
            request.headers as Record<string, string | string[] | undefined>,
            request.socket.remoteAddress,
            config.API_TRUSTED_PROXIES,
        );
        const limiter = selectLimiter(request.method, requestUrl.pathname);
        const rateResult = limiter.check(clientIp);
        if (!rateResult.allowed) {
            const retryAfterSec = Math.ceil(rateResult.retryAfterMs / 1000);
            console.log(
                JSON.stringify({
                    level: 'warn',
                    event: 'rate_limit_exceeded',
                    clientIp,
                    pathname: requestUrl.pathname,
                    retryAfterMs: rateResult.retryAfterMs,
                }),
            );
            response.writeHead(429, {
                'content-type': 'application/json',
                'retry-after': String(retryAfterSec),
            });
            response.end(
                JSON.stringify({
                    error: {
                        code: 'RATE_LIMITED',
                        message: 'Too many requests. Please try again later.',
                        retryAfterMs: rateResult.retryAfterMs,
                    },
                }),
            );
            return;
        }

        if (handleRealAuthRoute(request, response, requestUrl)) {
            return;
        }

        if (handleAidPostCommandRoute(request, response, requestUrl)) {
            return;
        }

        if (handleDurableSafetyRoute(request, response, requestUrl)) {
            return;
        }

        if (lifecycleTransitionHandler?.(request, response, requestUrl)) {
            return;
        }

        if (
            !postgresPool &&
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/transition'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.transitionFromBody(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => writeRouteError(response, error));
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/assign'
        ) {
            void readJsonBody(request)
                .then(async body => {
                    if (!postgresPool) return lifecycleService.assignRequest(body);
                    if (!authenticateApiRequest) {
                        throw new AtClientError(
                            'SESSION_EXPIRED',
                            'AT authentication is unavailable.',
                        );
                    }
                    const authenticated = await authenticateApiRequest(request);
                    return lifecycleService.assignRequest(
                        body,
                        authenticated.principal.authorization,
                    );
                })
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    if (error instanceof AtClientError) {
                        writeAtAuthError(response, error);
                        return;
                    }
                    writeRouteError(response, error);
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/accept'
        ) {
            void readJsonBody(request)
                .then(async body => {
                    if (!postgresPool) return lifecycleService.acceptAssignment(body);
                    if (!authenticateApiRequest) {
                        throw new AtClientError(
                            'SESSION_EXPIRED',
                            'AT authentication is unavailable.',
                        );
                    }
                    const authenticated = await authenticateApiRequest(request);
                    return lifecycleService.acceptAssignment(
                        body,
                        authenticated.principal.authorization,
                    );
                })
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    if (error instanceof AtClientError) {
                        writeAtAuthError(response, error);
                        return;
                    }
                    writeRouteError(response, error);
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/decline'
        ) {
            void readJsonBody(request)
                .then(async body => {
                    if (!postgresPool) return lifecycleService.declineAssignment(body);
                    if (!authenticateApiRequest) {
                        throw new AtClientError(
                            'SESSION_EXPIRED',
                            'AT authentication is unavailable.',
                        );
                    }
                    const authenticated = await authenticateApiRequest(request);
                    return lifecycleService.declineAssignment(
                        body,
                        authenticated.principal.authorization,
                    );
                })
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    if (error instanceof AtClientError) {
                        writeAtAuthError(response, error);
                        return;
                    }
                    writeRouteError(response, error);
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/handoff'
        ) {
            void readJsonBody(request)
                .then(async body => {
                    if (!postgresPool) return lifecycleService.completeHandoff(body);
                    if (!authenticateApiRequest) {
                        throw new AtClientError(
                            'SESSION_EXPIRED',
                            'AT authentication is unavailable.',
                        );
                    }
                    const authenticated = await authenticateApiRequest(request);
                    return lifecycleService.completeHandoff(
                        body,
                        authenticated.principal.authorization,
                    );
                })
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    if (error instanceof AtClientError) {
                        writeAtAuthError(response, error);
                        return;
                    }
                    writeRouteError(response, error);
                });
            return;
        }

        const route = routeRouter.resolve(request.method, requestUrl.pathname);
        if (route.kind === 'method-not-allowed') {
            writeJson(
                response,
                405,
                {
                    error: {
                        code: 'METHOD_NOT_ALLOWED',
                        message: 'The requested method is not allowed for this route.',
                    },
                },
                { allow: route.allow.join(', ') },
            );
            return;
        }
        if (route.kind === 'matched') {
            void Promise.resolve()
                .then(() => route.handler(requestUrl))
                .then(result => {
                    if (result.contentType) {
                        response.writeHead(result.statusCode, {
                            'content-type': result.contentType,
                        });
                        response.end(String(result.body));
                        return;
                    }

                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => writeRouteError(response, error));
            return;
        }

        writeJson(response, 404, {
            error: {
                code: 'UNSUPPORTED_ROUTE',
                message: `Route not found: ${requestUrl.pathname}`,
            },
        });
    });
};

export const startApiServer = () => {
    const server = createApiServer();
    server.listen(config.API_PORT, config.API_HOST, () => {
        console.log(
            `[api] listening on http://${config.API_HOST}:${config.API_PORT} (contracts=${CONTRACT_VERSION}, datasource=${config.API_DATA_SOURCE})`,
        );
    });
    return server;
};

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isExecutedDirectly) {
    const server = startApiServer();
    const shutdown = createGracefulShutdown({
        server,
        closeResources: async () => postgresPool?.end(),
    });
    process.once('SIGTERM', () => void shutdown());
    process.once('SIGINT', () => void shutdown());
}
