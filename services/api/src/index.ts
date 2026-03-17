import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CONTRACT_VERSION,
    loadApiConfig,
    validateProductionConfig,
    checkServiceHealth,
    type ServiceHealth,
    type HealthCheck,
    SliCollector,
} from '@patchwork/shared';
import { createAidPostService } from './aid-post-service.js';
import { createFixtureChatService } from './chat-service.js';
import { createPostgresPool } from './db/discovery-events.js';
import {
    createFixtureQueryService,
    createPostgresQueryService,
} from './query-service.js';
import { createFixtureVerificationService } from './verification-service.js';
import { createFixtureSettingsService } from './settings-service.js';
import { createFixtureAuthService } from './auth-service.js';
import { createFixtureVolunteerService } from './volunteer-service.js';
import { createLifecycleService } from './lifecycle-service.js';
import { createAttachmentService } from './aid-post-service.js';
import { createOrgPortalService } from './org-portal-service.js';
import { createInboxService } from './inbox-service.js';
import { createFeedbackService } from './feedback-service.js';
import { createReputationService } from './reputation-service.js';
import { getCorsHeaders } from './cors.js';
import { selectLimiter, extractClientIp } from './rate-limiter.js';

const config = loadApiConfig();

// Production startup guard — fail fast if misconfigured
validateProductionConfig(config);

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

const chatService = createFixtureChatService();
const verificationService = createFixtureVerificationService();
const settingsService = createFixtureSettingsService();
const volunteerService = createFixtureVolunteerService();
const lifecycleService = createLifecycleService();
const attachmentService = createAttachmentService();
const authService = createFixtureAuthService();
const orgPortalService = createOrgPortalService();
const inboxService = createInboxService();
const feedbackService = createFeedbackService();
const reputationService = createReputationService();

const databaseUrl = config.API_DATABASE_URL ?? config.DATABASE_URL;
const postgresPool =
    config.API_DATA_SOURCE === 'postgres' && databaseUrl
        ? createPostgresPool(databaseUrl)
        : undefined;

const aidPostService = createAidPostService(queryService, {
    dataSource: config.API_DATA_SOURCE,
    databaseUrl,
    pool: postgresPool,
});

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
    response.writeHead(statusCode, {
        'content-type': 'application/json',
        ...extraHeaders,
    });
    response.end(JSON.stringify(body));
};

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

