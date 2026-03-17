import { describe, expect, it } from 'vitest';
import {
    TIER_DEFINITIONS,
    TIER_RANK,
    appendAuditEntry,
    canUpgrade,
    computeExpiryDate,
    createVerificationStatus,
    isExpired,
    needsRenewal,
    verificationAuditSchema,
    verificationStatusSchema,
    verificationTierSchema,
    type VerificationAudit,
    type VerificationStatus,
    type VerificationTier,
} from './verification.js';

const ADMIN_DID = 'did:example:admin';

const makeStatus = (
    tier: VerificationTier,
    opts: {
        expiresAt?: string | null;
        grantedAt?: string;
    } = {},
): VerificationStatus => {
    const grantedAt = opts.grantedAt ?? '2026-01-01T00:00:00.000Z';
    return {
        tier,
        grantedAt,
        expiresAt: opts.expiresAt !== undefined ? opts.expiresAt : '2026-07-01T00:00:00.000Z',
        verifiedBy: ADMIN_DID,
        auditTrail: [
            {
                action: 'grant',
                actor: ADMIN_DID,
                timestamp: grantedAt,
                reason: 'Initial grant',
                previousTier: 'unverified',
                newTier: tier,
            },
        ],
    };
};

// ---------------------------------------------------------------------------
// Tier rank ordering
// ---------------------------------------------------------------------------

describe('TIER_RANK ordering', () => {
    it('unverified < basic < verified < trusted < org_verified', () => {
        expect(TIER_RANK.unverified).toBeLessThan(TIER_RANK.basic);
        expect(TIER_RANK.basic).toBeLessThan(TIER_RANK.verified);
        expect(TIER_RANK.verified).toBeLessThan(TIER_RANK.trusted);
        expect(TIER_RANK.trusted).toBeLessThan(TIER_RANK.org_verified);
    });
});

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

