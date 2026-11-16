import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountPrivacyService } from '../account-privacy-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { PublicHttpError, writeJsonResponse, writePublicError } from './error-response.js';
import {
    IdempotencyError,
    type IdempotentResponse,
} from './idempotency-store.js';
import { readJsonBody } from './json-body.js';

export interface AccountPrivacyHandlerDependencies {
    service: AccountPrivacyService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
    clearSessionCookies(response: ServerResponse): void;
    executeIdempotent(
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (
            commandBody: Record<string, unknown>,
        ) => Promise<IdempotentResponse>,
    ): Promise<IdempotentResponse>;
}

export const isAccountPrivacyRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    (request.method === 'GET' && requestUrl.pathname === '/account/export') ||
    (request.method === 'POST' && ['/account/deactivate', '/account/delete'].includes(requestUrl.pathname));

export const createAccountPrivacyHandler = (
    dependencies: AccountPrivacyHandlerDependencies,
) => {
    return (
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
    ): boolean => {
        if (!isAccountPrivacyRoute(request, requestUrl)) return false;
        void (async () => {
            try {
                const authenticated = await dependencies.authenticate(request);
                if (requestUrl.pathname === '/account/export') {
                    response.setHeader('cache-control', 'no-store');
                    response.setHeader(
                        'content-disposition',
                        'attachment; filename="patchwork-account-export.json"',
                    );
                    writeJsonResponse(
                        response,
                        200,
                        await dependencies.service.exportFor(
                            authenticated.principal.did,
                        ),
                    );
                    return;
                }
                const body = await readJsonBody(request);
                if (requestUrl.pathname === '/account/delete') {
                    const at = Date.parse(authenticated.session.authenticatedAt ?? '');
                    if (!Number.isFinite(at) || at > Date.now() || Date.now() - at > 5 * 60_000) {
                        throw new PublicHttpError(401, 'ACCOUNT_DELETION_STEP_UP_REQUIRED',
                            'Sign in again before deleting your Patchwork account.');
                    }
                    if (!body || typeof body !== 'object' || !('confirmDeletion' in body) || body.confirmDeletion !== true) {
                        throw new PublicHttpError(400, 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED',
                            'Confirm deletion of your Patchwork account.');
                    }
                }
                const result = await dependencies.executeIdempotent(
                    request,
                    authenticated.principal.did,
                    body,
                    async commandBody => ({
                        statusCode: 200,
                        body: await dependencies.service.deactivate(
                            authenticated.principal.did,
                            String(commandBody['commandId']),
                        ),
                    }),
                );
                dependencies.clearSessionCookies(response);
                writeJsonResponse(response, result.statusCode, result.body, {
                    'cache-control': 'no-store',
                });
            } catch (error) {
                if (error instanceof IdempotencyError) {
                    writeJsonResponse(response, 409, {
                        error: {
                            code: error.code,
                            message:
                                'The idempotency key was already used for another command.',
                        },
                    });
                    return;
                }
                writePublicError(response, error);
            }
        })();
        return true;
    };
};