const readJsonBody = (request: IncomingMessage): Promise<unknown> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        request.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > MAX_BODY_SIZE) {
                request.destroy();
                reject(new Error('Request body too large'));
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        request.on('error', reject);
    });
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
    '/query/map',
    '/query/feed',
    '/query/directory',
    '/aid/post/create',
    '/chat/initiate',
    '/chat/route',
    '/chat/conversations',
    '/chat/safety/evaluate',
    '/chat/safety/block',
    '/chat/safety/mute',
    '/chat/safety/report',
    '/chat/safety/signals/drain',
    '/chat/safety/metrics',
    '/chat/message/send',
    '/chat/message/status',
    '/chat/message/retry',
    '/chat/messages',
    '/chat/route/preference-aware',
    '/volunteer/profile/upsert',
    '/volunteer/profiles',
    '/verification/status',
    '/verification/grant',
    '/verification/revoke',
    '/verification/renew',
    '/verification/appeal',
    '/verification/audit',
    '/account/settings',
    '/account/settings/audit',
    '/account/deactivate',
    '/account/export',
    '/aid/post/transition',
    '/aid/post/lifecycle',
    '/aid/post/assign',
    '/aid/post/accept',
    '/aid/post/decline',
    '/aid/post/handoff',
    '/aid/post/timeout-check',
    '/aid/post/attachments',
    '/aid/post/attachments/add',
    '/auth/session',
    '/auth/refresh',
    '/org/profile',
    '/org/create',
    '/org/member/invite',
    '/org/member/remove',
    '/org/member/role',
    '/org/members',
    '/org/service/upsert',
    '/org/service/status',
    '/org/services',
    '/org/audit',
    '/org/metrics',
    '/inbox',
    '/inbox/read',
    '/inbox/read-all',
    '/inbox/counts',
    '/feedback',
    '/feedback/request',
    '/feedback/user',
    '/feedback/summary',
    '/reputation',
    '/reputation/signals',
    '/health',
    '/health/ready',
    '/metrics',
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
    '/chat/initiate': requestUrl =>
        chatService.initiateFromParams(requestUrl.searchParams),
    '/chat/route': requestUrl =>
        chatService.routeScenarioFromParams(requestUrl.searchParams),
    '/chat/conversations': requestUrl =>
        chatService.listConversationsFromParams(requestUrl.searchParams),
    '/chat/safety/evaluate': requestUrl =>
        chatService.evaluateSafetyFromParams(requestUrl.searchParams),
    '/chat/safety/block': requestUrl =>
        chatService.blockFromParams(requestUrl.searchParams),
    '/chat/safety/mute': requestUrl =>
        chatService.muteFromParams(requestUrl.searchParams),
    '/chat/safety/report': requestUrl =>
        chatService.reportFromParams(requestUrl.searchParams),
    '/chat/message/send': requestUrl =>
        chatService.sendMessageFromParams(requestUrl.searchParams),
    '/chat/message/status': requestUrl =>
        chatService.updateMessageStatusFromParams(requestUrl.searchParams),
    '/chat/message/retry': requestUrl =>
        chatService.retryMessageFromParams(requestUrl.searchParams),
    '/chat/messages': requestUrl =>
        chatService.getConversationHistoryFromParams(requestUrl.searchParams),
    '/chat/safety/signals/drain': () => chatService.drainModerationSignals(),
    '/chat/safety/metrics': () => chatService.safetyMetrics(),
    '/chat/route/preference-aware': requestUrl =>
        volunteerService.routePreferenceAwareFromParams(
            requestUrl.searchParams,
        ),
    '/volunteer/profile/upsert': requestUrl =>
        volunteerService.upsertFromParams(requestUrl.searchParams),
    '/volunteer/profiles': () => volunteerService.listFromParams(),
    '/verification/status': requestUrl =>
        verificationService.getStatus(requestUrl.searchParams),
    '/verification/grant': requestUrl =>
        verificationService.grant(requestUrl.searchParams),
    '/verification/revoke': requestUrl =>
        verificationService.revoke(requestUrl.searchParams),
    '/verification/renew': requestUrl =>
        verificationService.renew(requestUrl.searchParams),
    '/verification/appeal': requestUrl =>
        verificationService.appeal(requestUrl.searchParams),
    '/verification/audit': requestUrl =>
        verificationService.getAuditTrail(requestUrl.searchParams),
    '/account/settings': requestUrl =>
        settingsService.getSettings(requestUrl.searchParams),
    '/aid/post/create': requestUrl =>
        aidPostService.createFromParams(requestUrl.searchParams),
    '/aid/post/transition': requestUrl =>
        lifecycleService.transitionFromParams(requestUrl.searchParams),
    '/aid/post/lifecycle': requestUrl =>
        lifecycleService.queryFromParams(requestUrl.searchParams),
    '/auth/session': requestUrl =>
        authService.validateSessionFromParams(requestUrl.searchParams),
    '/auth/refresh': requestUrl =>
        authService.refreshSessionFromParams(requestUrl.searchParams),
    '/org/profile': requestUrl =>
        orgPortalService.getOrg(requestUrl.searchParams),
    '/org/create': requestUrl =>
        orgPortalService.createOrg(requestUrl.searchParams),
    '/org/member/invite': requestUrl =>
        orgPortalService.inviteMember(requestUrl.searchParams),
    '/org/member/remove': requestUrl =>
        orgPortalService.removeMember(requestUrl.searchParams),
    '/org/member/role': requestUrl =>
        orgPortalService.updateMemberRole(requestUrl.searchParams),
    '/org/members': requestUrl =>
        orgPortalService.listMembers(requestUrl.searchParams),
    '/org/service/upsert': requestUrl =>
        orgPortalService.upsertServiceListing(requestUrl.searchParams),
    '/org/service/status': requestUrl =>
        orgPortalService.updateServiceStatus(requestUrl.searchParams),
    '/org/services': requestUrl =>
        orgPortalService.listServices(requestUrl.searchParams),
    '/org/audit': requestUrl =>
        orgPortalService.getAuditTrail(requestUrl.searchParams),
    '/org/metrics': requestUrl =>
        orgPortalService.getPerformanceMetrics(requestUrl.searchParams),
    '/inbox': requestUrl =>
        inboxService.getInboxFromParams(requestUrl.searchParams),
    '/inbox/counts': requestUrl =>
        inboxService.getCountsFromParams(requestUrl.searchParams),
    '/feedback/request': requestUrl =>
        feedbackService.getFeedbackForRequestFromParams(requestUrl.searchParams),
    '/feedback/user': requestUrl =>
        feedbackService.getFeedbackByUserFromParams(requestUrl.searchParams),
    '/feedback/summary': requestUrl =>
        feedbackService.getSummaryFromParams(requestUrl.searchParams),
    '/reputation': requestUrl =>
        reputationService.getReputationFromParams(requestUrl.searchParams),
    '/reputation/signals': requestUrl =>
        reputationService.getSignalsFromParams(requestUrl.searchParams),
    '/aid/post/timeout-check': requestUrl => {
        const postUri = requestUrl.searchParams.get('postUri');
        if (!postUri) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_INPUT', message: 'postUri is required.' } },
            };
        }
        return lifecycleService.checkAssignmentTimeout(
            postUri,
            requestUrl.searchParams.get('now') ?? undefined,
        );
    },
    '/aid/post/attachments': requestUrl =>
        attachmentService.getAttachmentsFromParams(requestUrl.searchParams),
};