describe('TIER_DEFINITIONS', () => {
    it('every tier has a definition', () => {
        const tiers: VerificationTier[] = [
            'unverified',
            'basic',
            'verified',
            'trusted',
            'org_verified',
        ];
        for (const tier of tiers) {
            expect(TIER_DEFINITIONS[tier]).toBeDefined();
            expect(TIER_DEFINITIONS[tier].tier).toBe(tier);
            expect(TIER_DEFINITIONS[tier].requirements.length).toBeGreaterThan(0);
        }
    });

    it('unverified tier has no checkpoints and no expiry', () => {
        const def = TIER_DEFINITIONS.unverified;
        expect(def.autoCheckpoints).toHaveLength(0);
        expect(def.manualCheckpoints).toHaveLength(0);
        expect(def.expiryDays).toBeNull();
    });

    it('verified tier has both auto and manual checkpoints', () => {
        const def = TIER_DEFINITIONS.verified;
        expect(def.autoCheckpoints.length).toBeGreaterThan(0);
        expect(def.manualCheckpoints.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// canUpgrade
// ---------------------------------------------------------------------------

describe('canUpgrade', () => {
    it('allows upgrade from unverified to basic when all checkpoints pass', () => {
        const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints.map(
            cp => cp.id,
        );
        expect(canUpgrade('unverified', 'basic', checkpoints)).toBe(true);
    });

    it('rejects upgrade when checkpoints are missing', () => {
        expect(canUpgrade('unverified', 'basic', [])).toBe(false);
    });

    it('rejects upgrade to the same tier', () => {
        expect(canUpgrade('basic', 'basic', [])).toBe(false);
    });

    it('rejects downgrade', () => {
        expect(canUpgrade('verified', 'basic', [])).toBe(false);
    });

    it('allows upgrade from basic to verified with all checkpoints', () => {
        const checkpoints = [
            ...TIER_DEFINITIONS.verified.autoCheckpoints.map(cp => cp.id),
            ...TIER_DEFINITIONS.verified.manualCheckpoints.map(cp => cp.id),
        ];
        expect(canUpgrade('basic', 'verified', checkpoints)).toBe(true);
    });

    it('allows upgrade from verified to trusted with all checkpoints', () => {
        const checkpoints = [
            ...TIER_DEFINITIONS.trusted.autoCheckpoints.map(cp => cp.id),
            ...TIER_DEFINITIONS.trusted.manualCheckpoints.map(cp => cp.id),
        ];
        expect(canUpgrade('verified', 'trusted', checkpoints)).toBe(true);
    });

    it('rejects upgrade from verified to trusted with partial checkpoints', () => {
        const partial = TIER_DEFINITIONS.trusted.autoCheckpoints
            .slice(0, 1)
            .map(cp => cp.id);
        expect(canUpgrade('verified', 'trusted', partial)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------

describe('isExpired', () => {
    it('returns false when expiresAt is null', () => {
        const status = makeStatus('unverified', { expiresAt: null });
        expect(isExpired(status)).toBe(false);
    });

    it('returns false when expiry is in the future', () => {
        const status = makeStatus('basic', {
            expiresAt: '2099-01-01T00:00:00.000Z',
        });
        expect(isExpired(status, new Date('2026-06-01T00:00:00.000Z'))).toBe(
            false,
        );
    });

    it('returns true when expiry is in the past', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-01-01T00:00:00.000Z',
        });
        expect(isExpired(status, new Date('2026-06-01T00:00:00.000Z'))).toBe(
            true,
        );
    });

    it('returns true when expiry is exactly now', () => {
        const now = new Date('2026-06-15T12:00:00.000Z');
        const status = makeStatus('basic', {
            expiresAt: now.toISOString(),
        });
        expect(isExpired(status, now)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// needsRenewal
// ---------------------------------------------------------------------------

describe('needsRenewal', () => {
    it('returns false when expiresAt is null', () => {
        const status = makeStatus('unverified', { expiresAt: null });
        expect(needsRenewal(status, 30)).toBe(false);
    });

    it('returns false when expiry is far in the future', () => {
        const status = makeStatus('basic', {
            expiresAt: '2099-01-01T00:00:00.000Z',
        });
        expect(
            needsRenewal(status, 30, new Date('2026-01-01T00:00:00.000Z')),
        ).toBe(false);
    });

    it('returns true when expiry is within the threshold', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-02-15T00:00:00.000Z',
        });
        expect(
            needsRenewal(status, 30, new Date('2026-02-01T00:00:00.000Z')),
        ).toBe(true);
    });

    it('returns true when already expired (expiry in the past)', () => {
        const status = makeStatus('basic', {
            expiresAt: '2026-01-01T00:00:00.000Z',
        });
        expect(
            needsRenewal(status, 30, new Date('2026-03-01T00:00:00.000Z')),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// computeExpiryDate
// ---------------------------------------------------------------------------

describe('computeExpiryDate', () => {
    it('returns null for unverified tier', () => {
        expect(computeExpiryDate('unverified')).toBeNull();
    });

    it('returns a date 365 days out for basic tier', () => {
        const base = new Date('2026-01-01T00:00:00.000Z');
        const expiry = computeExpiryDate('basic', base);
        expect(expiry).not.toBeNull();
        const expiryDate = new Date(expiry!);
        const diffDays = Math.round(
            (expiryDate.getTime() - base.getTime()) / (24 * 60 * 60 * 1000),
        );
        expect(diffDays).toBe(365);
    });

    it('returns a date 180 days out for verified tier', () => {
        const base = new Date('2026-01-01T00:00:00.000Z');
        const expiry = computeExpiryDate('verified', base);
        expect(expiry).not.toBeNull();
        const expiryDate = new Date(expiry!);
        const diffDays = Math.round(
            (expiryDate.getTime() - base.getTime()) / (24 * 60 * 60 * 1000),
        );
        expect(diffDays).toBe(180);
    });
});

// ---------------------------------------------------------------------------
// createVerificationStatus
// ---------------------------------------------------------------------------

describe('createVerificationStatus', () => {
    it('creates a valid status with correct audit trail', () => {
        const now = new Date('2026-03-01T12:00:00.000Z');
        const status = createVerificationStatus(
            'basic',
            ADMIN_DID,
            'Initial verification',
            'unverified',
            now,
        );

        expect(status.tier).toBe('basic');
        expect(status.grantedAt).toBe(now.toISOString());
        expect(status.verifiedBy).toBe(ADMIN_DID);
        expect(status.expiresAt).not.toBeNull();
        expect(status.auditTrail).toHaveLength(1);
        expect(status.auditTrail[0]!.action).toBe('grant');
        expect(status.auditTrail[0]!.previousTier).toBe('unverified');
        expect(status.auditTrail[0]!.newTier).toBe('basic');

        // Should also pass schema validation
        const parsed = verificationStatusSchema.safeParse(status);
        expect(parsed.success).toBe(true);
    });

    it('unverified tier status has null expiresAt', () => {
        const status = createVerificationStatus(
            'unverified',
            ADMIN_DID,
            'Reset',
        );
        expect(status.expiresAt).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// appendAuditEntry
// ---------------------------------------------------------------------------

describe('appendAuditEntry', () => {
    it('appends without mutating the original', () => {
        const original = makeStatus('basic');
        const entry: VerificationAudit = {
            action: 'renew',
            actor: ADMIN_DID,
            timestamp: '2026-06-01T00:00:00.000Z',
            reason: 'Routine renewal',
            previousTier: 'basic',
            newTier: 'basic',
        };

        const updated = appendAuditEntry(original, entry);

        expect(updated.auditTrail).toHaveLength(2);
        expect(original.auditTrail).toHaveLength(1); // original unchanged
        expect(updated.auditTrail[1]).toEqual(entry);
    });
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe('Zod schema validation', () => {
    it('verificationTierSchema accepts all valid tiers', () => {
        for (const tier of [
            'unverified',
            'basic',
            'verified',
            'trusted',
            'org_verified',
        ]) {
            expect(verificationTierSchema.safeParse(tier).success).toBe(true);
        }
    });

    it('verificationTierSchema rejects invalid values', () => {
        expect(verificationTierSchema.safeParse('super').success).toBe(false);
        expect(verificationTierSchema.safeParse('').success).toBe(false);
        expect(verificationTierSchema.safeParse(42).success).toBe(false);
    });

    it('verificationAuditSchema validates a correct audit entry', () => {
        const entry: VerificationAudit = {
            action: 'grant',
            actor: ADMIN_DID,
            timestamp: '2026-03-01T12:00:00.000Z',
            reason: 'Passed all checkpoints',
            previousTier: 'unverified',
            newTier: 'basic',
        };

        const result = verificationAuditSchema.safeParse(entry);
        expect(result.success).toBe(true);
    });

    it('verificationAuditSchema rejects empty reason', () => {
        const entry = {
            action: 'grant',
            actor: ADMIN_DID,
            timestamp: '2026-03-01T12:00:00.000Z',
            reason: '',
            previousTier: 'unverified',
            newTier: 'basic',
        };

        const result = verificationAuditSchema.safeParse(entry);
        expect(result.success).toBe(false);
    });
});
