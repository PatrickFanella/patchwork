import {
    AtClientError,
    toAtClientError,
    type OAuthAdapter,
    type OAuthSessionHandle,
} from '@patchwork/at-client';
import type { NativeHandoffService, NativeLoginBinding } from './native-handoff.js';
import type { BrowserSessionRepository } from './session-repository.js';

const BROWSER_SESSION_TTL_MILLISECONDS = 12 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = BROWSER_SESSION_TTL_MILLISECONDS / 1000;

const safeReturnTo = (state: string | null): string => {
    if (!state || !state.startsWith('/') || state.startsWith('//')) {
        return '/';
    }
    const url = new URL(state, 'https://patchwork.invalid');
    const sensitiveKeys = new Set([
        'access_token',
        'refresh_token',
        'id_token',
        'token',
        'code',
        'state',
        'session',
    ]);
    for (const key of [...url.searchParams.keys()]) {
        if (sensitiveKeys.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return `${url.pathname}${url.search}`;
};

interface LoginAppState {
    handle?: string;
    returnTo: string;
    native?: NativeLoginBinding;
}

const encodeLoginAppState = (handle: string, returnTo: string): string =>
    Buffer.from(
        JSON.stringify({ handle, returnTo: safeReturnTo(returnTo) }),
        'utf8',
    ).toString('base64url');

const decodeLoginAppState = (state: string | null): LoginAppState => {
    if (!state) return { returnTo: '/' };
    try {
        const decoded = JSON.parse(
            Buffer.from(state, 'base64url').toString('utf8'),
        ) as Partial<LoginAppState>;
        return {
            handle:
                typeof decoded.handle === 'string' ? decoded.handle : undefined,
            ...(decoded.native ? { native: decoded.native } : {}),
            returnTo: safeReturnTo(
                typeof decoded.returnTo === 'string' ? decoded.returnTo : null,
            ),
        };
    } catch {
        return { returnTo: safeReturnTo(state) };
    }
};

export const oauthCallbackLandingPath = (returnTo: string): string => {
    const callback = new URL('/auth/callback', 'https://patchwork.invalid');
    callback.searchParams.set('returnTo', safeReturnTo(returnTo));
    return `${callback.pathname}${callback.search}`;
};

export const serializeSessionCookie = (
    token: string,
    secure: boolean,
    maxAge = COOKIE_MAX_AGE_SECONDS,
): string => {
    const attributes = [
        `patchwork_session=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
    ];
    if (secure) {
        attributes.push('Secure');
    }
    return attributes.join('; ');
};

export class AtAuthService {
    constructor(
        private readonly oauth: OAuthAdapter,
        private readonly browserSessions: BrowserSessionRepository,
        private readonly nativeHandoff?: NativeHandoffService,
    ) {}

    async beginLogin(
        handle: string,
        returnTo = '/',
    ): Promise<{ authorizationUrl: string }> {
        try {
            const authorizationUrl = await this.oauth.authorize(
                handle,
                encodeLoginAppState(handle, returnTo),
            );
            return { authorizationUrl: authorizationUrl.toString() };
        } catch (error) {
            throw toAtClientError(error, 'Unable to begin AT Protocol login.');
        }
    }

    async beginNativeLogin(value: unknown): Promise<{ authorizationUrl: string }> {
        if (!this.nativeHandoff) throw new AtClientError('UNAUTHORIZED', 'Native sign-in is unavailable.');
        const { handle, binding } = this.nativeHandoff.bind(value);
        const state = Buffer.from(JSON.stringify({ handle, returnTo: '/', native: binding }), 'utf8').toString('base64url');
        const authorizationUrl = await this.oauth.authorize(handle, state);
        return { authorizationUrl: authorizationUrl.toString() };
    }

    async completeLogin(params: URLSearchParams): Promise<{
        did: string;
        returnTo: string;
        sessionToken: string;
    } | { nativeRedirect: string }> {
        try {
            const result = await this.oauth.callback(params);
            const appState = decodeLoginAppState(result.state);
            if (appState.handle) {
                await this.browserSessions.setHandle(
                    result.session.did,
                    appState.handle,
                );
            }
            if (appState.native) {
                if (!this.nativeHandoff) throw new AtClientError('UNAUTHORIZED', 'Native sign-in is unavailable.');
                return { nativeRedirect: await this.nativeHandoff.complete(result.session.did, appState.native) };
            }
            const expiresAt = new Date(
                Date.now() + BROWSER_SESSION_TTL_MILLISECONDS,
            );
            const sessionToken = await this.browserSessions.create(
                result.session.did,
                expiresAt,
            );
            return {
                did: result.session.did,
                returnTo: appState.returnTo,
                sessionToken,
            };
        } catch (error) {
            throw toAtClientError(error, 'Unable to complete AT Protocol login.');
        }
    }

    async current(sessionToken: string): Promise<{
        did: string;
        handle?: string;
        expiresAt: string;
        authenticatedAt: string;
    }> {
        const session = await this.browserSessions.get(sessionToken);
        if (!session) {
            throw new AtClientError(
                'SESSION_EXPIRED',
                'The Patchwork browser session is missing or expired.',
            );
        }
        await this.browserSessions.touch(sessionToken);
        return {
            did: session.did,
            ...(session.handle ? { handle: session.handle } : {}),
            expiresAt: session.expiresAt.toISOString(),
            authenticatedAt: session.authenticatedAt.toISOString(),
        };
    }

    async refresh(sessionToken: string): Promise<{ did: string }> {
        const current = await this.current(sessionToken);
        try {
            const restored = await this.oauth.restore(current.did);
            return { ...current, did: restored.did };
        } catch (error) {
            await this.browserSessions.revoke(sessionToken);
            throw toAtClientError(error, 'Unable to refresh AT Protocol session.');
        }
    }

    async restoreSession(sessionToken: string): Promise<OAuthSessionHandle> {
        const current = await this.current(sessionToken);
        try {
            return await this.oauth.restore(current.did);
        } catch (error) {
            await this.browserSessions.revoke(sessionToken);
            throw toAtClientError(error, 'Unable to restore AT Protocol session.');
        }
    }

    async logout(sessionToken: string): Promise<void> {
        const session = await this.browserSessions.get(sessionToken);
        if (!session) {
            return;
        }

        try {
            await this.oauth.revoke(session.did);
        } finally {
            await this.browserSessions.revoke(sessionToken);
        }
    }
}
