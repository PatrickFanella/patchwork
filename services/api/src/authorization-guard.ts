/**
 * API-layer authorization guards.
 *
 * Builds on the shared role/capability model to provide request-scoped
 * authorization checks for API service methods.
 */

import {
    hasCapability,
    meetsRoleLevel,
    ROLE_CAPABILITIES,
    type Capability,
    type PlatformRole,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Authorization context
// ---------------------------------------------------------------------------

/**
 * Immutable context carried through a single API request.
 * Created once at the edge (auth middleware) and threaded into services.
 */
export interface AuthorizationContext {
    readonly actorDid: string;
    readonly role: PlatformRole;
    readonly capabilities: readonly Capability[];
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

/**
 * Build an AuthorizationContext from a DID and role.
 * Capabilities are resolved from the shared ROLE_CAPABILITIES mapping.
 */
export function createAuthorizationContext(
    actorDid: string,
    role: PlatformRole,
): AuthorizationContext {
    return {
        actorDid,
        role,
        capabilities: [...ROLE_CAPABILITIES[role]],
    };
}

// ---------------------------------------------------------------------------
// Guard errors
// ---------------------------------------------------------------------------

export class AuthorizationError extends Error {
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN';
    readonly statusCode: number;

    constructor(
        code: 'UNAUTHORIZED' | 'FORBIDDEN',
        message: string,
    ) {
        super(message);
        this.name = 'AuthorizationError';
        this.code = code;
        this.statusCode = code === 'UNAUTHORIZED' ? 401 : 403;
    }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Throw if the context does not include the required capability.
 */
export function requireCapability(
    ctx: AuthorizationContext,
    capability: Capability,
): void {
    if (!hasCapability(ctx.role, capability)) {
        throw new AuthorizationError(
            'FORBIDDEN',
            `Role '${ctx.role}' lacks required capability '${capability}'.`,
        );
    }
}

/**
 * Throw if the context's role does not meet the minimum role level.
 */
export function requireRole(
    ctx: AuthorizationContext,
    minimumRole: PlatformRole,
): void {
    if (!meetsRoleLevel(ctx.role, minimumRole)) {
        throw new AuthorizationError(
            'FORBIDDEN',
            `Role '${ctx.role}' does not meet minimum required role '${minimumRole}'.`,
        );
    }
}

/**
 * Throw if the context's actor DID does not match the resource owner,
 * unless the context meets the bypass role (e.g. admin can read anyone's data).
 */
export function requireOwnerOrRole(
    ctx: AuthorizationContext,
    ownerDid: string,
    bypassRole: PlatformRole,
): void {
    if (ctx.actorDid === ownerDid) {
        return;
    }
    if (!meetsRoleLevel(ctx.role, bypassRole)) {
        throw new AuthorizationError(
            'FORBIDDEN',
            `Actor '${ctx.actorDid}' is not the owner and role '${ctx.role}' does not meet bypass role '${bypassRole}'.`,
        );
    }
}
