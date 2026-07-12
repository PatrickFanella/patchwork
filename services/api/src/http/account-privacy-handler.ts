import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountPrivacyService } from '../account-privacy-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { writeJsonResponse, writePublicError } from './error-response.js';

export interface AccountPrivacyHandlerDependencies {
    service: AccountPrivacyService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
}

export const isAccountPrivacyRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    request.method === 'GET' && requestUrl.pathname === '/account/export';

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
            } catch (error) {
                writePublicError(response, error);
            }
        })();
        return true;
    };
};
