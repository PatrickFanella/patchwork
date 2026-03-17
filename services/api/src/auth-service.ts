import {
    DidAuthError,
    DidAuthService,
    createInMemoryIdentityProvider,
    toErrorHttpResult,
    readQueryString,
    requireQueryString,
    type AuthSession,
    type DidSession,
    type InMemoryIdentityProviderOptions,
} from '@patchwork/shared';

export interface ApiAuthRouteResult {
    statusCode: number;
    body: unknown;
}

const requireString = (params: URLSearchParams, key: string): string => {
    return requireQueryString(
        params,
        key,
        missingKey =>
            new DidAuthError(
                'SESSION_CREATE_FAILED',
                `Missing required field: ${missingKey}`,
            ),
    );
};

const toAuthSession = (session: DidSession): AuthSession => ({
    did: session.did,
    handle: session.handle,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
    issuedAt: session.issuedAt,
    refreshedAt: session.refreshedAt,
});

const toErrorResult = (
    error: unknown,
    fallbackMessage: string,
): ApiAuthRouteResult => {
    if (error instanceof DidAuthError) {
        const statusCode =
            error.code === 'SESSION_EXPIRED' ? 401
            : error.code === 'SESSION_REFRESH_FAILED' ? 401
            : 400;

        return toErrorHttpResult(statusCode, error.code, error.message, error.details);
    }

    return toErrorHttpResult(400, 'AUTH_ERROR', fallbackMessage);
};

export class ApiAuthService {
    private readonly authService: DidAuthService;
    private readonly activeSessions = new Map<string, DidSession>();

    constructor(providerOptions?: InMemoryIdentityProviderOptions) {
        const provider = createInMemoryIdentityProvider(
            providerOptions ?? {
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
            },
        );
        this.authService = new DidAuthService(provider);
    }

    // -----------------------------------------------------------------
    // POST /auth/session (login) - via query params for fixture mode
    // -----------------------------------------------------------------

    async createSessionFromParams(
        params: URLSearchParams,
    ): Promise<ApiAuthRouteResult> {
        try {
            const handle = requireString(params, 'handle');
            const password = requireString(params, 'password');

            const session = await this.authService.loginWithHandle({
                handle,
                password,
            });

            this.activeSessions.set(session.accessJwt, session);

            return {
                statusCode: 200,
                body: {
                    session: toAuthSession(session),
                    created: true,
                },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to create auth session.');
        }
    }

    // -----------------------------------------------------------------
    // POST /auth/refresh - refresh an existing session
    // -----------------------------------------------------------------

    async refreshSessionFromParams(
        params: URLSearchParams,
    ): Promise<ApiAuthRouteResult> {
        try {
            const refreshJwt = requireString(params, 'refreshJwt');

            // Find session by refreshJwt
            let existingSession: DidSession | undefined;
            for (const session of this.activeSessions.values()) {
                if (session.refreshJwt === refreshJwt) {
                    existingSession = session;
                    break;
                }
            }

            if (!existingSession) {
                return toErrorHttpResult(
                    401,
                    'SESSION_EXPIRED',
                    'No active session found for this refresh token.',
                );
            }

            // Force the refresh by simulating near-expiry time so
            // refreshIfNeeded always issues new tokens when explicitly called.
            const nearExpiry = new Date(
                new Date(existingSession.expiresAt).getTime() - 1_000,
            );
            const result = await this.authService.refreshIfNeeded(
                existingSession,
                nearExpiry,
            );

            // Remove old session, store refreshed one
            this.activeSessions.delete(existingSession.accessJwt);
            this.activeSessions.set(
                result.session.accessJwt,
                result.session,
            );

            return {
                statusCode: 200,
                body: {
                    session: toAuthSession(result.session),
                    refreshed: result.refreshed,
                },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to refresh session.');
        }
    }

    // -----------------------------------------------------------------
    // DELETE /auth/session (logout)
    // -----------------------------------------------------------------

    deleteSessionFromParams(params: URLSearchParams): ApiAuthRouteResult {
        try {
            const accessJwt = requireString(params, 'accessJwt');

            const existed = this.activeSessions.has(accessJwt);
            this.activeSessions.delete(accessJwt);

            return {
                statusCode: 200,
                body: {
                    deleted: existed,
                    message: existed
                        ? 'Session deleted successfully.'
                        : 'No active session found (already logged out).',
                },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to delete session.');
        }
    }

    // -----------------------------------------------------------------
    // GET /auth/session - validate current session
    // -----------------------------------------------------------------

    async validateSessionFromParams(
        params: URLSearchParams,
    ): Promise<ApiAuthRouteResult> {
        const accessJwt = readQueryString(params, 'accessJwt');

        if (!accessJwt) {
            return toErrorHttpResult(
                401,
                'SESSION_EXPIRED',
                'No access token provided.',
            );
        }

        const session = this.activeSessions.get(accessJwt);
        if (!session) {
            return toErrorHttpResult(
                401,
                'SESSION_EXPIRED',
                'Session not found or already expired.',
            );
        }

        // Check if the access token has expired
        const now = new Date();
        if (new Date(session.expiresAt).getTime() <= now.getTime()) {
            return {
                statusCode: 401,
                body: {
                    valid: false,
                    code: 'SESSION_EXPIRED',
                    message: 'Access token expired. Use refresh token to renew.',
                    did: session.did,
                },
            };
        }

        return {
            statusCode: 200,
            body: {
                valid: true,
                session: toAuthSession(session),
            },
        };
    }

    // -----------------------------------------------------------------
    // Test-only accessors
    // -----------------------------------------------------------------

    getActiveSessionCountForTesting(): number {
        return this.activeSessions.size;
    }

    getSessionByDidForTesting(did: string): DidSession | undefined {
        for (const session of this.activeSessions.values()) {
            if (session.did === did) {
                return session;
            }
        }
        return undefined;
    }
}

export const createFixtureAuthService = (
    options?: InMemoryIdentityProviderOptions,
): ApiAuthService => {
    return new ApiAuthService(options);
};
