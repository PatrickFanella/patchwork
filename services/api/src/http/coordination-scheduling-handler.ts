import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CoordinationSchedulingService } from '../coordination-scheduling-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import type { IdempotentResponse } from './idempotency-store.js';
import { IdempotencyError } from './idempotency-store.js';
import { readJsonBody } from './json-body.js';
import { writeJsonResponse, writePublicError } from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/coordination/windows', ['GET', 'POST']],
    ['/coordination/window-decisions', ['POST']],
]);

export const isCoordinationSchedulingRoute = (request: IncomingMessage, url: URL): boolean =>
    routes.get(url.pathname)?.includes(request.method ?? '') ?? false;

interface Dependencies {
    service: CoordinationSchedulingService;
    authenticate: (request: IncomingMessage) => Promise<AuthenticatedRequest>;
    executeIdempotent: (request: IncomingMessage, actorDid: string, body: unknown,
        effect: (body: Record<string, unknown>, key: string) => Promise<IdempotentResponse>) => Promise<IdempotentResponse>;
}

export const createCoordinationSchedulingHandler = (dependencies: Dependencies) =>
    (request: IncomingMessage, response: ServerResponse, url: URL): boolean => {
        if (!isCoordinationSchedulingRoute(request, url)) return false;
        void (async () => {
            try {
                response.setHeader('cache-control', 'no-store');
                const actorDid = (await dependencies.authenticate(request)).principal.did;
                if (request.method === 'GET') {
                    writeJsonResponse(response, 200, await dependencies.service.list(actorDid));
                    return;
                }
                const body = await readJsonBody(request);
                const result = await dependencies.executeIdempotent(request, actorDid, body, async commandBody => ({
                    statusCode: url.pathname === '/coordination/windows' ? 201 : 200,
                    body: url.pathname === '/coordination/windows' ?
                        await dependencies.service.propose(actorDid, commandBody) :
                        await dependencies.service.decide(actorDid, commandBody),
                }));
                writeJsonResponse(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof IdempotencyError) {
                    writeJsonResponse(response, 409, { error: { code: error.code, message: 'The idempotency key was already used for another command.' } });
                    return;
                }
                writePublicError(response, error);
            }
        })();
        return true;
    };
