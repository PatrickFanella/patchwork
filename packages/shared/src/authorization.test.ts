import { describe, expect, it } from 'vitest';
import {
    CAPABILITIES,
    PLATFORM_ROLES,
    ROLE_CAPABILITIES,
    hasCapability,
    meetsRoleLevel,
    isValidPlatformRole,
    isValidCapability,
    getRoleLevel,
    type PlatformRole,
} from './authorization.js';

describe('authorization — role and capability model', () => {
    // -----------------------------------------------------------------
    // ROLE_CAPABILITIES completeness
    // -----------------------------------------------------------------

    describe('ROLE_CAPABILITIES mapping', () => {
        it('every platform role has an entry', () => {
            for (const role of PLATFORM_ROLES) {
                expect(ROLE_CAPABILITIES[role]).toBeDefined();
                expect(Array.isArray(ROLE_CAPABILITIES[role])).toBe(true);
            }
        });

        it('every capability referenced in the mapping is a valid capability', () => {
            for (const role of PLATFORM_ROLES) {
                for (const cap of ROLE_CAPABILITIES[role]) {
                    expect(CAPABILITIES).toContain(cap);
                }
            }
        });

        it('anonymous has only read:public_requests', () => {
            expect(ROLE_CAPABILITIES['anonymous']).toEqual(['read:public_requests']);
        });

        it('user has core capabilities including create/edit/delete requests, messaging, profile', () => {
            const userCaps = ROLE_CAPABILITIES['user'];
            expect(userCaps).toContain('read:public_requests');
            expect(userCaps).toContain('create:request');
            expect(userCaps).toContain('edit:own_request');
            expect(userCaps).toContain('delete:own_request');
            expect(userCaps).toContain('read:messages');
            expect(userCaps).toContain('send:message');
            expect(userCaps).toContain('read:own_profile');
            expect(userCaps).toContain('edit:own_profile');
            expect(userCaps).toContain('read:inbox');
        });

        it('user does not have volunteer or moderator capabilities', () => {
            const userCaps = ROLE_CAPABILITIES['user'];
            expect(userCaps).not.toContain('accept:assignment');
            expect(userCaps).not.toContain('complete:handoff');
            expect(userCaps).not.toContain('moderate:content');
            expect(userCaps).not.toContain('admin:manage_roles');
        });

        it('volunteer inherits user capabilities and adds assignment/handoff', () => {
            const volCaps = ROLE_CAPABILITIES['volunteer'];
            expect(volCaps).toContain('create:request');
            expect(volCaps).toContain('accept:assignment');
            expect(volCaps).toContain('complete:handoff');
            expect(volCaps).not.toContain('moderate:content');
        });

        it('moderator inherits volunteer capabilities and adds moderation', () => {
            const modCaps = ROLE_CAPABILITIES['moderator'];
            expect(modCaps).toContain('accept:assignment');
            expect(modCaps).toContain('moderate:content');
            expect(modCaps).toContain('moderate:users');
            expect(modCaps).not.toContain('admin:manage_roles');
        });

        it('admin inherits moderator capabilities and adds admin capabilities', () => {
            const adminCaps = ROLE_CAPABILITIES['admin'];
            expect(adminCaps).toContain('moderate:content');
            expect(adminCaps).toContain('admin:manage_roles');
            expect(adminCaps).toContain('admin:system_config');
            expect(adminCaps).toContain('admin:view_audit');
        });

        it('super_admin has all capabilities', () => {
            const superCaps = ROLE_CAPABILITIES['super_admin'];
            for (const cap of CAPABILITIES) {
                expect(superCaps).toContain(cap);
            }
        });
    });

    // -----------------------------------------------------------------
    // Capability hierarchy is additive
    // -----------------------------------------------------------------

    describe('role hierarchy is additive (each role includes all capabilities of lower roles)', () => {
        const orderedRoles: PlatformRole[] = [
            'anonymous',
            'user',
            'verified_user',
            'volunteer',
            'moderator',
            'admin',
            'super_admin',
        ];

        for (let i = 1; i < orderedRoles.length; i++) {
            const lowerRole = orderedRoles[i - 1];
            const higherRole = orderedRoles[i];

            it(`${higherRole} includes all capabilities of ${lowerRole}`, () => {
                const lowerCaps = ROLE_CAPABILITIES[lowerRole];
                const higherCaps = ROLE_CAPABILITIES[higherRole];
                for (const cap of lowerCaps) {
                    expect(higherCaps).toContain(cap);
                }
            });
        }
    });

    // -----------------------------------------------------------------
    // hasCapability
    // -----------------------------------------------------------------

    describe('hasCapability', () => {
        it('anonymous can read public requests', () => {
            expect(hasCapability('anonymous', 'read:public_requests')).toBe(true);
        });

        it('anonymous cannot create requests', () => {
            expect(hasCapability('anonymous', 'create:request')).toBe(false);
        });

        it('user can create and edit own requests', () => {
            expect(hasCapability('user', 'create:request')).toBe(true);
            expect(hasCapability('user', 'edit:own_request')).toBe(true);
        });

        it('volunteer can accept assignments', () => {
            expect(hasCapability('volunteer', 'accept:assignment')).toBe(true);
        });

        it('user cannot accept assignments', () => {
            expect(hasCapability('user', 'accept:assignment')).toBe(false);
        });

        it('moderator can moderate content', () => {
            expect(hasCapability('moderator', 'moderate:content')).toBe(true);
        });

        it('admin can manage roles', () => {
            expect(hasCapability('admin', 'admin:manage_roles')).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    // meetsRoleLevel
    // -----------------------------------------------------------------

    describe('meetsRoleLevel', () => {
        it('any role meets its own level', () => {
            for (const role of PLATFORM_ROLES) {
                expect(meetsRoleLevel(role, role)).toBe(true);
            }
        });

        it('super_admin meets all levels', () => {
            for (const role of PLATFORM_ROLES) {
                expect(meetsRoleLevel('super_admin', role)).toBe(true);
            }
        });

        it('anonymous does not meet user level', () => {
            expect(meetsRoleLevel('anonymous', 'user')).toBe(false);
        });

        it('user does not meet moderator level', () => {
            expect(meetsRoleLevel('user', 'moderator')).toBe(false);
        });

        it('admin meets moderator level', () => {
            expect(meetsRoleLevel('admin', 'moderator')).toBe(true);
        });

        it('moderator does not meet admin level', () => {
            expect(meetsRoleLevel('moderator', 'admin')).toBe(false);
        });

        it('volunteer meets user level', () => {
            expect(meetsRoleLevel('volunteer', 'user')).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    // isValidPlatformRole / isValidCapability
    // -----------------------------------------------------------------

    describe('isValidPlatformRole', () => {
        it.each(PLATFORM_ROLES)('accepts valid role "%s"', (role) => {
            expect(isValidPlatformRole(role)).toBe(true);
        });

        it('rejects invalid roles', () => {
            expect(isValidPlatformRole('superuser')).toBe(false);
            expect(isValidPlatformRole('')).toBe(false);
            expect(isValidPlatformRole('ADMIN')).toBe(false);
        });
    });

    describe('isValidCapability', () => {
        it.each(CAPABILITIES)('accepts valid capability "%s"', (cap) => {
            expect(isValidCapability(cap)).toBe(true);
        });

        it('rejects invalid capabilities', () => {
            expect(isValidCapability('fly:rockets')).toBe(false);
            expect(isValidCapability('')).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // getRoleLevel
    // -----------------------------------------------------------------

    describe('getRoleLevel', () => {
        it('anonymous has the lowest level (0)', () => {
            expect(getRoleLevel('anonymous')).toBe(0);
        });

        it('super_admin has the highest level', () => {
            const superLevel = getRoleLevel('super_admin');
            for (const role of PLATFORM_ROLES) {
                expect(superLevel).toBeGreaterThanOrEqual(getRoleLevel(role));
            }
        });

        it('role levels are strictly increasing', () => {
            const orderedRoles: PlatformRole[] = [
                'anonymous',
                'user',
                'verified_user',
                'volunteer',
                'moderator',
                'admin',
                'super_admin',
            ];
            for (let i = 1; i < orderedRoles.length; i++) {
                expect(getRoleLevel(orderedRoles[i])).toBeGreaterThan(
                    getRoleLevel(orderedRoles[i - 1]),
                );
            }
        });
    });
});
