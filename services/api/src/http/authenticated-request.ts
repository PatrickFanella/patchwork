import type { IncomingHttpHeaders } from 'node:http';
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
    }>;
    readonly principal: AuthenticatedPrincipal;
}

export interface AuthenticationDependencies {
    resolveSession(token: string): Promise<{ did: string; expiresAt?: string }>;
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
