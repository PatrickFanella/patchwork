import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Org roles
// ---------------------------------------------------------------------------

export const orgRoleValues = ['owner', 'admin', 'member', 'viewer'] as const;
export const orgRoleSchema = z.enum(orgRoleValues);
export type OrgRole = z.infer<typeof orgRoleSchema>;

/** Numeric ordering: higher = more privileged. */
export const ORG_ROLE_RANK: Readonly<Record<OrgRole, number>> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
};

// ---------------------------------------------------------------------------
// Org member
// ---------------------------------------------------------------------------

export const orgMemberSchema = z.object({
    did: didSchema,
    handle: z.string().min(1),
    role: orgRoleSchema,
    joinedAt: isoDateTimeSchema,
    invitedBy: didSchema,
});

export type OrgMember = z.infer<typeof orgMemberSchema>;

// ---------------------------------------------------------------------------
// Org service listing
// ---------------------------------------------------------------------------

export const orgServiceStatusValues = [
    'active',
    'paused',
    'discontinued',
] as const;
export const orgServiceStatusSchema = z.enum(orgServiceStatusValues);
export type OrgServiceStatus = z.infer<typeof orgServiceStatusSchema>;

export const orgServiceListingSchema = z.object({
    serviceId: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    status: orgServiceStatusSchema,
    capacity: z.number().int().nonnegative().nullable(),
    constraints: z.string().max(2000).nullable(),
});

export type OrgServiceListing = z.infer<typeof orgServiceListingSchema>;

// ---------------------------------------------------------------------------
// Org audit entry
// ---------------------------------------------------------------------------

export const orgAuditActionValues = [
    'member_invited',
    'member_removed',
    'member_role_changed',
    'service_upserted',
    'service_status_changed',
    'org_created',
] as const;
export const orgAuditActionSchema = z.enum(orgAuditActionValues);
export type OrgAuditAction = z.infer<typeof orgAuditActionSchema>;

export const orgAuditEntrySchema = z.object({
    action: orgAuditActionSchema,
    actor: didSchema,
    target: z.string().min(1),
    timestamp: isoDateTimeSchema,
    details: z.string().max(2000),
});

export type OrgAuditEntry = z.infer<typeof orgAuditEntrySchema>;

// ---------------------------------------------------------------------------
// Org profile
// ---------------------------------------------------------------------------

export const orgProfileSchema = z.object({
    orgDid: didSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000),
    members: z.array(orgMemberSchema),
    services: z.array(orgServiceListingSchema),
    createdAt: isoDateTimeSchema,
});

export type OrgProfile = z.infer<typeof orgProfileSchema>;

// ---------------------------------------------------------------------------
// Org performance metrics
// ---------------------------------------------------------------------------

export const orgPerformanceMetricsSchema = z.object({
    requestsHandled: z.number().int().nonnegative(),
    avgResponseTimeMs: z.number().nonnegative(),
    activeVolunteers: z.number().int().nonnegative(),
    satisfactionRate: z.number().min(0).max(1),
});

export type OrgPerformanceMetrics = z.infer<typeof orgPerformanceMetricsSchema>;
