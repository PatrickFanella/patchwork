import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

export const recordOrigins = [
    'synthetic',
    'sourced-public',
    'visitor-created',
] as const;

export type RecordOrigin = (typeof recordOrigins)[number];

const sourceProvenanceSchema = z
    .object({
        sourceUrl: z.string().url(),
        sourceName: z.string().min(1).max(200),
        retrievedAt: isoDateTimeSchema,
        lastVerifiedAt: isoDateTimeSchema,
        nonParticipationDisclosure: z.literal(true),
    })
    .strict();

/**
 * Private, server-authored metadata. It is never accepted as part of a visitor
 * record mutation or published in a user-owned AT record.
 */
export const serverRecordMetadataSchema = z
    .discriminatedUnion('origin', [
        z
            .object({
                origin: z.literal('synthetic'),
                assignedBy: z.literal('system'),
                assignedAt: isoDateTimeSchema,
                seedVersion: z.string().min(1).max(64),
            })
            .strict(),
        z
            .object({
                origin: z.literal('sourced-public'),
                assignedBy: z.literal('system'),
                assignedAt: isoDateTimeSchema,
                provenance: sourceProvenanceSchema,
            })
            .strict(),
        z
            .object({
                origin: z.literal('visitor-created'),
                assignedBy: z.literal('system'),
                assignedAt: isoDateTimeSchema,
                actorDid: didSchema,
            })
            .strict(),
    ]);

export type ServerRecordMetadata = z.infer<typeof serverRecordMetadataSchema>;

/**
 * The browser may submit content only. Strict parsing makes server-controlled
 * origin, verification, approval, and authorship fields unforgeable.
 */
export const visitorContentMutationSchema = z
    .object({
        content: z.record(z.string(), z.unknown()),
    })
    .strict();

export const approximatePersonalLocationSchema = z
    .object({
        kind: z.literal('approximate-personal'),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        precisionKm: z.number().min(1).max(50),
        areaLabel: z.string().min(1).max(120).optional(),
        noPermanentAddress: z.boolean().default(false),
    })
    .strict();

export const noPermanentAddressSchema = z
    .object({
        kind: z.literal('no-permanent-address'),
        serviceArea: z.string().min(1).max(120),
        noPermanentAddress: z.literal(true),
    })
    .strict();

export const exactPublicResourceLocationSchema = z
    .object({
        kind: z.literal('exact-public-resource'),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        streetAddress: z.string().min(1).max(300),
        organizationVerification: z.literal('active'),
        resourceVerification: z.literal('active'),
        moderatorApproval: z.literal('active'),
        confidentialFacility: z.literal(false),
        approvalExpiresAt: isoDateTimeSchema,
    })
    .strict()
    .refine(value => Date.parse(value.approvalExpiresAt) > Date.now(), {
        message: 'Exact public-resource approval must be unexpired.',
        path: ['approvalExpiresAt'],
    });

export const publicLocationSchema = z.union([
    approximatePersonalLocationSchema,
    noPermanentAddressSchema,
    exactPublicResourceLocationSchema,
]);

export type PublicLocation = z.infer<typeof publicLocationSchema>;

/**
 * Signaling authorizes a peer session but never carries a coordinate.
 */
export const exactLocationSignalSessionSchema = z
    .object({
        sessionId: z.string().uuid(),
        connectionId: z.string().uuid(),
        participantDids: z.tuple([didSchema, didSchema]),
        consentedDids: z.tuple([didSchema, didSchema]),
        issuedAt: isoDateTimeSchema,
        expiresAt: isoDateTimeSchema,
        singleUse: z.literal(true),
        status: z.enum(['pending', 'active', 'revoked', 'expired']),
    })
    .strict()
    .superRefine((value, context) => {
        if (new Set(value.participantDids).size !== 2) {
            context.addIssue({
                code: 'custom',
                message: 'A connection requires two distinct participants.',
                path: ['participantDids'],
            });
        }
        if (
            value.consentedDids.some(
                did => !value.participantDids.includes(did),
            ) ||
            new Set(value.consentedDids).size !== 2
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Fresh consent is required from both participants.',
                path: ['consentedDids'],
            });
        }
        const lifetime =
            Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
        if (lifetime <= 0 || lifetime > 5 * 60 * 1000) {
            context.addIssue({
                code: 'custom',
                message: 'Signal sessions expire within five minutes.',
                path: ['expiresAt'],
            });
        }
    });

/**
 * This payload exists only in bounded browser memory and may be sent only over
 * the authenticated WebRTC data channel.
 */
export const transientPeerExactLocationSchema = z
    .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        capturedAt: isoDateTimeSchema,
    })
    .strict();

export const policyConsentSchema = z
    .object({
        subjectDid: didSchema,
        policyVersion: z.string().min(1).max(64),
        acceptedAt: isoDateTimeSchema,
        eligibility: z
            .object({
                minimumAge: z.literal(18),
                asserted18OrOlder: z.literal(true),
            })
            .strict(),
    })
    .strict();
