import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

export const organizationOriginValues = [
    'synthetic',
    'sourced-public',
    'visitor-created',
] as const;
export const organizationOriginSchema = z.enum(organizationOriginValues);
export type OrganizationOrigin = z.infer<typeof organizationOriginSchema>;

export const organizationRoleValues = [
    'owner',
    'admin',
    'steward',
    'member',
] as const;
export const organizationRoleSchema = z.enum(organizationRoleValues);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const organizationRoleRank: Readonly<
    Record<OrganizationRole, number>
> = {
    member: 0,
    steward: 1,
    admin: 2,
    owner: 3,
};

export const organizationPublicProfileSchema = z
    .object({
        id: z.string().uuid(),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        name: z.string().min(1).max(160),
        description: z.string().max(2000),
        origin: organizationOriginSchema,
        provenance: z
            .object({
                sourceUrl: z.string().url(),
                retrievedAt: isoDateTimeSchema,
                lastVerifiedAt: isoDateTimeSchema,
            })
            .strict()
            .nullable(),
        nonEndorsementLabel: z.string().min(1).max(300),
        createdAt: isoDateTimeSchema,
        updatedAt: isoDateTimeSchema,
    })
    .strict()
    .superRefine((value, context) => {
        if (
            value.origin === 'sourced-public' &&
            value.provenance === null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['provenance'],
                message: 'Sourced public organizations require provenance.',
            });
        }
        if (
            value.origin !== 'sourced-public' &&
            value.provenance !== null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['provenance'],
                message:
                    'Only sourced public organizations may carry source provenance.',
            });
        }
    });
export type OrganizationPublicProfile = z.infer<
    typeof organizationPublicProfileSchema
>;

export const organizationMembershipSchema = z
    .object({
        organizationId: z.string().uuid(),
        memberDid: didSchema,
        role: organizationRoleSchema,
        status: z.enum(['active', 'removed']),
        invitedByDid: didSchema,
        joinedAt: isoDateTimeSchema,
        updatedAt: isoDateTimeSchema,
    })
    .strict();
export type OrganizationMembership = z.infer<
    typeof organizationMembershipSchema
>;

export const resourceStewardshipSchema = z
    .object({
        id: z.string().uuid(),
        organizationId: z.string().uuid(),
        resourceUri: z
            .string()
            .regex(
                /^at:\/\/did:[^/]+\/app\.patchwork\.directory\.resource\/[^/]+$/,
            ),
        stewardDid: didSchema,
        status: z.enum(['active', 'due', 'expired', 'revoked']),
        lastReconfirmedAt: isoDateTimeSchema,
        reconfirmDueAt: isoDateTimeSchema,
        createdAt: isoDateTimeSchema,
        updatedAt: isoDateTimeSchema,
    })
    .strict();
export type ResourceStewardship = z.infer<typeof resourceStewardshipSchema>;

export const organizationInvitationSchema = z
    .object({
        id: z.string().uuid(),
        organizationId: z.string().uuid(),
        inviteeDid: didSchema,
        role: z.enum(['admin', 'steward', 'member']),
        status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
        invitedByDid: didSchema,
        expiresAt: isoDateTimeSchema,
        createdAt: isoDateTimeSchema,
        acceptedAt: isoDateTimeSchema.nullable(),
    })
    .strict();
export type OrganizationInvitation = z.infer<
    typeof organizationInvitationSchema
>;

export const organizationNonEndorsementLabel =
    'Listed for public information. Patchwork does not endorse or guarantee this organization.';
