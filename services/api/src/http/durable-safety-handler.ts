import type { IncomingMessage, ServerResponse } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { BlockService } from '../block-service.js';
import type { ReportService } from '../report-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import {
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './error-response.js';
import {
    IdempotencyError,
    type IdempotentResponse,
} from './idempotency-store.js';
import { readJsonBody } from './json-body.js';

export interface DurableSafetyHandlerDependencies {
    blockService: BlockService;
    reportService: ReportService;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
    executeIdempotent(
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (
            commandBody: Record<string, unknown>,
        ) => Promise<IdempotentResponse>,
    ): Promise<IdempotentResponse>;
}

export const isDurableSafetyRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    request.method === 'POST' &&
    (requestUrl.pathname === '/blocks' || requestUrl.pathname === '/reports');

export const createDurableSafetyHandler = (
    dependencies: DurableSafetyHandlerDependencies,
) => {
    return (
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
    ): boolean => {
        if (!isDurableSafetyRoute(request, requestUrl)) return false;

        void (async () => {
            try {
                const authenticated = await dependencies.authenticate(request);
                const body = await readJsonBody(request);
                const result = await dependencies.executeIdempotent(
                    request,
                    authenticated.principal.did,
                    body,
                    commandBody =>
                        requestUrl.pathname === '/blocks' ?
                            dependencies.blockService.block(
                                commandBody,
                                authenticated.principal.authorization,
                            )
                        :   dependencies.reportService.report(
                                commandBody,
                                authenticated.principal.authorization,
                            ),
                );
                writeJsonResponse(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof PublicHttpError) {
                    writePublicError(response, error);
                    return;
                }
                if (error instanceof IdempotencyError) {
                    writeJsonResponse(response, 409, {
                        error: {
                            code: error.code,
                            message: 'Idempotency key reused for another command.',
                        },
                    });
                    return;
                }
                if (error instanceof AtClientError) {
                    writeJsonResponse(
                        response,
                        error.code === 'SESSION_EXPIRED' ? 401 : 403,
                        { error: { code: error.code, message: error.message } },
                    );
                    return;
                }
                writePublicError(response, error);
            }
        })();
        return true;
    };
};
