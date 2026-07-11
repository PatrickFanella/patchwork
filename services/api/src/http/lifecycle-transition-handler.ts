import type { IncomingMessage, ServerResponse } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { LifecycleService } from '../lifecycle-service.js';
import { PublicHttpError, writeJsonResponse, writePublicError } from './error-response.js';
import { readJsonBody } from './json-body.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export interface LifecycleTransitionHandlerDependencies {
    service: LifecycleService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
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
        if (
            request.method !== 'POST' ||
            requestUrl.pathname !== '/aid/post/transition'
        ) {
            return false;
        }

        void (async () => {
            try {
                const authenticated = await dependencies.authenticate(request);
                const result = await dependencies.service.transitionFromBody(
                    await readJsonBody(request),
                    authenticated.principal.authorization,
                );
                writeJson(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof PublicHttpError) {
                    writePublicError(response, error);
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
