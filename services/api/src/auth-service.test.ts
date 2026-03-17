import { describe, expect, it } from 'vitest';
import { createFixtureAuthService } from './auth-service.js';

describe('ApiAuthService', () => {
    const defaultHandles = {
        handles: {
            'alice.mutualhub.test': {
                did: 'did:example:alice',
                pdsUrl: 'https://pds.example',
            },
            'bob.mutualhub.test': {
                did: 'did:example:bob',
                pdsUrl: 'https://pds.example',
            },
        },
    };

    describe('POST /auth/session (login)', () => {
        it('creates a session for a valid handle', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'dev-password',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                session: { did: string; accessJwt: string; handle: string };
                created: boolean;
            };
            expect(body.created).toBe(true);
            expect(body.session.did).toBe('did:example:alice');
            expect(body.session.handle).toBe('alice.mutualhub.test');
            expect(body.session.accessJwt).toContain('access-');
        });

        it('returns 400 when handle is missing', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.createSessionFromParams(
                new URLSearchParams({ password: 'pw' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('returns error for unknown handle', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'unknown.test.handle',
                    password: 'pw',
                }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('tracks active session count', async () => {
            const service = createFixtureAuthService(defaultHandles);

            await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'pw',
                }),
            );

            await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'bob.mutualhub.test',
                    password: 'pw',
                }),
            );

            expect(service.getActiveSessionCountForTesting()).toBe(2);
        });
    });

    describe('GET /auth/session (validate)', () => {
        it('validates an active session', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const loginResult = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'pw',
                }),
            );
            const loginBody = loginResult.body as {
                session: { accessJwt: string };
            };

            const validateResult = await service.validateSessionFromParams(
                new URLSearchParams({
                    accessJwt: loginBody.session.accessJwt,
                }),
            );

            expect(validateResult.statusCode).toBe(200);
            const body = validateResult.body as { valid: boolean };
            expect(body.valid).toBe(true);
        });

        it('returns 401 for missing access token', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.validateSessionFromParams(
                new URLSearchParams(),
            );
            expect(result.statusCode).toBe(401);
        });

        it('returns 401 for invalid access token', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.validateSessionFromParams(
                new URLSearchParams({ accessJwt: 'invalid-token' }),
            );
            expect(result.statusCode).toBe(401);
        });
    });

    describe('POST /auth/refresh', () => {
        it('refreshes a session using the refresh token', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const loginResult = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'pw',
                }),
            );
            const loginBody = loginResult.body as {
                session: { refreshJwt: string; accessJwt: string };
            };

            const refreshResult = await service.refreshSessionFromParams(
                new URLSearchParams({
                    refreshJwt: loginBody.session.refreshJwt,
                }),
            );

            expect(refreshResult.statusCode).toBe(200);
            const body = refreshResult.body as {
                session: { accessJwt: string };
            };
            // Tokens should be available after refresh
            expect(body.session.accessJwt).toBeDefined();
        });

        it('returns 401 for unknown refresh token', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = await service.refreshSessionFromParams(
                new URLSearchParams({ refreshJwt: 'unknown-refresh-token' }),
            );
            expect(result.statusCode).toBe(401);
        });
    });

    describe('DELETE /auth/session (logout)', () => {
        it('deletes an active session', async () => {
            const service = createFixtureAuthService(defaultHandles);
            const loginResult = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'pw',
                }),
            );
            const loginBody = loginResult.body as {
                session: { accessJwt: string };
            };

            expect(service.getActiveSessionCountForTesting()).toBe(1);

            const deleteResult = service.deleteSessionFromParams(
                new URLSearchParams({
                    accessJwt: loginBody.session.accessJwt,
                }),
            );

            expect(deleteResult.statusCode).toBe(200);
            const body = deleteResult.body as { deleted: boolean };
            expect(body.deleted).toBe(true);
            expect(service.getActiveSessionCountForTesting()).toBe(0);
        });

        it('returns deleted=false for already-logged-out token', () => {
            const service = createFixtureAuthService(defaultHandles);
            const result = service.deleteSessionFromParams(
                new URLSearchParams({
                    accessJwt: 'access-nonexistent-token-1234567890',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { deleted: boolean };
            expect(body.deleted).toBe(false);
        });
    });

    describe('full auth lifecycle', () => {
        it('login -> validate -> refresh -> validate -> logout', async () => {
            const service = createFixtureAuthService(defaultHandles);

            // Step 1: Login
            const loginResult = await service.createSessionFromParams(
                new URLSearchParams({
                    handle: 'alice.mutualhub.test',
                    password: 'pw',
                }),
            );
            expect(loginResult.statusCode).toBe(200);
            const loginBody = loginResult.body as {
                session: { accessJwt: string; refreshJwt: string; did: string };
            };
            expect(loginBody.session.did).toBe('did:example:alice');

            // Step 2: Validate
            const validate1 = await service.validateSessionFromParams(
                new URLSearchParams({
                    accessJwt: loginBody.session.accessJwt,
                }),
            );
            expect(validate1.statusCode).toBe(200);

            // Step 3: Refresh
            const refreshResult = await service.refreshSessionFromParams(
                new URLSearchParams({
                    refreshJwt: loginBody.session.refreshJwt,
                }),
            );
            expect(refreshResult.statusCode).toBe(200);
            const refreshBody = refreshResult.body as {
                session: { accessJwt: string; did: string };
            };
            expect(refreshBody.session.did).toBe('did:example:alice');

            // Step 4: Old token should be invalid after refresh
            const validate2 = await service.validateSessionFromParams(
                new URLSearchParams({
                    accessJwt: loginBody.session.accessJwt,
                }),
            );
            expect(validate2.statusCode).toBe(401);

            // Step 5: New token should work
            const validate3 = await service.validateSessionFromParams(
                new URLSearchParams({
                    accessJwt: refreshBody.session.accessJwt,
                }),
            );
            expect(validate3.statusCode).toBe(200);

            // Step 6: Logout
            const logoutResult = service.deleteSessionFromParams(
                new URLSearchParams({
                    accessJwt: refreshBody.session.accessJwt,
                }),
            );
            expect(logoutResult.statusCode).toBe(200);
            expect(service.getActiveSessionCountForTesting()).toBe(0);

            // Step 7: Session no longer valid
            const validate4 = await service.validateSessionFromParams(
                new URLSearchParams({
                    accessJwt: refreshBody.session.accessJwt,
                }),
            );
            expect(validate4.statusCode).toBe(401);
        });
    });
});
