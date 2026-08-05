import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { DurableChatService } from '../durable-chat-service.js';
import { createChatHandler } from './chat-handler.js';

describe('chat HTTP identity and idempotency boundary', () => {
    let origin: string;
    const actorDid = 'did:plc:chat-session';
    const listConversations = vi.fn();
    const listMessages = vi.fn();
    const send = vi.fn();
    const service = { listConversations, listMessages, send } as unknown as DurableChatService;
    const executeIdempotent = vi.fn(async (_request, _actorDid, body, effect) =>
        effect(body as Record<string, unknown>, 'server-key'));
    const handler = createChatHandler({
        service,
        authenticate: async () => ({
            sessionToken: 'opaque', session: { did: actorDid },
            principal: { did: actorDid, role: 'user',
                authorization: createAuthorizationContext(actorDid, 'user') },
        }),
        executeIdempotent,
    });
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (!handler(request, response, new URL(request.url ?? '/', 'http://localhost')))
                response.writeHead(404).end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('server did not bind');
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => error ? reject(error) : resolve()));
    });

    it('takes list authority from the session and query parameters only as resource selectors', async () => {
        listConversations.mockResolvedValueOnce({ conversations: [] });
        expect((await fetch(`${origin}/chat/conversations?actorDid=did:plc:hostile`)).status).toBe(200);
        expect(listConversations).toHaveBeenCalledWith(actorDid);

        listMessages.mockResolvedValueOnce({ messages: [], nextCursor: null });
        const conversationId = '11111111-1111-4111-8111-111111111111';
        expect((await fetch(`${origin}/chat/messages?conversationId=${conversationId}&actorDid=did:plc:hostile`)).status).toBe(200);
        expect(listMessages).toHaveBeenCalledWith(actorDid, { conversationId });
    });

    it('keeps message bodies on the authenticated idempotent mutation path', async () => {
        const body = { conversationId: '11111111-1111-4111-8111-111111111111',
            clientMessageId: '21111111-1111-4111-8111-111111111111',
            body: 'Private coordination text.', actorDid: 'did:plc:hostile' };
        send.mockResolvedValueOnce({ message: { id: 'message' }, created: true });
        const response = await fetch(`${origin}/chat/messages`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(response.status).toBe(201);
        expect(send).toHaveBeenCalledWith(actorDid, body);
        expect(executeIdempotent).toHaveBeenCalledWith(
            expect.anything(), actorDid, body, expect.any(Function));
    });
});
