import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export const verificationTierValues = [
    'unverified',
    'basic',
    'verified',
    'trusted',
    'org_verified',
] as const;

export const verificationTierSchema = z.enum(verificationTierValues);

export type VerificationTier = z.infer<typeof verificationTierSchema>;

/** Numeric ordering so comparisons are simple: higher = more trusted. */
export const TIER_RANK: Readonly<Record<VerificationTier, number>> = {
    unverified: 0,
    basic: 1,
    verified: 2,
    trusted: 3,
    org_verified: 4,
};

// ---------------------------------------------------------------------------
// Tier criteria
// ---------------------------------------------------------------------------

export interface TierCheckpoint {
    id: string;
    label: string;
    description: string;
}

export interface TierCriteria {
    tier: VerificationTier;
    requirements: string[];
    autoCheckpoints: TierCheckpoint[];
    manualCheckpoints: TierCheckpoint[];
    expiryDays: number | null; // null = never expires
}

export const TIER_DEFINITIONS: Readonly<Record<VerificationTier, TierCriteria>> = {
    unverified: {
        tier: 'unverified',
        requirements: ['Account exists'],
        autoCheckpoints: [],
        manualCheckpoints: [],
        expiryDays: null,
    },
    basic: {
        tier: 'basic',
        requirements: [
            'Email verified',
            'Profile completed (display name, at least one capability)',
        ],
        autoCheckpoints: [
            {
                id: 'email_verified',
                label: 'Email verification',
                description: 'User has verified their email address.',
            },
            {
                id: 'profile_complete',
                label: 'Profile completion',
                description:
                    'User has filled in display name, capabilities, and availability.',
            },
        ],
        manualCheckpoints: [],
        expiryDays: 365,
    },
    verified: {
        tier: 'verified',
        requirements: [
            'Identity check approved',
            'Safety training completed',
            'At least one community reference',
        ],
        autoCheckpoints: [
            {
                id: 'safety_training_complete',
                label: 'Safety training',
                description:
                    'User has completed the platform safety training module.',
            },
        ],
        manualCheckpoints: [
            {
                id: 'identity_check',
                label: 'Identity check',
                description:
                    'An admin or automated system has verified the user identity.',
            },
            {
                id: 'community_reference',
                label: 'Community reference',
                description:
                    'At least one community member has vouched for this volunteer.',
            },
        ],
        expiryDays: 180,
    },
    trusted: {
        tier: 'trusted',
        requirements: [
            'All "verified" requirements met',
            'Minimum 30 days at verified tier',
            'At least 10 successful aid interactions',
            'No moderation actions on record',
        ],
        autoCheckpoints: [
            {
                id: 'tenure_check',
                label: 'Tenure at verified tier',
                description:
                    'User has maintained verified status for at least 30 days.',
            },
            {
                id: 'interaction_count',
                label: 'Aid interaction count',
                description:
                    'User has completed at least 10 successful aid interactions.',
            },
            {
                id: 'moderation_clear',
                label: 'Moderation record clear',
                description:
                    'User has no outstanding moderation actions.',
            },
        ],
        manualCheckpoints: [
            {
                id: 'admin_endorsement',
                label: 'Admin endorsement',
                description:
                    'A platform admin has reviewed and endorsed the upgrade.',
            },
        ],
        expiryDays: 365,
    },
    org_verified: {
        tier: 'org_verified',
        requirements: [
            'Organisation identity verified by platform team',
            'Organisation has a designated admin contact',
            'Signed partner agreement on file',
        ],
        autoCheckpoints: [],
        manualCheckpoints: [
            {
                id: 'org_identity_check',
                label: 'Organisation identity verification',
                description:
                    'Platform team has verified the organisation via official documents.',
            },
            {
                id: 'partner_agreement',
                label: 'Partner agreement',
                description:
                    'Signed partner/MoU agreement is on file.',
            },
        ],
        expiryDays: 365,
    },
};

// ---------------------------------------------------------------------------
// Verification action & audit types
// ---------------------------------------------------------------------------

export const verificationActionValues = [
    'grant',
    'revoke',
    'renew',
    'appeal',
    'escalate',
] as const;

export const verificationActionSchema = z.enum(verificationActionValues);

export type VerificationAction = z.infer<typeof verificationActionSchema>;

export const verificationAuditSchema = z.object({
    action: verificationActionSchema,
    actor: didSchema,
    timestamp: isoDateTimeSchema,
    reason: z.string().min(1).max(1000),
    previousTier: verificationTierSchema,
    newTier: verificationTierSchema,
});

export type VerificationAudit = z.infer<typeof verificationAuditSchema>;

