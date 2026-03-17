// ---------------------------------------------------------------------------
// Reputation and reliability scoring
// ---------------------------------------------------------------------------

/**
 * Raw signals used to compute a user's reputation score.
 * Collected from handoff outcomes, feedback ratings, response times,
 * account metadata, and moderation history.
 */
export interface ReputationSignals {
    completedHandoffs: number;
    totalHandoffs: number;
    averageRating: number;
    ratingCount: number;
    responseTimeAvgMs: number;
    accountAgeDays: number;
    verificationTier: string;
    moderationActions: number;
    cancelledRequests: number;
}

/**
 * Trust levels ordered from lowest to highest.
 */
export const TRUST_LEVELS = [
    'new',
    'emerging',
    'established',
    'trusted',
    'exemplary',
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

/**
 * Computed reputation score derived from ReputationSignals.
 */
export interface ReputationScore {
    overall: number;
    reliability: number;
    responsiveness: number;
    communityRating: number;
    trustLevel: TrustLevel;
    computedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum completed interactions before a numeric score is meaningful. */
export const MIN_INTERACTIONS_FOR_SCORE = 3;

/** Minimum ratings received before community rating is displayed. */
export const MIN_RATINGS_FOR_DISPLAY = 2;

/** Overall score thresholds for each trust level. */
export const TRUST_LEVEL_THRESHOLDS: Readonly<Record<TrustLevel, number>> = {
    new: 0,
    emerging: 20,
    established: 40,
    trusted: 60,
    exemplary: 80,
};

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const WEIGHT_RELIABILITY = 0.4;
const WEIGHT_RESPONSIVENESS = 0.2;
const WEIGHT_COMMUNITY = 0.3;
const WEIGHT_TRUST_BONUS = 0.1;

// ---------------------------------------------------------------------------
// Responsiveness bounds
// ---------------------------------------------------------------------------

/** Response time at or below this threshold yields a perfect responsiveness score. */
const RESPONSE_TIME_BEST_MS = 5 * 60 * 1000; // 5 minutes

/** Response time at or above this threshold yields zero responsiveness score. */
const RESPONSE_TIME_WORST_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Verification tier bonuses (0-100 scale contribution)
// ---------------------------------------------------------------------------

const VERIFICATION_TIER_BONUS: Readonly<Record<string, number>> = {
    none: 0,
    basic: 20,
    community: 40,
    partner: 60,
    full: 80,
};

// ---------------------------------------------------------------------------
// Moderation penalty
// ---------------------------------------------------------------------------

/** Points deducted from the overall score per moderation action. */
const MODERATION_PENALTY_PER_ACTION = 10;

// ---------------------------------------------------------------------------
// Account age bonus
// ---------------------------------------------------------------------------

/** Account age (in days) at which the age bonus is maximized. */
const ACCOUNT_AGE_MAX_BONUS_DAYS = 365;

// ---------------------------------------------------------------------------
// Scoring algorithm
// ---------------------------------------------------------------------------

/**
 * Compute the reliability sub-score (0-100).
 *
 * Based on completion ratio, penalized by cancellation rate.
 */
function computeReliability(signals: ReputationSignals): number {
    if (signals.totalHandoffs === 0) {
        return 0;
    }

    const completionRatio = signals.completedHandoffs / signals.totalHandoffs;
    const cancellationRatio = signals.cancelledRequests / signals.totalHandoffs;
    const penalizedRatio = Math.max(0, completionRatio - cancellationRatio * 0.5);

    return Math.round(clamp(penalizedRatio * 100, 0, 100));
}

/**
 * Compute the responsiveness sub-score (0-100).
 *
 * Inverse of average response time, linearly interpolated between
 * RESPONSE_TIME_BEST_MS (100) and RESPONSE_TIME_WORST_MS (0).
 */
function computeResponsiveness(signals: ReputationSignals): number {
    if (signals.totalHandoffs === 0 || signals.responseTimeAvgMs <= 0) {
        return 0;
    }

    const clamped = clamp(
        signals.responseTimeAvgMs,
        RESPONSE_TIME_BEST_MS,
        RESPONSE_TIME_WORST_MS,
    );

    const range = RESPONSE_TIME_WORST_MS - RESPONSE_TIME_BEST_MS;
    const score = ((RESPONSE_TIME_WORST_MS - clamped) / range) * 100;

    return Math.round(clamp(score, 0, 100));
}

/**
 * Compute the community rating sub-score (0-100).
 *
 * Normalizes the 1-5 average rating to 0-100.
 * Returns 0 if insufficient ratings.
 */
function computeCommunityRating(signals: ReputationSignals): number {
    if (signals.ratingCount < MIN_RATINGS_FOR_DISPLAY) {
        return 0;
    }

    const normalized = ((signals.averageRating - 1) / 4) * 100;
    return Math.round(clamp(normalized, 0, 100));
}

/**
 * Compute the trust bonus sub-score (0-100).
 *
 * Combines account age bonus (50%) and verification tier bonus (50%).
 */
function computeTrustBonus(signals: ReputationSignals): number {
    const ageFraction = Math.min(signals.accountAgeDays / ACCOUNT_AGE_MAX_BONUS_DAYS, 1);
    const ageBonus = ageFraction * 100;

    const tierBonus = VERIFICATION_TIER_BONUS[signals.verificationTier] ?? 0;

    return Math.round(clamp((ageBonus * 0.5 + tierBonus * 0.5), 0, 100));
}

/**
 * Determine trust level from an overall score.
 */
function determineTrustLevel(overall: number): TrustLevel {
    if (overall >= TRUST_LEVEL_THRESHOLDS.exemplary) return 'exemplary';
    if (overall >= TRUST_LEVEL_THRESHOLDS.trusted) return 'trusted';
    if (overall >= TRUST_LEVEL_THRESHOLDS.established) return 'established';
    if (overall >= TRUST_LEVEL_THRESHOLDS.emerging) return 'emerging';
    return 'new';
}

/**
 * Clamp a number between min and max.
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Compute a full reputation score from raw signals.
 *
 * Users with fewer than MIN_INTERACTIONS_FOR_SCORE total handoffs
 * receive a default "new" trust level with zeroed numeric scores.
 */
export function computeReputation(signals: ReputationSignals): ReputationScore {
    const now = new Date().toISOString();

    // New users with insufficient interactions get a default score
    if (signals.totalHandoffs < MIN_INTERACTIONS_FOR_SCORE) {
        return {
            overall: 0,
            reliability: 0,
            responsiveness: 0,
            communityRating: 0,
            trustLevel: 'new',
            computedAt: now,
        };
    }

    const reliability = computeReliability(signals);
    const responsiveness = computeResponsiveness(signals);
    const communityRating = computeCommunityRating(signals);
    const trustBonus = computeTrustBonus(signals);

    // Weighted composite
    const rawOverall =
        reliability * WEIGHT_RELIABILITY +
        responsiveness * WEIGHT_RESPONSIVENESS +
        communityRating * WEIGHT_COMMUNITY +
        trustBonus * WEIGHT_TRUST_BONUS;

    // Apply moderation penalties
    const penalty = signals.moderationActions * MODERATION_PENALTY_PER_ACTION;
    const overall = Math.round(clamp(rawOverall - penalty, 0, 100));

    return {
        overall,
        reliability,
        responsiveness,
        communityRating,
        trustLevel: determineTrustLevel(overall),
        computedAt: now,
    };
}

// ---------------------------------------------------------------------------
// Human-readable labels
// ---------------------------------------------------------------------------

export const TRUST_LEVEL_LABELS: Readonly<Record<TrustLevel, string>> = {
    new: 'New',
    emerging: 'Emerging',
    established: 'Established',
    trusted: 'Trusted',
    exemplary: 'Exemplary',
};

export const TRUST_LEVEL_TONES: Readonly<
    Record<TrustLevel, 'neutral' | 'info' | 'success'>
> = {
    new: 'neutral',
    emerging: 'neutral',
    established: 'info',
    trusted: 'success',
    exemplary: 'success',
};
