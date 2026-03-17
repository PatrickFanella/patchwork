import { describe, expect, it } from 'vitest';
import {
    DidAuthError,
    DidAuthService,
    createInMemoryIdentityProvider,
} from './identity.js';

describe('P2.2 DID auth/session lifecycle', () => {
    it('supports successful DID login from handle resolution', async () => {
        const service = new DidAuthService(
            createInMemoryIdentityProvider({
                handles: {
                    'alice.mutualhub.test': {
                        did: 'did:example:alice',
                        pdsUrl: 'https://pds.example',
                    },
                },
            }),
        );

        const session = await service.loginWithHandle({
            handle: 'alice.mutualhub.test',
            password: 'dev-password',
        });

        expect(session.did).toBe('did:example:alice');
        expect(session.accessJwt).toContain('access-');
        expect(session.refreshJwt).toContain('refresh-');
    });

    it('surfaces handle resolution failures with structured error codes', async () => {
        const service = new DidAuthService(
            createInMemoryIdentityProvider({
                handles: {
                    'alice.mutualhub.test': {
                        did: 'did:example:alice',
                        pdsUrl: 'https://pds.example',
                    },
                },
                failHandleResolutionFor: ['alice.mutualhub.test'],
            }),
        );

        await expect(
            service.loginWithHandle({
                handle: 'alice.mutualhub.test',
                password: 'pw',
            }),
        ).rejects.toMatchObject({
            code: 'HANDLE_RESOLUTION_FAILED' satisfies DidAuthError['code'],
        });
    });

    it('refreshes sessions before expiry and returns updated tokens', async () => {
        const service = new DidAuthService(
            createInMemoryIdentityProvider({
                handles: {
                    'alice.mutualhub.test': {
                        did: 'did:example:alice',
                        pdsUrl: 'https://pds.example',
                    },
                },
            }),
            30_000,
        );

        const session = await service.loginWithHandle({
            handle: 'alice.mutualhub.test',
            password: 'dev-password',
        });

        const nearExpiry = new Date(
            new Date(session.expiresAt).getTime() - 5_000,
        );
        const refreshed = await service.refreshIfNeeded(session, nearExpiry);

        expect(refreshed.refreshed).toBe(true);
        expect(refreshed.session.accessJwt).not.toEqual(session.accessJwt);
    });

    it('fails gracefully when refresh token has expired', async () => {
        const service = new DidAuthService(
            createInMemoryIdentityProvider({
                handles: {
                    'alice.mutualhub.test': {
                        did: 'did:example:alice',
                        pdsUrl: 'https://pds.example',
                    },
                },
            }),
        );

        const session = await service.loginWithHandle({
            handle: 'alice.mutualhub.test',
            password: 'dev-password',
        });

        const afterRefreshExpiry = new Date(
            new Date(session.refreshExpiresAt).getTime() + 1_000,
        );

        await expect(
            service.refreshIfNeeded(session, afterRefreshExpiry),
        ).rejects.toMatchObject({
            code: 'SESSION_EXPIRED' satisfies DidAuthError['code'],
        });
    });
});
