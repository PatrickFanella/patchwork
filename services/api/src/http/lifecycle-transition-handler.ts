import type { IncomingMessage, ServerResponse } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { PlatformRole } from '@patchwork/shared';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { LifecycleService } from '../lifecycle-service.js';
import { PublicHttpError, writeJsonResponse, writePublicError } from './error-response.js';
import { readJsonBody } from './json-body.js';

export interface LifecycleSessionPrincipal {
    did: string;
    role: PlatformRole;
}

export interface LifecycleTransitionHandlerDependencies {
    service: LifecycleService;
    resolveSession(token: string): Promise<LifecycleSessionPrincipal>;
}

const readSessionCookie = (request: IncomingMessage): string | undefined => {
    for (const cookie of request.headers.cookie?.split(';') ?? []) {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name === 'patchwork_session') {
            return decodeURIComponent(valueParts.join('='));
        }
    }
    return undefined;
};

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
                const sessionToken = readSessionCookie(request);
                if (!sessionToken) {
                    throw new AtClientError(
                        'SESSION_EXPIRED',
                        'The Patchwork browser session is missing.',
                    );
                }
                const principal = await dependencies.resolveSession(sessionToken);
                const result = await dependencies.service.transitionFromBody(
                    await readJsonBody(request),
                    createAuthorizationContext(principal.did, principal.role),
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