// ---------------------------------------------------------------------------
// Verification status
// ---------------------------------------------------------------------------

export const verificationStatusSchema = z.object({
    tier: verificationTierSchema,
    grantedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.nullable(),
    verifiedBy: didSchema,
    auditTrail: z.array(verificationAuditSchema),
});

export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

// ---------------------------------------------------------------------------
// Appeal types
// ---------------------------------------------------------------------------

export const appealStatusValues = [
    'pending',
    'under_review',
    'approved',
    'denied',
] as const;

export const appealStatusSchema = z.enum(appealStatusValues);

export type AppealStatus = z.infer<typeof appealStatusSchema>;

export const verificationAppealSchema = z.object({
    id: z.string().min(1),
    subjectDid: didSchema,
    currentTier: verificationTierSchema,
    requestedTier: verificationTierSchema,
    reason: z.string().min(1).max(2000),
    status: appealStatusSchema,
    createdAt: isoDateTimeSchema,
    resolvedAt: isoDateTimeSchema.optional(),
    resolvedBy: didSchema.optional(),
    resolutionNote: z.string().max(2000).optional(),
});

export type VerificationAppeal = z.infer<typeof verificationAppealSchema>;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Determines whether the `currentTier` can be upgraded to `targetTier` given
 * that all supplied `passedCheckpointIds` have been satisfied.
 *
 * Rules:
 *  - Cannot upgrade to the same or lower tier.
 *  - All auto + manual checkpoint ids for the target tier must be present in
 *    `passedCheckpointIds`.
 */
export const canUpgrade = (
    currentTier: VerificationTier,
    targetTier: VerificationTier,
    passedCheckpointIds: readonly string[],
): boolean => {
    if (TIER_RANK[targetTier] <= TIER_RANK[currentTier]) {
        return false;
    }

    const criteria = TIER_DEFINITIONS[targetTier];
    const passedSet = new Set(passedCheckpointIds);

    const allCheckpointIds = [
        ...criteria.autoCheckpoints.map(cp => cp.id),
        ...criteria.manualCheckpoints.map(cp => cp.id),
    ];

    return allCheckpointIds.every(id => passedSet.has(id));
};

/**
 * Returns `true` when the verification status has an expiry date that is in
 * the past relative to `now`.
 */
export const isExpired = (
    status: VerificationStatus,
    now: Date = new Date(),
): boolean => {
    if (status.expiresAt === null) {
        return false;
    }

    return new Date(status.expiresAt).getTime() <= now.getTime();
};

/**
 * Returns `true` when the verification status will expire within
 * `daysThreshold` days from `now`.
 */
export const needsRenewal = (
    status: VerificationStatus,
    daysThreshold: number = 30,
    now: Date = new Date(),
): boolean => {
    if (status.expiresAt === null) {
        return false;
    }

    const expiresMs = new Date(status.expiresAt).getTime();
    const thresholdMs = now.getTime() + daysThreshold * 24 * 60 * 60 * 1000;

    return expiresMs <= thresholdMs;
};

/**
 * Computes the expiry date from a given start date and the tier definition.
 * Returns `null` for tiers that do not expire.
 */
export const computeExpiryDate = (
    tier: VerificationTier,
    grantedAt: Date = new Date(),
): string | null => {
    const criteria = TIER_DEFINITIONS[tier];
    if (criteria.expiryDays === null) {
        return null;
    }

    const expiry = new Date(grantedAt);
    expiry.setDate(expiry.getDate() + criteria.expiryDays);
    return expiry.toISOString();
};

/**
 * Creates a new `VerificationStatus` for a subject that has just been granted
 * a tier.
 */
export const createVerificationStatus = (
    tier: VerificationTier,
    verifiedBy: string,
    reason: string,
    previousTier: VerificationTier = 'unverified',
    now: Date = new Date(),
): VerificationStatus => {
    const grantedAt = now.toISOString();
    const expiresAt = computeExpiryDate(tier, now);

    return verificationStatusSchema.parse({
        tier,
        grantedAt,
        expiresAt,
        verifiedBy,
        auditTrail: [
            {
                action: 'grant' as const,
                actor: verifiedBy,
                timestamp: grantedAt,
                reason,
                previousTier,
                newTier: tier,
            },
        ],
    });
};

/**
 * Appends an audit entry to an existing verification status and returns the
 * updated status. The original object is not mutated.
 */
export const appendAuditEntry = (
    status: VerificationStatus,
    entry: VerificationAudit,
): VerificationStatus => {
    return {
        ...status,
        auditTrail: [...status.auditTrail, entry],
    };
};
