import type { IncomingMessage, ServerResponse } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { LifecycleService } from '../lifecycle-service.js';
import { PublicHttpError, writeJsonResponse, writePublicError } from './error-response.js';
import { readJsonBody } from './json-body.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import {
    IdempotencyError,
    type IdempotentResponse,
} from './idempotency-store.js';

export interface LifecycleTransitionHandlerDependencies {
    service: LifecycleService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
    executeIdempotent(
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (commandBody: Record<string, unknown>) => Promise<IdempotentResponse>,
    ): Promise<IdempotentResponse>;
}

const writeJson = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
): void => {
    writeJsonResponse(response, statusCode, body);
};

export const createLifecycleTransitionHandler = (
    dependencies: LifecycleTransitionHandlerDependencies,
) => {
    return (
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
    ): boolean => {
        const isTransition =
            request.method === 'POST' &&
            requestUrl.pathname === '/aid/post/transition';
        const isQuery =
            request.method === 'GET' &&
            requestUrl.pathname === '/aid/post/lifecycle';
        if (!isTransition && !isQuery) {
            return false;
        }

        void (async () => {
            try {
                const authenticated = await dependencies.authenticate(request);
                if (isQuery) {
                    const result = await dependencies.service.queryForActor(
                        requestUrl.searchParams.get('postUri'),
                        authenticated.principal.authorization,
                    );
                    writeJson(response, result.statusCode, result.body);
                    return;
                }
                const body = await readJsonBody(request);
                const result = await dependencies.executeIdempotent(
                    request,
                    authenticated.principal.did,
                    body,
                    commandBody =>
                        dependencies.service.transitionFromBody(
                            commandBody,
                            authenticated.principal.authorization,
                        ),
                );
                writeJson(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof PublicHttpError) {
                    writePublicError(response, error);
                    return;
                }
                if (error instanceof IdempotencyError) {
                    writeJson(response, 409, {
                        error: {
                            code: error.code,
                            message: 'Idempotency key reused for another command.',
                        },
                    });
                    return;
                }
                if (error instanceof AtClientError) {
                    writeJson(response, error.code === 'SESSION_EXPIRED' ? 401 : 403, {
                        error: { code: error.code, message: error.message },
                    });
                    return;
                }
                writePublicError(response, error);
            }
        })();
        return true;
    };
};
