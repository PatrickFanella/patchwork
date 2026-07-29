import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VerificationCaseService } from '../verification-case-service.js';
import {
    AuthorizationError,
    requireCapability,
} from '../authorization-guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import type { IdempotentResponse } from './idempotency-store.js';
import { IdempotencyError } from './idempotency-store.js';
import { readJsonBody } from './json-body.js';
import { writeJsonResponse, writePublicError } from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/verification/mine', ['GET']],
    ['/verification/applications', ['POST']],
    ['/verification/appeals', ['POST']],
    ['/verification/review', ['GET']],
    ['/verification/decisions', ['POST']],
    ['/verification/appeal-decisions', ['POST']],
    ['/verification/exact-address/requests', ['POST']],
    ['/verification/exact-address/review', ['GET']],
    ['/verification/exact-address/decisions', ['POST']],
]);

export const isVerificationRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    routes.get(requestUrl.pathname)?.includes(request.method ?? '') ?? false;

interface Dependencies {
    service: VerificationCaseService;
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

export const createVerificationHandler = (
    dependencies: Dependencies,
) => (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!isVerificationRoute(request, requestUrl)) return false;
    void (async () => {
        try {
            response.setHeader('cache-control', 'no-store');
            const authenticated =
                await dependencies.authenticate(request);
            const actorDid = authenticated.principal.did;
            if (request.method === 'GET') {
                const body =
                    requestUrl.pathname === '/verification/mine' ?
                        await dependencies.service.listMine(actorDid)
                    : requestUrl.pathname === '/verification/review' ?
                        (() => {
                            requireCapability(
                                authenticated.principal.authorization,
                                'verification:review',
                            );
                            return dependencies.service.listReviewQueue();
                        })()
                    :   (() => {
                            requireCapability(
                                authenticated.principal.authorization,
                                'exact_public_address:approve',
                            );
                            return dependencies.service.listExactAddressQueue();
                        })();
                writeJsonResponse(response, 200, await body);
                return;
            }

            const body = await readJsonBody(request);
            const result = await dependencies.executeIdempotent(
                request,
                actorDid,
                body,
                async commandBody => {
                    let output: Record<string, unknown>;
                    let statusCode = 200;
                    if (
                        requestUrl.pathname ===
                        '/verification/applications'
                    ) {
                        output =
                            await dependencies.service.submitApplication(
                                actorDid,
                                commandBody,
                            );
                        statusCode = 201;
                    } else if (
                        requestUrl.pathname === '/verification/appeals'
                    ) {
                        output = await dependencies.service.submitAppeal(
                            actorDid,
                            commandBody,
                        );
                        statusCode = 201;
                    } else if (
                        requestUrl.pathname === '/verification/decisions'
                    ) {
                        requireCapability(
                            authenticated.principal.authorization,
                            'verification:review',
                        );
                        output = await dependencies.service.decide(
                            actorDid,
                            commandBody,
                        );
                    } else if (
                        requestUrl.pathname ===
                        '/verification/appeal-decisions'
                    ) {
                        requireCapability(
                            authenticated.principal.authorization,
                            'verification:review',
                        );
                        output = await dependencies.service.decideAppeal(
                            actorDid,
                            commandBody,
                        );
                    } else if (
                        requestUrl.pathname ===
                        '/verification/exact-address/requests'
                    ) {
                        output =
                            await dependencies.service.requestExactAddress(
                                actorDid,
                                commandBody,
                            );
                        statusCode = 201;
                    } else {
                        requireCapability(
                            authenticated.principal.authorization,
                            'exact_public_address:approve',
                        );
                        output =
                            await dependencies.service.decideExactAddress(
                                actorDid,
                                commandBody,
                            );
                    }
                    return { statusCode, body: output };
                },
            );
            writeJsonResponse(response, result.statusCode, result.body);
        } catch (error) {
            if (error instanceof AuthorizationError) {
                writeJsonResponse(response, error.statusCode, {
                    error: {
                        code: error.code,
                        message: 'The required review capability is missing.',
                    },
                });
                return;
            }
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
