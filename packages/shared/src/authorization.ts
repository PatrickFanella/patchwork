/**
 * Platform-wide role and capability model.
 *
 * Defines the hierarchical role system and fine-grained capabilities
 * that gate access to platform features. This module is shared across
 * API services and the web shell so authorization logic stays consistent.
 */

// ---------------------------------------------------------------------------
// Platform roles (ordered from least to most privileged)
// ---------------------------------------------------------------------------

export const PLATFORM_ROLES = [
    'anonymous',
    'user',
    'verified_user',
    'volunteer',
    'moderator',
    'admin',
    'super_admin',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
    'read:public_requests',
    'create:request',
    'edit:own_request',
    'delete:own_request',
    'read:messages',
    'send:message',
    'accept:assignment',
    'complete:handoff',
    'submit:feedback',
    'read:own_profile',
    'edit:own_profile',
    'read:inbox',
    'moderate:content',
    'moderate:users',
    'admin:manage_roles',
    'admin:system_config',
    'admin:view_audit',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// ---------------------------------------------------------------------------
// Role -> capability mapping
// ---------------------------------------------------------------------------

const ANONYMOUS_CAPABILITIES: readonly Capability[] = [
    'read:public_requests',
];

const USER_CAPABILITIES: readonly Capability[] = [
    ...ANONYMOUS_CAPABILITIES,
    'create:request',
    'edit:own_request',
    'delete:own_request',
    'read:messages',
    'send:message',
    'submit:feedback',
    'read:own_profile',
    'edit:own_profile',
    'read:inbox',
];

const VERIFIED_USER_CAPABILITIES: readonly Capability[] = [
    ...USER_CAPABILITIES,
];

const VOLUNTEER_CAPABILITIES: readonly Capability[] = [
    ...VERIFIED_USER_CAPABILITIES,
    'accept:assignment',
    'complete:handoff',
];

const MODERATOR_CAPABILITIES: readonly Capability[] = [
    ...VOLUNTEER_CAPABILITIES,
    'moderate:content',
    'moderate:users',
];

const ADMIN_CAPABILITIES: readonly Capability[] = [
    ...MODERATOR_CAPABILITIES,
    'admin:manage_roles',
    'admin:system_config',
    'admin:view_audit',
];

const SUPER_ADMIN_CAPABILITIES: readonly Capability[] = [
    ...ADMIN_CAPABILITIES,
];

export const ROLE_CAPABILITIES: Readonly<Record<PlatformRole, readonly Capability[]>> = {
    anonymous: ANONYMOUS_CAPABILITIES,
    user: USER_CAPABILITIES,
    verified_user: VERIFIED_USER_CAPABILITIES,
    volunteer: VOLUNTEER_CAPABILITIES,
    moderator: MODERATOR_CAPABILITIES,
    admin: ADMIN_CAPABILITIES,
    super_admin: SUPER_ADMIN_CAPABILITIES,
};

// ---------------------------------------------------------------------------
// Role hierarchy level (index in PLATFORM_ROLES)
// ---------------------------------------------------------------------------

const ROLE_LEVEL: Readonly<Record<PlatformRole, number>> = {
    anonymous: 0,
    user: 1,
    verified_user: 2,
    volunteer: 3,
    moderator: 4,
    admin: 5,
    super_admin: 6,
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the given role has a specific capability.
 */
export function hasCapability(role: PlatformRole, capability: Capability): boolean {
    return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * Check whether `role` meets or exceeds a minimum role level.
 */
export function meetsRoleLevel(role: PlatformRole, minimumRole: PlatformRole): boolean {
    return ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];
}

/**
 * Check if a string is a valid PlatformRole.
 */
export function isValidPlatformRole(value: string): value is PlatformRole {
    return PLATFORM_ROLES.includes(value as PlatformRole);
}

/**
 * Check if a string is a valid Capability.
 */
export function isValidCapability(value: string): value is Capability {
    return CAPABILITIES.includes(value as Capability);
}

/**
 * Get the numeric privilege level for a role (higher = more privileged).
 */
export function getRoleLevel(role: PlatformRole): number {
    return ROLE_LEVEL[role];
}
