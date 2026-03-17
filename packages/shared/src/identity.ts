const randomUUID = (): string => globalThis.crypto.randomUUID();
import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

const handleSchema = z
    .string()
    .regex(
        /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i,
        'Expected a valid handle (e.g., alice.example)',
    );

const sessionTokenSchema = z.object({
    accessJwt: z.string().min(16),
    refreshJwt: z.string().min(16),
    expiresAt: isoDateTimeSchema,
    refreshExpiresAt: isoDateTimeSchema,
});

export interface HandleResolution {
    handle: string;
    did: string;
    pdsUrl: string;
    resolvedAt: string;
}

export interface DidSession {
    did: string;
    handle: string;
    pdsUrl: string;
    accessJwt: string;
    refreshJwt: string;
    expiresAt: string;
    refreshExpiresAt: string;
    issuedAt: string;
    refreshedAt?: string;
}

export interface IdentityProvider {
    resolveHandle(handle: string): Promise<HandleResolution>;
    createSession(input: {
        did: string;
        handle: string;
        password: string;
        pdsUrl: string;
    }): Promise<DidSession>;
    refreshSession(
        refreshJwt: string,
    ): Promise<
        Pick<
            DidSession,
            'accessJwt' | 'refreshJwt' | 'expiresAt' | 'refreshExpiresAt'
        >
    >;
}

export type DidAuthErrorCode =
    | 'INVALID_HANDLE'
    | 'INVALID_DID'
    | 'HANDLE_RESOLUTION_FAILED'
    | 'SESSION_CREATE_FAILED'
    | 'SESSION_REFRESH_FAILED'
    | 'SESSION_EXPIRED';

export class DidAuthError extends Error {
    constructor(
        readonly code: DidAuthErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'DidAuthError';
    }
}

export interface LoginInput {
    handle: string;
    password: string;
}

export interface RefreshResult {
    session: DidSession;
    refreshed: boolean;
}

export class DidAuthService {
    constructor(
        private readonly provider: IdentityProvider,
        private readonly refreshLeewayMs = 60_000,
    ) {}

    async loginWithHandle(input: LoginInput): Promise<DidSession> {
        const parsedHandle = handleSchema.safeParse(input.handle);
        if (!parsedHandle.success) {
            throw new DidAuthError(
                'INVALID_HANDLE',
                'Handle must be a valid DNS-like handle.',
                {
                    handle: input.handle,
                },
            );
        }

        let resolution: HandleResolution;
        try {
            resolution = await this.provider.resolveHandle(parsedHandle.data);
        } catch (error) {
            throw new DidAuthError(
                'HANDLE_RESOLUTION_FAILED',
                'Failed to resolve handle to DID.',
                {
                    handle: parsedHandle.data,
                    cause: error instanceof Error ? error.message : 'unknown',
                },
            );
        }

        const parsedDid = didSchema.safeParse(resolution.did);
        if (!parsedDid.success) {
            throw new DidAuthError(
                'INVALID_DID',
                'Resolved DID is malformed.',
                {
                    did: resolution.did,
                    handle: parsedHandle.data,
                },
            );
        }

        try {
            const session = await this.provider.createSession({
                did: parsedDid.data,
                handle: parsedHandle.data,
                password: input.password,
                pdsUrl: resolution.pdsUrl,
            });

            return this.assertSessionShape(session);
        } catch (error) {
            throw new DidAuthError(
                'SESSION_CREATE_FAILED',
                'Unable to create DID session.',
                {
                    did: parsedDid.data,
                    handle: parsedHandle.data,
                    cause: error instanceof Error ? error.message : 'unknown',
                },
            );
        }
    }

    async refreshIfNeeded(
        session: DidSession,
        now = new Date(),
    ): Promise<RefreshResult> {
        const parsed = this.assertSessionShape(session);

        const expiresAt = new Date(parsed.expiresAt).getTime();
        const refreshExpiresAt = new Date(parsed.refreshExpiresAt).getTime();
        const nowMs = now.getTime();

        if (refreshExpiresAt <= nowMs) {
            throw new DidAuthError(
                'SESSION_EXPIRED',
                'Refresh token expired; user must log in again.',
                {
                    did: parsed.did,
                    refreshExpiresAt: parsed.refreshExpiresAt,
                },
            );
        }

        if (expiresAt - nowMs > this.refreshLeewayMs) {
            return { session: parsed, refreshed: false };
        }

        try {
            const refreshed = await this.provider.refreshSession(
                parsed.refreshJwt,
            );
            const parsedTokens = sessionTokenSchema.parse(refreshed);

            return {
                refreshed: true,
                session: {
                    ...parsed,
                    ...parsedTokens,
                    refreshedAt: new Date(nowMs).toISOString(),
                },
            };
        } catch (error) {
            throw new DidAuthError(
                'SESSION_REFRESH_FAILED',
                'Session refresh failed.',
                {
                    did: parsed.did,
                    cause: error instanceof Error ? error.message : 'unknown',
                },
            );
        }
    }

    private assertSessionShape(session: DidSession): DidSession {
        didSchema.parse(session.did);
        handleSchema.parse(session.handle);
        sessionTokenSchema.parse(session);
        return session;
    }
}

export interface InMemoryIdentityProviderOptions {
    handles: Record<string, { did: string; pdsUrl: string }>;
    failHandleResolutionFor?: string[];
    failRefreshForTokens?: string[];
}

export const createInMemoryIdentityProvider = (
    options: InMemoryIdentityProviderOptions,
): IdentityProvider => {
    const failHandleSet = new Set(options.failHandleResolutionFor ?? []);
    const failRefreshSet = new Set(options.failRefreshForTokens ?? []);

    return {
        async resolveHandle(handle: string): Promise<HandleResolution> {
            if (failHandleSet.has(handle)) {
                throw new Error('forced-handle-resolution-failure');
            }

            const entry = options.handles[handle];
            if (!entry) {
                throw new Error('handle-not-found');
            }

            return {
                handle,
                did: entry.did,
                pdsUrl: entry.pdsUrl,
                resolvedAt: new Date().toISOString(),
            };
        },

        /**
         * @warning This mock does NOT validate the password parameter.
         * It is intended for testing/development only and MUST NOT be used in
         * production. A real IdentityProvider must implement proper password
         * validation.
         */
        async createSession(input): Promise<DidSession> {
            const issuedAt = new Date().toISOString();
            return {
                did: input.did,
                handle: input.handle,
                pdsUrl: input.pdsUrl,
                accessJwt: `access-${randomUUID()}`,
                refreshJwt: `refresh-${randomUUID()}`,
                issuedAt,
                expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
                refreshExpiresAt: new Date(
                    Date.now() + 24 * 60 * 60_000,
                ).toISOString(),
            };
        },

        async refreshSession(refreshJwt) {
            if (failRefreshSet.has(refreshJwt)) {
                throw new Error('forced-refresh-failure');
            }

            return {
                accessJwt: `access-${randomUUID()}`,
                refreshJwt: `refresh-${randomUUID()}`,
                expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
                refreshExpiresAt: new Date(
                    Date.now() + 24 * 60 * 60_000,
                ).toISOString(),
            };
        },
    };
};
