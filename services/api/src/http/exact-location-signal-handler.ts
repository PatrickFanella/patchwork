import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ExactLocationSignalService } from '../exact-location-signal-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { readJsonBody } from './json-body.js';
import { writeJsonResponse, writePublicError } from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/location/session', ['GET']],
    ['/location/consent', ['POST']],
    ['/location/signal', ['POST']],
    ['/location/revoke', ['POST']],
]);

export const isExactLocationSignalRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    routes.get(requestUrl.pathname)?.includes(request.method ?? '') ?? false;

export const createExactLocationSignalHandler =
    (dependencies: {
        service: ExactLocationSignalService;
        authenticate: (
            request: IncomingMessage,
        ) => Promise<AuthenticatedRequest>;
    }) =>
    (
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
    ): boolean => {
        if (!isExactLocationSignalRoute(request, requestUrl)) return false;
        void (async () => {
            try {
                response.setHeader('cache-control', 'no-store');
                const authenticated = await dependencies.authenticate(request);
                const actorDid = authenticated.principal.did;
                if (request.method === 'GET') {
                    const connectionId =
                        requestUrl.searchParams.get('connectionId') ?? '';
                    const after = Number(
                        requestUrl.searchParams.get('after') ?? '0',
                    );
                    const result = await dependencies.service.state(
                        actorDid,
                        connectionId,
                        after,
                    );
                    writeJsonResponse(response, 200, result);
                    return;
                }
                const body = await readJsonBody(request);
                const result =
                    requestUrl.pathname === '/location/consent' ?
                        await dependencies.service.consent(actorDid, body)
                    : requestUrl.pathname === '/location/signal' ?
                        await dependencies.service.signal(actorDid, body)
                    :   await dependencies.service.revoke(actorDid, body);
                writeJsonResponse(response, 200, result);
            } catch (error) {
                writePublicError(response, error);
            }
        })();
        return true;
    };