export const createApiServer = () => {
    return createServer((request, response) => {
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

        // --- Handle OPTIONS preflight ---
        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }

        // --- Rate limiting ---
        const clientIp = extractClientIp(
            request.headers as Record<string, string | string[] | undefined>,
            request.socket.remoteAddress,
        );
        const limiter = selectLimiter(requestUrl.pathname);
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

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/auth/session'
        ) {
            void Promise.resolve()
                .then(() =>
                    authService.createSessionFromParams(
                        requestUrl.searchParams,
                    ),
                )
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'DELETE' &&
            requestUrl.pathname === '/auth/session'
        ) {
            const result = authService.deleteSessionFromParams(
                requestUrl.searchParams,
            );
            writeJson(response, result.statusCode, result.body);
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/create'
        ) {
            void readJsonBody(request)
                .then(body => aidPostService.createFromBody(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'PUT' &&
            requestUrl.pathname === '/account/settings'
        ) {
            void readJsonBody(request)
                .then(body => settingsService.updateSettings(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/account/settings/audit'
        ) {
            void readJsonBody(request)
                .then(body => settingsService.getAuditTrail(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/account/deactivate'
        ) {
            void readJsonBody(request)
                .then(body => settingsService.deactivateAccount(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/account/export'
        ) {
            void readJsonBody(request)
                .then(body => settingsService.exportAccountData(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/transition'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.transitionFromBody(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/assign'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.assignRequest(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/accept'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.acceptAssignment(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/decline'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.declineAssignment(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/handoff'
        ) {
            void readJsonBody(request)
                .then(body => lifecycleService.completeHandoff(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/attachments/add'
        ) {
            void readJsonBody(request)
                .then(body => attachmentService.addAttachment(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/inbox/read'
        ) {
            void readJsonBody(request)
                .then(body => inboxService.markReadFromParams(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/inbox/read-all'
        ) {
            void readJsonBody(request)
                .then(body => inboxService.markAllReadFromParams(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        if (
            request.method === 'POST' &&
            requestUrl.pathname === '/feedback'
        ) {
            void readJsonBody(request)
                .then(body => feedbackService.submitFeedback(body))
                .then(result => {
                    writeJson(response, result.statusCode, result.body);
                })
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
            return;
        }

        const handler = routeHandlers[requestUrl.pathname];
        if (handler) {
            void Promise.resolve()
                .then(() => handler(requestUrl))
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
                .catch(error => {
                    writeJson(response, 500, {
                        error: {
                            code: 'UNHANDLED_ROUTE_ERROR',
                            message:
                                error instanceof Error ?
                                    error.message
                                :   'Unhandled route error.',
                        },
                    });
                });
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
    process.on('SIGTERM', () => {
        server.close(() => {
            void postgresPool?.end();
        });
    });
}
