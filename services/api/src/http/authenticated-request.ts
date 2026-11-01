import type { IncomingHttpHeaders } from 'node:http';
import { AtClientError } from '@patchwork/at-client';
import type { PlatformRole } from '@patchwork/shared';
import {
    createAuthorizationContext,
    type AuthorizationContext,
} from '../authorization-guard.js';
import { PublicHttpError } from './error-response.js';

export interface AuthenticatedPrincipal {
    readonly did: string;
    readonly role: PlatformRole;
    readonly authorization: AuthorizationContext;
}

export interface AuthenticatedRequest {
    readonly sessionToken: string;
    readonly session: Readonly<{
        did: string;
        expiresAt?: string;
        /** Time the current browser session was created by a completed AT OAuth flow. */
        authenticatedAt?: string;
    }>;
    readonly principal: AuthenticatedPrincipal;
}

export interface AuthenticationDependencies {
    resolveSession(token: string): Promise<{
        did: string;
        expiresAt?: string;
        authenticatedAt?: string;
    }>;
    resolveRole(did: string): Promise<PlatformRole>;
}

const bearerToken = (headers: IncomingHttpHeaders): string | undefined => {
    const authorization = headers.authorization?.trim();
    if (!authorization) return undefined;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) {
        throw new PublicHttpError(
            401,
            'INVALID_AUTHORIZATION',
            'The Authorization header must contain one bearer session.',
        );
    }
    return match[1];
};

const cookieToken = (headers: IncomingHttpHeaders): string | undefined => {
    for (const cookie of headers.cookie?.split(';') ?? []) {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name === 'patchwork_session') {
            try {
                return decodeURIComponent(valueParts.join('='));
            } catch {
                throw new PublicHttpError(
                    401,
                    'INVALID_SESSION_COOKIE',
                    'The browser session cookie is invalid.',
                );
            }
        }
    }
    return undefined;
};

/**
 * Wrap a session lookup so an expired, revoked or unknown session becomes a
 * public 401. Otherwise routes that render errors generically answer 500,
 * including optional-auth routes such as guest checkout with a stale cookie.
 */
export const unauthorizedWhenSessionExpired = <T>(
    resolve: (token: string) => Promise<T>,
) => async (token: string): Promise<T> => {
    try {
        return await resolve(token);
    } catch (error) {
        if (error instanceof AtClientError && error.code === 'SESSION_EXPIRED') {
            throw new PublicHttpError(
                401,
                'SESSION_EXPIRED',
                'The Patchwork browser session is missing or expired.',
            );
        }
        throw error;
    }
};

export const authenticateOptionalRequest = async (
    request: { headers: IncomingHttpHeaders },
    dependencies: AuthenticationDependencies,
): Promise<AuthenticatedRequest | undefined> => {
    const bearer = bearerToken(request.headers);
    const cookie = cookieToken(request.headers);
    if (bearer && cookie && bearer !== cookie) {
        throw new PublicHttpError(
            401,
            'CONFLICTING_AUTHENTICATION',
            'The request contains conflicting authentication credentials.',
        );
    }
    const sessionToken = bearer ?? cookie;
    if (!sessionToken) return undefined;
    const session = await dependencies.resolveSession(sessionToken);
    const role = await dependencies.resolveRole(session.did);
    const authorization = createAuthorizationContext(session.did, role);
    return Object.freeze({
        sessionToken,
        session: Object.freeze({
            did: session.did,
            ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}),
            ...(session.authenticatedAt ?
                { authenticatedAt: session.authenticatedAt }
            :   {}),
        }),
        principal: Object.freeze({
            did: session.did,
            role,
            authorization,
        }),
    });
};

export const authenticateRequest = async (
    request: { headers: IncomingHttpHeaders },
    dependencies: AuthenticationDependencies,
): Promise<AuthenticatedRequest> => {
    const authenticated = await authenticateOptionalRequest(
        request,
        dependencies,
    );
    if (!authenticated) {
        throw new PublicHttpError(
            401,
            'AUTHENTICATION_REQUIRED',
            'An authenticated session is required.',
        );
    }
    return authenticated;
};
