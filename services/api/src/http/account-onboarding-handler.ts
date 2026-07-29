import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountOnboardingService } from '../account-onboarding-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import type { IdempotentResponse } from './idempotency-store.js';
import { IdempotencyError } from './idempotency-store.js';
import { readJsonBody } from './json-body.js';
import { writeJsonResponse, writePublicError } from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/account/onboarding', ['GET']],
    ['/account/consent', ['POST']],
    ['/account/preferences', ['GET', 'PUT']],
]);

export const isAccountOnboardingRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    routes.get(requestUrl.pathname)?.includes(request.method ?? '') ?? false;

interface Dependencies {
    service: AccountOnboardingService;
    authenticate: (
        request: IncomingMessage,
    ) => Promise<AuthenticatedRequest>;
    executeIdempotent: (
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (
            body: Record<string, unknown>,
            key: string,
        ) => Promise<IdempotentResponse>,
    ) => Promise<IdempotentResponse>;
}

export const createAccountOnboardingHandler = (
    dependencies: Dependencies,
) => (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!isAccountOnboardingRoute(request, requestUrl)) return false;
    void (async () => {
        try {
            const authenticated = await dependencies.authenticate(request);
            const did = authenticated.principal.did;
            response.setHeader('cache-control', 'no-store');
            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/account/onboarding'
            ) {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.statusFor(did),
                );
                return;
            }
            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/account/preferences'
            ) {
                writeJsonResponse(response, 200, {
                    preferences:
                        await dependencies.service.preferencesFor(did),
                });
                return;
            }

            const body = await readJsonBody(request);
            const result = await dependencies.executeIdempotent(
                request,
                did,
                body,
                async commandBody => {
                    if (requestUrl.pathname === '/account/consent') {
                        return {
                            statusCode: 200,
                            body: await dependencies.service.accept(did, {
                                policyVersion:
                                    commandBody['policyVersion'],
                                asserted18OrOlder:
                                    commandBody['asserted18OrOlder'],
                                acceptedDocuments:
                                    commandBody['acceptedDocuments'],
                            }),
                        };
                    }
                    return {
                        statusCode: 200,
                        body: {
                            preferences:
                                await dependencies.service.updatePreferences(
                                    did,
                                    commandBody['preferences'],
                                ),
                        },
                    };
                },
            );
            writeJsonResponse(response, result.statusCode, result.body);
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
