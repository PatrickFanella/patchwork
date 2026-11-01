import { describe, expect, it, vi } from 'vitest';
import { AtClientError } from '@patchwork/at-client';
import { authenticateOptionalRequest, authenticateRequest, unauthorizedWhenSessionExpired } from './authenticated-request.js';
import { PublicHttpError } from './error-response.js';

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
        expect(Object.isFrozen(authenticated.session)).toBe(true);
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

    it('answers 401 for an expired or unknown session, including on optional-auth routes', async () => {
        const resolveSession = unauthorizedWhenSessionExpired(async (token: string) => {
            if (token === 'current') return { did: 'did:plc:sessionuser' };
            throw new AtClientError('SESSION_EXPIRED', 'The Patchwork browser session is missing or expired.');
        });
        const dependencies = { resolveSession, resolveRole: async () => 'user' as const };
        const stale = { headers: { cookie: 'patchwork_session=stale' } };
        for (const attempt of [
            authenticateRequest(stale, dependencies),
            authenticateOptionalRequest(stale, dependencies),
            authenticateRequest({ headers: { authorization: 'Bearer unknown' } }, dependencies),
        ]) {
            await expect(attempt).rejects.toMatchObject({ statusCode: 401, code: 'SESSION_EXPIRED' });
        }
        await expect(authenticateRequest({ headers: { authorization: 'Bearer current' } }, dependencies))
            .resolves.toMatchObject({ principal: { did: 'did:plc:sessionuser' } });

        // Other failures keep their own handling.
        const outage = unauthorizedWhenSessionExpired(async () => {
            throw new AtClientError('PDS_UNAVAILABLE', 'The PDS is unavailable.');
        });
        await expect(outage('token')).rejects.toBeInstanceOf(AtClientError);
        await expect(outage('token')).rejects.not.toBeInstanceOf(PublicHttpError);
    });
});
