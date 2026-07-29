import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import {
    AuthorizationError,
    requireCapability,
} from '../authorization-guard.js';
import type { MaintenanceModeService } from '../maintenance-mode-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { readJsonBody } from './json-body.js';
import type { IdempotentResponse } from './idempotency-store.js';
import {
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/status', ['GET']],
    ['/maintenance', ['GET']],
    ['/maintenance/declare', ['POST']],
    ['/maintenance/resume', ['POST']],
]);

export const isMaintenanceRoute = (
    request: IncomingMessage,
    url: URL,
): boolean => routes.get(url.pathname)?.includes(request.method ?? '') ?? false;

export const createMaintenanceHandler = (dependencies: {
    service: MaintenanceModeService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
    executeIdempotent(
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (
            body: Record<string, unknown>,
            key: string,
        ) => Promise<IdempotentResponse>,
    ): Promise<IdempotentResponse>;
}) => (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
): boolean => {
    if (!isMaintenanceRoute(request, url)) return false;
    void (async () => {
        try {
            response.setHeader('cache-control', 'no-store');
            if (url.pathname === '/status') {
                writeJsonResponse(response, 200, {
                    maintenance: dependencies.service.status(),
                });
                return;
            }
            const authenticated = await dependencies.authenticate(request);
            requireCapability(
                authenticated.principal.authorization,
                'maintenance_mode:manage',
            );
            if (request.method === 'GET') {
                writeJsonResponse(response, 200, {
                    maintenance: dependencies.service.status(),
                });
                return;
            }
            const body = await readJsonBody(request);
            const result = await dependencies.executeIdempotent(
                request,
                authenticated.principal.did,
                body,
                async (command, key) => ({
                    statusCode: 200,
                    body: {
                        maintenance:
                            url.pathname === '/maintenance/declare' ?
                                await dependencies.service.declare(
                                    authenticated.principal.did,
                                    command,
                                    key,
                                )
                            :   await dependencies.service.resume(
                                    authenticated.principal.did,
                                    key,
                                ),
                    },
                }),
            );
            writeJsonResponse(response, result.statusCode, result.body);
        } catch (error) {
            if (error instanceof ZodError) {
                writePublicError(
                    response,
                    new PublicHttpError(
                        400,
                        'MAINTENANCE_COMMAND_INVALID',
                        'The maintenance command is invalid.',
                    ),
                );
                return;
            }
            if (error instanceof AuthorizationError) {
                writePublicError(
                    response,
                    new PublicHttpError(
                        error.statusCode,
                        error.code,
                        'Insufficient capability.',
                    ),
                );
                return;
            }
            if (
                error instanceof Error &&
                error.message === 'MAINTENANCE_ENVIRONMENT_OVERRIDE_ACTIVE'
            ) {
                writePublicError(
                    response,
                    new PublicHttpError(
                        409,
                        error.message,
                        'The environment maintenance override must be cleared before resuming.',
                    ),
                );
                return;
            }
            writePublicError(response, error);
        }
    })();
    return true;
};

const blockedSubmissionRoutes = new Set([
    '/at/aid-posts',
    '/at/directory-resources',
    '/at/volunteer-profile',
    '/organizations',
    '/verification/applications',
    '/verification/appeals',
    '/verification/exact-address/requests',
    '/attachments/uploads',
    '/coordination/offers',
]);

export const isBlockedByMaintenance = (
    request: IncomingMessage,
    url: URL,
): boolean =>
    (request.method === 'POST' || request.method === 'PUT') &&
    blockedSubmissionRoutes.has(url.pathname);
