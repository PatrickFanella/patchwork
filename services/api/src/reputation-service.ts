import type {
    ReputationScore,
    ReputationSignals,
    HandoffOutcome,
    TrustLevel,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local scoring implementation (avoids cross-workspace runtime import issues)
// ---------------------------------------------------------------------------

const MIN_INTERACTIONS_FOR_SCORE = 3;
const MIN_RATINGS_FOR_DISPLAY = 2;

const WEIGHT_RELIABILITY = 0.4;
const WEIGHT_RESPONSIVENESS = 0.2;
const WEIGHT_COMMUNITY = 0.3;
const WEIGHT_TRUST_BONUS = 0.1;

const RESPONSE_TIME_BEST_MS = 5 * 60 * 1000;
const RESPONSE_TIME_WORST_MS = 24 * 60 * 60 * 1000;

const VERIFICATION_TIER_BONUS: Readonly<Record<string, number>> = {
    none: 0,
    basic: 20,
    community: 40,
    partner: 60,
    full: 80,
};

const MODERATION_PENALTY_PER_ACTION = 10;
const ACCOUNT_AGE_MAX_BONUS_DAYS = 365;

const TRUST_LEVEL_THRESHOLDS: Record<TrustLevel, number> = {
    new: 0,
    emerging: 20,
    established: 40,
    trusted: 60,
    exemplary: 80,
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function localComputeReliability(signals: ReputationSignals): number {
    if (signals.totalHandoffs === 0) return 0;
    const completionRatio = signals.completedHandoffs / signals.totalHandoffs;
    const cancellationRatio = signals.cancelledRequests / signals.totalHandoffs;
    const penalizedRatio = Math.max(0, completionRatio - cancellationRatio * 0.5);
    return Math.round(clamp(penalizedRatio * 100, 0, 100));
}

function localComputeResponsiveness(signals: ReputationSignals): number {
    if (signals.totalHandoffs === 0 || signals.responseTimeAvgMs <= 0) return 0;
    const clamped = clamp(signals.responseTimeAvgMs, RESPONSE_TIME_BEST_MS, RESPONSE_TIME_WORST_MS);
    const range = RESPONSE_TIME_WORST_MS - RESPONSE_TIME_BEST_MS;
    const score = ((RESPONSE_TIME_WORST_MS - clamped) / range) * 100;
    return Math.round(clamp(score, 0, 100));
}

function localComputeCommunityRating(signals: ReputationSignals): number {
    if (signals.ratingCount < MIN_RATINGS_FOR_DISPLAY) return 0;
    const normalized = ((signals.averageRating - 1) / 4) * 100;
    return Math.round(clamp(normalized, 0, 100));
}

function localComputeTrustBonus(signals: ReputationSignals): number {
    const ageFraction = Math.min(signals.accountAgeDays / ACCOUNT_AGE_MAX_BONUS_DAYS, 1);
    const ageBonus = ageFraction * 100;
    const tierBonus = VERIFICATION_TIER_BONUS[signals.verificationTier] ?? 0;
    return Math.round(clamp(ageBonus * 0.5 + tierBonus * 0.5, 0, 100));
}

function determineTrustLevel(overall: number): TrustLevel {
    if (overall >= TRUST_LEVEL_THRESHOLDS.exemplary) return 'exemplary';
    if (overall >= TRUST_LEVEL_THRESHOLDS.trusted) return 'trusted';
    if (overall >= TRUST_LEVEL_THRESHOLDS.established) return 'established';
    if (overall >= TRUST_LEVEL_THRESHOLDS.emerging) return 'emerging';
    return 'new';
}

function localComputeReputation(signals: ReputationSignals): ReputationScore {
    const now = new Date().toISOString();

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

    const reliability = localComputeReliability(signals);
    const responsiveness = localComputeResponsiveness(signals);
    const communityRating = localComputeCommunityRating(signals);
    const trustBonus = localComputeTrustBonus(signals);

    const rawOverall =
        reliability * WEIGHT_RELIABILITY +
        responsiveness * WEIGHT_RESPONSIVENESS +
        communityRating * WEIGHT_COMMUNITY +
        trustBonus * WEIGHT_TRUST_BONUS;

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
// Internal mutable signal accumulator
// ---------------------------------------------------------------------------

interface MutableSignals {
    completedHandoffs: number;
    totalHandoffs: number;
    ratingSum: number;
    ratingCount: number;
    responseTimeTotalMs: number;
    responseTimeCount: number;
    accountAgeDays: number;
    verificationTier: string;
    moderationActions: number;
    cancelledRequests: number;
}

const createEmptySignals = (): MutableSignals => ({
    completedHandoffs: 0,
    totalHandoffs: 0,
    ratingSum: 0,
    ratingCount: 0,
    responseTimeTotalMs: 0,
    responseTimeCount: 0,
    accountAgeDays: 0,
    verificationTier: 'none',
    moderationActions: 0,
    cancelledRequests: 0,
});

const toReputationSignals = (m: MutableSignals): ReputationSignals => ({
    completedHandoffs: m.completedHandoffs,
    totalHandoffs: m.totalHandoffs,
    averageRating: m.ratingCount > 0 ? m.ratingSum / m.ratingCount : 0,
    ratingCount: m.ratingCount,
    responseTimeAvgMs:
        m.responseTimeCount > 0
            ? m.responseTimeTotalMs / m.responseTimeCount
            : 0,
    accountAgeDays: m.accountAgeDays,
    verificationTier: m.verificationTier,
    moderationActions: m.moderationActions,
    cancelledRequests: m.cancelledRequests,
});

// ---------------------------------------------------------------------------
// Outcomes that count as "successful completion"
// ---------------------------------------------------------------------------

const SUCCESSFUL_OUTCOMES = new Set<string>([
    'successful',
    'partially_successful',
]);

// ---------------------------------------------------------------------------
// Route result type (matches existing service patterns)
// ---------------------------------------------------------------------------

export interface ReputationRouteResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// Reputation service
// ---------------------------------------------------------------------------

export class ReputationService {
    private readonly signals = new Map<string, MutableSignals>();

    private getOrCreate(userDid: string): MutableSignals {
        let s = this.signals.get(userDid);
        if (!s) {
            s = createEmptySignals();
            this.signals.set(userDid, s);
        }
        return s;
    }

    /**
     * Record the result of a handoff (volunteer completing or failing to
     * complete an aid request).
     */
    recordHandoffCompletion(
        volunteerDid: string,
        outcome: HandoffOutcome,
        responseTimeMs: number,
    ): void {
        const s = this.getOrCreate(volunteerDid);
        s.totalHandoffs++;

        if (SUCCESSFUL_OUTCOMES.has(outcome)) {
            s.completedHandoffs++;
        }

        if (outcome === 'cancelled') {
            s.cancelledRequests++;
        }

        if (responseTimeMs > 0) {
            s.responseTimeTotalMs += responseTimeMs;
            s.responseTimeCount++;
        }
    }

    /**
     * Record a feedback rating for a volunteer.
     */
    recordFeedback(volunteerDid: string, rating: number): void {
        const s = this.getOrCreate(volunteerDid);
        s.ratingSum += rating;
        s.ratingCount++;
    }

    /**
     * Record a negative moderation action against a user.
     */
    recordModerationAction(userDid: string): void {
        const s = this.getOrCreate(userDid);
        s.moderationActions++;
    }

    /**
     * Set account metadata that affects the trust bonus.
     */
    setAccountMetadata(
        userDid: string,
        accountAgeDays: number,
        verificationTier: string,
    ): void {
        const s = this.getOrCreate(userDid);
        s.accountAgeDays = accountAgeDays;
        s.verificationTier = verificationTier;
    }

    /**
     * Get raw signals for a user (admin/debug).
     */
    getSignals(userDid: string): ReputationSignals {
        const s = this.signals.get(userDid);
        if (!s) {
            return toReputationSignals(createEmptySignals());
        }
        return toReputationSignals(s);
    }

    /**
     * Compute and return the current reputation score for a user.
     */
    getReputation(userDid: string): ReputationScore {
        const signals = this.getSignals(userDid);
        return localComputeReputation(signals);
    }

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    getReputationFromParams(params: URLSearchParams): ReputationRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: userDid.',
                    },
                },
            };
        }

        const score = this.getReputation(userDid);
        return { statusCode: 200, body: { reputation: score } };
    }

    getSignalsFromParams(params: URLSearchParams): ReputationRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: userDid.',
                    },
                },
            };
        }

        const signals = this.getSignals(userDid);
        return { statusCode: 200, body: { signals } };
    }
}

export const createReputationService = (): ReputationService => {
    return new ReputationService();
};

export const createFixtureReputationService = (): ReputationService => {
    const service = new ReputationService();

    // Seed with a sample trusted volunteer
    service.setAccountMetadata('did:example:trusted-volunteer', 200, 'community');
    service.recordHandoffCompletion('did:example:trusted-volunteer', 'successful', 300_000);
    service.recordHandoffCompletion('did:example:trusted-volunteer', 'successful', 600_000);
    service.recordHandoffCompletion('did:example:trusted-volunteer', 'successful', 450_000);
    service.recordHandoffCompletion('did:example:trusted-volunteer', 'partially_successful', 900_000);
    service.recordFeedback('did:example:trusted-volunteer', 5);
    service.recordFeedback('did:example:trusted-volunteer', 4);
    service.recordFeedback('did:example:trusted-volunteer', 5);

    // Seed with a new volunteer (below threshold)
    service.recordHandoffCompletion('did:example:new-volunteer', 'successful', 120_000);

    return service;
};
