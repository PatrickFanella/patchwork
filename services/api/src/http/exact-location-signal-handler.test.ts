import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { ExactLocationSignalService } from '../exact-location-signal-service.js';
import { createExactLocationSignalHandler } from './exact-location-signal-handler.js';

describe('exact-location signal HTTP identity boundary', () => {
    let origin: string;
    const state = vi.fn();
    const consent = vi.fn();
    const service = {
        state,
        consent,
    } as unknown as ExactLocationSignalService;
    const actorDid = 'did:plc:location-session';
    const handler = createExactLocationSignalHandler({
        service,
        authenticate: async () => ({
            sessionToken: 'opaque',
            session: { did: actorDid },
            principal: {
                did: actorDid,
                role: 'user',
                authorization: createAuthorizationContext(actorDid, 'user'),
            },
        }),
    });
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (
                !handler(
                    request,
                    response,
                    new URL(request.url ?? '/', 'http://localhost'),
                )
            ) {
                response.writeHead(404).end();
            }
        });
        await new Promise<void>(resolve =>
            server.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('server did not bind');
        }
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('derives session ownership from authentication and disables caches', async () => {
        state.mockResolvedValueOnce({ session: null });
        const response = await fetch(
            `${origin}/location/session?connectionId=81111111-1111-4111-8111-111111111111&after=4&actorDid=did:plc:hostile`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(state).toHaveBeenCalledWith(
            actorDid,
            '81111111-1111-4111-8111-111111111111',
            4,
        );
    });

    it('passes a strict body to consent without trusting body identity', async () => {
        const body = {
            connectionId: '81111111-1111-4111-8111-111111111111',
            consent: true,
            actorDid: 'did:plc:hostile',
        };
        consent.mockResolvedValueOnce({ session: null });
        const response = await fetch(`${origin}/location/consent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(response.status).toBe(200);
        expect(consent).toHaveBeenCalledWith(actorDid, body);
    });
});
