import { describe, expect, it } from 'vitest';
import {
    createAuthorizationContext,
    requireCapability,
    requireRole,
    requireOwnerOrRole,
    AuthorizationError,
} from './authorization-guard.js';

describe('API authorization guards', () => {
    // -----------------------------------------------------------------
    // createAuthorizationContext
    // -----------------------------------------------------------------

    describe('createAuthorizationContext', () => {
        it('builds a context with resolved capabilities for a user role', () => {
            const ctx = createAuthorizationContext('did:example:alice', 'user');
            expect(ctx.actorDid).toBe('did:example:alice');
            expect(ctx.role).toBe('user');
            expect(ctx.capabilities).toContain('create:request');
            expect(ctx.capabilities).toContain('read:public_requests');
            expect(ctx.capabilities).not.toContain('moderate:content');
        });

        it('builds a context for anonymous with minimal capabilities', () => {
            const ctx = createAuthorizationContext('did:example:anon', 'anonymous');
            expect(ctx.capabilities).toContain('read:public_requests');
            expect(ctx.capabilities).not.toContain('create:request');
        });

        it('builds a context for admin with full capabilities', () => {
            const ctx = createAuthorizationContext('did:example:admin', 'admin');
            expect(ctx.capabilities).toContain('admin:manage_roles');
            expect(ctx.capabilities).toContain('moderate:content');
            expect(ctx.capabilities).toContain('create:request');
        });

        it('builds a context for volunteer with assignment capabilities', () => {
            const ctx = createAuthorizationContext('did:example:vol', 'volunteer');
            expect(ctx.capabilities).toContain('accept:assignment');
            expect(ctx.capabilities).toContain('complete:handoff');
            expect(ctx.capabilities).not.toContain('moderate:content');
        });
    });

    // -----------------------------------------------------------------
    // requireCapability
    // -----------------------------------------------------------------

    describe('requireCapability', () => {
        it('does not throw when role has the required capability', () => {
            const ctx = createAuthorizationContext('did:example:alice', 'user');
            expect(() => requireCapability(ctx, 'create:request')).not.toThrow();
        });

        it('throws AuthorizationError when role lacks the capability', () => {
            const ctx = createAuthorizationContext('did:example:alice', 'user');
            expect(() => requireCapability(ctx, 'moderate:content')).toThrow(
                AuthorizationError,
            );
        });

        it('error has FORBIDDEN code and 403 status', () => {
            const ctx = createAuthorizationContext('did:example:alice', 'anonymous');
            try {
                requireCapability(ctx, 'create:request');
                expect.fail('Should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AuthorizationError);
                const authErr = err as AuthorizationError;
                expect(authErr.code).toBe('FORBIDDEN');
                expect(authErr.statusCode).toBe(403);
                expect(authErr.message).toContain('anonymous');
                expect(authErr.message).toContain('create:request');
            }
        });

        it('volunteer can accept assignments', () => {
            const ctx = createAuthorizationContext('did:example:vol', 'volunteer');
            expect(() => requireCapability(ctx, 'accept:assignment')).not.toThrow();
        });

        it('user cannot accept assignments', () => {
            const ctx = createAuthorizationContext('did:example:user', 'user');
            expect(() => requireCapability(ctx, 'accept:assignment')).toThrow(
                AuthorizationError,
            );
        });
    });

    // -----------------------------------------------------------------
    // requireRole
    // -----------------------------------------------------------------

    describe('requireRole', () => {
        it('does not throw when role meets minimum', () => {
            const ctx = createAuthorizationContext('did:example:admin', 'admin');
            expect(() => requireRole(ctx, 'moderator')).not.toThrow();
        });

        it('does not throw when role equals minimum', () => {
            const ctx = createAuthorizationContext('did:example:mod', 'moderator');
            expect(() => requireRole(ctx, 'moderator')).not.toThrow();
        });

        it('throws when role is below minimum', () => {
            const ctx = createAuthorizationContext('did:example:user', 'user');
            expect(() => requireRole(ctx, 'moderator')).toThrow(
                AuthorizationError,
            );
        });

        it('error message describes the role mismatch', () => {
            const ctx = createAuthorizationContext('did:example:vol', 'volunteer');
            try {
                requireRole(ctx, 'admin');
                expect.fail('Should have thrown');
            } catch (err) {
                const authErr = err as AuthorizationError;
                expect(authErr.message).toContain('volunteer');
                expect(authErr.message).toContain('admin');
            }
        });
    });

    // -----------------------------------------------------------------
    // requireOwnerOrRole
    // -----------------------------------------------------------------

    describe('requireOwnerOrRole', () => {
        it('allows when actor is the owner', () => {
            const ctx = createAuthorizationContext('did:example:alice', 'user');
            expect(() =>
                requireOwnerOrRole(ctx, 'did:example:alice', 'admin'),
            ).not.toThrow();
        });

        it('allows when actor is not the owner but has bypass role', () => {
            const ctx = createAuthorizationContext('did:example:admin', 'admin');
            expect(() =>
                requireOwnerOrRole(ctx, 'did:example:alice', 'admin'),
            ).not.toThrow();
        });

        it('throws when actor is not owner and lacks bypass role', () => {
            const ctx = createAuthorizationContext('did:example:bob', 'user');
            expect(() =>
                requireOwnerOrRole(ctx, 'did:example:alice', 'admin'),
            ).toThrow(AuthorizationError);
        });

        it('super_admin can bypass ownership check for admin bypass role', () => {
            const ctx = createAuthorizationContext('did:example:super', 'super_admin');
            expect(() =>
                requireOwnerOrRole(ctx, 'did:example:alice', 'admin'),
            ).not.toThrow();
        });

        it('moderator cannot bypass admin-level ownership check', () => {
            const ctx = createAuthorizationContext('did:example:mod', 'moderator');
            expect(() =>
                requireOwnerOrRole(ctx, 'did:example:alice', 'admin'),
            ).toThrow(AuthorizationError);
        });
    });

    // -----------------------------------------------------------------
    // AuthorizationError
    // -----------------------------------------------------------------

    describe('AuthorizationError', () => {
        it('UNAUTHORIZED has status 401', () => {
            const err = new AuthorizationError('UNAUTHORIZED', 'Not logged in');
            expect(err.statusCode).toBe(401);
            expect(err.code).toBe('UNAUTHORIZED');
            expect(err.name).toBe('AuthorizationError');
        });

        it('FORBIDDEN has status 403', () => {
            const err = new AuthorizationError('FORBIDDEN', 'Insufficient role');
            expect(err.statusCode).toBe(403);
            expect(err.code).toBe('FORBIDDEN');
        });

        it('is an instance of Error', () => {
            const err = new AuthorizationError('FORBIDDEN', 'test');
            expect(err).toBeInstanceOf(Error);
        });
    });

    // -----------------------------------------------------------------
    // Integration: lifecycle-service authorization wiring
    // -----------------------------------------------------------------

    describe('integration with lifecycle-service (additive authorization)', () => {
        it('createAuthorizationContext for a moderator has moderate:content', () => {
            const ctx = createAuthorizationContext('did:example:mod', 'moderator');
            expect(() => requireCapability(ctx, 'moderate:content')).not.toThrow();
        });

        it('createAuthorizationContext for a user lacks moderate:content', () => {
            const ctx = createAuthorizationContext('did:example:user', 'user');
            expect(() => requireCapability(ctx, 'moderate:content')).toThrow(
                AuthorizationError,
            );
        });

        it('volunteer context has complete:handoff capability', () => {
            const ctx = createAuthorizationContext('did:example:vol', 'volunteer');
            expect(() => requireCapability(ctx, 'complete:handoff')).not.toThrow();
        });

        it('user context lacks complete:handoff capability', () => {
            const ctx = createAuthorizationContext('did:example:user', 'user');
            expect(() => requireCapability(ctx, 'complete:handoff')).toThrow(
                AuthorizationError,
            );
        });
    });
});
