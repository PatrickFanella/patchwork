import { describe, expect, it, vi } from 'vitest';
import { authenticateRequest } from './authenticated-request.js';

describe('authenticated API request', () => {
    it('resolves one immutable principal from a bearer session and durable role', async () => {
        const resolveSession = vi.fn(async () => ({ did: 'did:plc:alice' }));
        const resolveRole = vi.fn(async () => 'moderator' as const);

        const authenticated = await authenticateRequest(
            { headers: { authorization: 'Bearer opaque-session' } },
            { resolveSession, resolveRole },
        );

        expect(authenticated).toMatchObject({
            sessionToken: 'opaque-session',
            principal: {
                did: 'did:plc:alice',
                role: 'moderator',
                authorization: {
                    actorDid: 'did:plc:alice',
                    role: 'moderator',
                },
            },
        });
        expect(resolveSession).toHaveBeenCalledOnce();
        expect(resolveRole).toHaveBeenCalledOnce();
        expect(Object.isFrozen(authenticated)).toBe(true);
        expect(Object.isFrozen(authenticated.principal)).toBe(true);
        expect(Object.isFrozen(authenticated.principal.authorization)).toBe(true);
    });

    it('accepts the opaque browser cookie and rejects missing or conflicting credentials', async () => {
        const dependencies = {
            resolveSession: vi.fn(async () => ({ did: 'did:plc:alice' })),
            resolveRole: vi.fn(async () => 'user' as const),
        };
        await expect(
            authenticateRequest(
                { headers: { cookie: 'patchwork_session=cookie-session' } },
                dependencies,
            ),
        ).resolves.toMatchObject({ sessionToken: 'cookie-session' });

        await expect(
            authenticateRequest({ headers: {} }, dependencies),
        ).rejects.toMatchObject({
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
        });
        await expect(
            authenticateRequest(
                {
                    headers: {
                        authorization: 'Bearer bearer-session',
                        cookie: 'patchwork_session=cookie-session',
                    },
                },
                dependencies,
            ),
        ).rejects.toMatchObject({
            statusCode: 401,
            code: 'CONFLICTING_AUTHENTICATION',
        });
    });
});
