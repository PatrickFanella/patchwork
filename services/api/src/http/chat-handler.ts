import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DurableChatService } from '../durable-chat-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { writeJsonResponse, writePublicError } from './error-response.js';
import type { IdempotentResponse } from './idempotency-store.js';
import { IdempotencyError } from './idempotency-store.js';
import { readJsonBody } from './json-body.js';

const routes = new Map<string, readonly string[]>([
    ['/chat/conversations', ['GET', 'POST']],
    ['/chat/messages', ['GET', 'POST']],
    ['/chat/read', ['POST']],
    ['/chat/messages/redactions', ['POST']],
    ['/chat/reports', ['POST']],
]);

export const isChatRoute = (request: IncomingMessage, url: URL): boolean =>
    routes.get(url.pathname)?.includes(request.method ?? '') ?? false;

interface Dependencies {
    service: DurableChatService;
    authenticate: (request: IncomingMessage) => Promise<AuthenticatedRequest>;
    executeIdempotent: (
        request: IncomingMessage,
        actorDid: string,
        body: unknown,
        effect: (body: Record<string, unknown>, key: string) => Promise<IdempotentResponse>,
    ) => Promise<IdempotentResponse>;
}

export const createChatHandler = (dependencies: Dependencies) =>
    (request: IncomingMessage, response: ServerResponse, url: URL): boolean => {
        if (!isChatRoute(request, url)) return false;
        void (async () => {
            try {
                response.setHeader('cache-control', 'no-store');
                const actorDid = (await dependencies.authenticate(request)).principal.did;
                if (request.method === 'GET') {
                    if (url.pathname === '/chat/conversations') {
                        writeJsonResponse(response, 200,
                            await dependencies.service.listConversations(actorDid));
                    } else {
                        const before = url.searchParams.get('before');
                        const limit = url.searchParams.get('limit');
                        writeJsonResponse(response, 200,
                            await dependencies.service.listMessages(actorDid, {
                                conversationId: url.searchParams.get('conversationId') ?? '',
                                ...(before ? { before: Number(before) } : {}),
                                ...(limit ? { limit: Number(limit) } : {}),
                            }));
                    }
                    return;
                }
                const body = await readJsonBody(request);
                const result = await dependencies.executeIdempotent(
                    request, actorDid, body, async (commandBody) => {
                        const operation = url.pathname === '/chat/conversations' ?
                            dependencies.service.createConversation(actorDid, commandBody) :
                            url.pathname === '/chat/messages' ?
                                dependencies.service.send(actorDid, commandBody) :
                                url.pathname === '/chat/read' ?
                                    dependencies.service.markRead(actorDid, commandBody) :
                                    url.pathname === '/chat/messages/redactions' ?
                                        dependencies.service.redact(actorDid, commandBody) :
                                        dependencies.service.report(actorDid, commandBody);
                        return {
                            statusCode: url.pathname === '/chat/conversations' ||
                                url.pathname === '/chat/messages' ||
                                url.pathname === '/chat/reports' ? 201 : 200,
                            body: await operation,
                        };
                    },
                );
                writeJsonResponse(response, result.statusCode, result.body);
            } catch (error) {
                if (error instanceof IdempotencyError) {
                    writeJsonResponse(response, 409, {
                        error: { code: error.code,
                            message: 'The idempotency key was already used for another command.' },
                    });
                    return;
                }
                writePublicError(response, error);
            }
        })();
        return true;
    };
