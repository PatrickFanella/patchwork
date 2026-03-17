import { describe, expect, it } from 'vitest';
import {
    getVisibleRoutes,
    isPublicRoute,
    publicRoutes,
    shellSections,
} from './app-shell.js';
import type { PlatformRole } from '@patchwork/shared';

describe('app-shell route visibility', () => {
    // -----------------------------------------------------------------
    // shellSections integrity
    // -----------------------------------------------------------------

    describe('shellSections', () => {
        it('every section has a valid public route', () => {
            for (const section of shellSections) {
                expect(publicRoutes).toContain(section.route);
            }
        });

        it('moderation section requires moderator role', () => {
            const modSection = shellSections.find(s => s.route === '/moderation');
            expect(modSection).toBeDefined();
            expect(modSection!.requiresRole).toBe('moderator');
        });

        it('settings section requires user role', () => {
            const settingsSection = shellSections.find(s => s.route === '/settings');
            expect(settingsSection).toBeDefined();
            expect(settingsSection!.requiresRole).toBe('user');
        });

        it('map section has no role requirement (visible to all)', () => {
            const mapSection = shellSections.find(s => s.route === '/map');
            expect(mapSection).toBeDefined();
            expect(mapSection!.requiresRole).toBeUndefined();
        });

        it('groups section requires user role', () => {
            const groupsSection = shellSections.find(s => s.route === '/groups');
            expect(groupsSection).toBeDefined();
            expect(groupsSection!.requiresRole).toBe('user');
            expect(groupsSection!.title).toBe('Groups');
        });
    });

    // -----------------------------------------------------------------
    // getVisibleRoutes
    // -----------------------------------------------------------------

    describe('getVisibleRoutes', () => {
        it('anonymous sees only unrestricted routes (map, feed, resources)', () => {
            const visible = getVisibleRoutes('anonymous');
            const routes = visible.map(s => s.route);

            expect(routes).toContain('/map');
            expect(routes).toContain('/feed');
            expect(routes).toContain('/resources');
            expect(routes).not.toContain('/settings');
            expect(routes).not.toContain('/moderation');
            expect(routes).not.toContain('/inbox');
            expect(routes).not.toContain('/notifications');
            expect(routes).not.toContain('/scheduling');
            expect(routes).not.toContain('/volunteer');
            expect(routes).not.toContain('/feedback');
            expect(routes).not.toContain('/groups');
        });

        it('user sees unrestricted routes plus user-level routes', () => {
            const visible = getVisibleRoutes('user');
            const routes = visible.map(s => s.route);

            expect(routes).toContain('/map');
            expect(routes).toContain('/feed');
            expect(routes).toContain('/resources');
            expect(routes).toContain('/volunteer');
            expect(routes).toContain('/settings');
            expect(routes).toContain('/inbox');
            expect(routes).toContain('/notifications');
            expect(routes).toContain('/feedback');
            expect(routes).toContain('/groups');
            expect(routes).not.toContain('/moderation');
            expect(routes).not.toContain('/scheduling');
        });

        it('volunteer sees the same as user plus scheduling (but not moderation)', () => {
            const visible = getVisibleRoutes('volunteer');
            const routes = visible.map(s => s.route);

            expect(routes).toContain('/settings');
            expect(routes).toContain('/inbox');
            expect(routes).toContain('/notifications');
            expect(routes).toContain('/scheduling');
            expect(routes).not.toContain('/moderation');
        });

        it('moderator sees all routes including moderation', () => {
            const visible = getVisibleRoutes('moderator');
            const routes = visible.map(s => s.route);

            expect(routes).toContain('/map');
            expect(routes).toContain('/moderation');
            expect(routes).toContain('/settings');
            expect(routes).toContain('/inbox');
            expect(routes).toContain('/notifications');
            expect(routes).toContain('/scheduling');
        });

        it('admin sees all routes', () => {
            const visible = getVisibleRoutes('admin');
            expect(visible.length).toBe(shellSections.length);
        });

        it('super_admin sees all routes', () => {
            const visible = getVisibleRoutes('super_admin');
            expect(visible.length).toBe(shellSections.length);
        });

        it('returns ShellSection objects with correct structure', () => {
            const visible = getVisibleRoutes('user');
            for (const section of visible) {
                expect(section.route).toBeTruthy();
                expect(section.title).toBeTruthy();
                expect(section.description).toBeTruthy();
            }
        });
    });

    // -----------------------------------------------------------------
    // isPublicRoute
    // -----------------------------------------------------------------

    describe('isPublicRoute', () => {
        it('accepts all defined public routes', () => {
            for (const route of publicRoutes) {
                expect(isPublicRoute(route)).toBe(true);
            }
        });

        it('rejects unknown routes', () => {
            expect(isPublicRoute('/admin')).toBe(false);
            expect(isPublicRoute('/dashboard')).toBe(false);
            expect(isPublicRoute('')).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // Role-visibility matrix (exhaustive)
    // -----------------------------------------------------------------

    describe('role-visibility matrix', () => {
        const legalRoutes = ['/legal/terms', '/legal/privacy', '/legal/community-guidelines'];
        const expectations: Record<PlatformRole, string[]> = {
            anonymous: ['/map', '/feed', '/resources', ...legalRoutes],
            user: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/inbox', '/notifications', '/feedback', '/groups', ...legalRoutes],
            verified_user: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/inbox', '/notifications', '/feedback', '/groups', ...legalRoutes],
            volunteer: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/inbox', '/notifications', '/scheduling', '/feedback', '/groups', ...legalRoutes],
            moderator: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/moderation', '/inbox', '/notifications', '/scheduling', '/feedback', '/groups', ...legalRoutes],
            admin: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/moderation', '/inbox', '/notifications', '/scheduling', '/feedback', '/groups', ...legalRoutes],
            super_admin: ['/map', '/feed', '/resources', '/volunteer', '/settings', '/moderation', '/inbox', '/notifications', '/scheduling', '/feedback', '/groups', ...legalRoutes],
        };

        for (const [role, expectedRoutes] of Object.entries(expectations)) {
            it(`${role} sees exactly the expected routes`, () => {
                const visible = getVisibleRoutes(role as PlatformRole);
                const routes = visible.map(s => s.route);
                expect(routes).toEqual(expectedRoutes);
            });
        }
    });
});
