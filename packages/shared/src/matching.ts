// ---------------------------------------------------------------------------
// Matching intelligence: explainable smart matching assistant
// ---------------------------------------------------------------------------

/**
 * Signal types used in match scoring.
 * Each signal contributes a weighted score with a human-readable explanation.
 */
export const MATCH_SIGNAL_TYPES = [
    'proximity',
    'availability',
    'skills',
    'reputation',
    'history',
    'preference',
    'urgency',
    'capacity',
] as const;

export type MatchSignalType = (typeof MATCH_SIGNAL_TYPES)[number];

/**
 * A single scored signal contributing to a match recommendation.
 */
export interface MatchSignal {
    type: MatchSignalType;
    weight: number;
    score: number;
    explanation: string;
}

/**
 * A ranked match recommendation for a candidate against a request.
 */
export interface MatchRecommendation {
    recommendationId: string;
    candidateDid: string;
    requestUri: string;
    overallScore: number;
    signals: MatchSignal[];
    rank: number;
    explanationSummary: string;
    confidence: number;
    generatedAt: string;
}

/**
 * Full explanation trace for audit and transparency.
 */
export interface MatchExplanationTrace {
    recommendationId: string;
    signals: MatchSignal[];
    appliedPolicies: string[];
    fairnessChecks: FairnessCheck[];
    operatorOverrides: OperatorOverride[];
    traceGeneratedAt: string;
}

/**
 * Operator override actions on a recommendation.
 */
export const OVERRIDE_ACTIONS = [
    'boost',
    'suppress',
    'pin',
    'exclude',
] as const;

export type OverrideAction = (typeof OVERRIDE_ACTIONS)[number];

export interface OperatorOverride {
    overrideId: string;
    recommendationId: string;
    operatorDid: string;
    action: OverrideAction;
    reason: string;
    appliedAt: string;
}

/**
 * Feedback outcomes from recommendation recipients.
 */
export const MATCH_FEEDBACK_OUTCOMES = [
    'accepted',
    'declined',
    'no_response',
    'successful',
    'unsuccessful',
] as const;

export type MatchFeedbackOutcome = (typeof MATCH_FEEDBACK_OUTCOMES)[number];

export interface MatchFeedback {
    feedbackId: string;
    recommendationId: string;
    fromDid: string;
    outcome: MatchFeedbackOutcome;
    rating?: number;
    comment?: string;
    submittedAt: string;
}

/**
 * A single fairness check result.
 */
export interface FairnessCheck {
    checkName: string;
    passed: boolean;
    details: string;
}

/**
 * Policy governing match scoring behavior.
 */
export interface MatchPolicy {
    policyId: string;
    name: string;
    signalWeights: Record<MatchSignalType, number>;
    minConfidence: number;
    maxResults: number;
    fairnessRules: string[];
}

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------

export const DEFAULT_SIGNAL_WEIGHTS: Readonly<Record<MatchSignalType, number>> = {
    proximity: 0.2,
    availability: 0.15,
    skills: 0.2,
    reputation: 0.15,
    history: 0.1,
    preference: 0.05,
    urgency: 0.1,
    capacity: 0.05,
};

export const DEFAULT_MATCH_POLICY: MatchPolicy = {
    policyId: 'default',
    name: 'Default Match Policy',
    signalWeights: { ...DEFAULT_SIGNAL_WEIGHTS },
    minConfidence: 0.3,
    maxResults: 10,
    fairnessRules: ['geographic_diversity', 'no_monopoly', 'new_user_exposure'],
};

// ---------------------------------------------------------------------------
// Candidate input for scoring
// ---------------------------------------------------------------------------

export interface MatchCandidate {
    candidateDid: string;
    distanceKm: number;
    availability: 'immediate' | 'within-24h' | 'scheduled' | 'unavailable';
    skills: string[];
    reputationScore: number;
    completedHandoffs: number;
    preferredCategories: string[];
    currentLoad: number;
    maxLoad: number;
    accountAgeDays: number;
}

export interface MatchRequestContext {
    requestUri: string;
    category: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    requiredSkills: string[];
    locationLat: number;
    locationLng: number;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

const roundScore = (value: number): number => Number(value.toFixed(6));

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Score proximity signal (0-1). Closer candidates score higher.
 */
export function scoreProximity(distanceKm: number): number {
    if (distanceKm <= 2) return 1;
    if (distanceKm <= 5) return 0.85;
    if (distanceKm <= 10) return 0.65;
    if (distanceKm <= 25) return 0.4;
    return 0.15;
}

/**
 * Score availability signal (0-1). More immediate availability scores higher.
 */
export function scoreAvailability(
    availability: MatchCandidate['availability'],
): number {
    switch (availability) {
        case 'immediate':
            return 1;
        case 'within-24h':
            return 0.7;
        case 'scheduled':
            return 0.4;
        case 'unavailable':
            return 0;
    }
}

/**
 * Score skills match (0-1). Fraction of required skills the candidate has.
 */
export function scoreSkills(
    candidateSkills: string[],
    requiredSkills: string[],
): number {
    if (requiredSkills.length === 0) return 1;
    const normalizedCandidate = new Set(candidateSkills.map(s => s.toLowerCase()));
    const matched = requiredSkills.filter(s => normalizedCandidate.has(s.toLowerCase()));
    return roundScore(matched.length / requiredSkills.length);
}

/**
 * Score urgency alignment (0-1). Higher urgency yields higher base score,
 * reflecting the priority of matching urgent requests first.
 */
export function scoreUrgency(urgency: MatchRequestContext['urgency']): number {
    switch (urgency) {
        case 'critical':
            return 1;
        case 'high':
            return 0.8;
        case 'medium':
            return 0.5;
        case 'low':
            return 0.3;
    }
}

/**
 * Score candidate capacity (0-1). How much room the candidate has for more work.
 */
export function scoreCapacity(currentLoad: number, maxLoad: number): number {
    if (maxLoad <= 0) return 0;
    const available = Math.max(0, maxLoad - currentLoad);
    return roundScore(clamp(available / maxLoad, 0, 1));
}

/**
 * Score preference alignment (0-1). Whether the candidate prefers this category.
 */
export function scorePreference(
    preferredCategories: string[],
    requestCategory: string,
): number {
    if (preferredCategories.length === 0) return 0.5;
    const normalized = new Set(preferredCategories.map(c => c.toLowerCase()));
    return normalized.has(requestCategory.toLowerCase()) ? 1 : 0.2;
}

/**
 * Score history (0-1). Based on completed handoffs.
 */
export function scoreHistory(completedHandoffs: number): number {
    if (completedHandoffs >= 20) return 1;
    if (completedHandoffs >= 10) return 0.8;
    if (completedHandoffs >= 5) return 0.6;
    if (completedHandoffs >= 1) return 0.4;
    return 0.1;
}

/**
 * Compute all signal scores for a candidate against a request.
 */
export function computeMatchSignals(
    candidate: MatchCandidate,
    context: MatchRequestContext,
    weights: Record<MatchSignalType, number>,
): MatchSignal[] {
    const proximityScore = scoreProximity(candidate.distanceKm);
    const availabilityScore = scoreAvailability(candidate.availability);
    const skillsScore = scoreSkills(candidate.skills, context.requiredSkills);
    const reputationScoreVal = clamp(candidate.reputationScore / 100, 0, 1);
    const historyScore = scoreHistory(candidate.completedHandoffs);
    const preferenceScore = scorePreference(
        candidate.preferredCategories,
        context.category,
    );
    const urgencyScore = scoreUrgency(context.urgency);
    const capacityScore = scoreCapacity(candidate.currentLoad, candidate.maxLoad);

    return [
        {
            type: 'proximity',
            weight: weights.proximity,
            score: proximityScore,
            explanation: `Candidate is ${candidate.distanceKm}km away`,
        },
        {
            type: 'availability',
            weight: weights.availability,
            score: availabilityScore,
            explanation: `Availability: ${candidate.availability}`,
        },
        {
            type: 'skills',
            weight: weights.skills,
            score: skillsScore,
            explanation:
                context.requiredSkills.length === 0
                    ? 'No specific skills required'
                    : `Matches ${Math.round(skillsScore * context.requiredSkills.length)}/${context.requiredSkills.length} required skills`,
        },
        {
            type: 'reputation',
            weight: weights.reputation,
            score: roundScore(reputationScoreVal),
            explanation: `Reputation score: ${candidate.reputationScore}/100`,
        },
        {
            type: 'history',
            weight: weights.history,
            score: historyScore,
            explanation: `${candidate.completedHandoffs} completed handoffs`,
        },
        {
            type: 'preference',
            weight: weights.preference,
            score: preferenceScore,
            explanation: candidate.preferredCategories.includes(context.category)
                ? `Prefers ${context.category} requests`
                : `No preference for ${context.category}`,
        },
        {
            type: 'urgency',
            weight: weights.urgency,
            score: urgencyScore,
            explanation: `Request urgency: ${context.urgency}`,
        },
        {
            type: 'capacity',
            weight: weights.capacity,
            score: capacityScore,
            explanation: `Load: ${candidate.currentLoad}/${candidate.maxLoad}`,
        },
    ];
}

/**
 * Compute the overall match score from signals (weighted sum, 0-1).
 */
export function computeMatchScore(signals: MatchSignal[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of signals) {
        weightedSum += signal.score * signal.weight;
        totalWeight += signal.weight;
    }

    if (totalWeight === 0) return 0;
    return roundScore(clamp(weightedSum / totalWeight, 0, 1));
}

/**
 * Compute confidence based on signal completeness and variance.
 * Higher when all signals have meaningful scores; lower when data is sparse.
 */
export function computeConfidence(signals: MatchSignal[]): number {
    if (signals.length === 0) return 0;

    const nonZero = signals.filter(s => s.score > 0).length;
    const completeness = nonZero / signals.length;

    const mean = signals.reduce((acc, s) => acc + s.score, 0) / signals.length;
    const variance =
        signals.reduce((acc, s) => acc + (s.score - mean) ** 2, 0) /
        signals.length;

    // Lower variance = higher confidence
    const consistency = Math.max(0, 1 - Math.sqrt(variance));

    return roundScore(clamp(completeness * 0.6 + consistency * 0.4, 0, 1));
}

/**
 * Generate a human-readable explanation summary from signals.
 */
export function generateExplanation(
    candidateDid: string,
    signals: MatchSignal[],
    overallScore: number,
): string {
    const topSignals = [...signals]
        .sort((a, b) => b.score * b.weight - a.score * a.weight)
        .slice(0, 3);

    const reasons = topSignals.map(s => s.explanation);
    const scorePercent = Math.round(overallScore * 100);

    return `Scored ${scorePercent}% for ${candidateDid}. Top factors: ${reasons.join('; ')}.`;
}

/**
 * Rank candidates by overall score, with deterministic tiebreaking on DID.
 */
export function rankCandidates(
    recommendations: Array<Omit<MatchRecommendation, 'rank'>>,
): MatchRecommendation[] {
    const sorted = [...recommendations].sort((a, b) => {
        if (b.overallScore !== a.overallScore) {
            return b.overallScore - a.overallScore;
        }
        return a.candidateDid.localeCompare(b.candidateDid);
    });

    return sorted.map((rec, idx) => ({
        ...rec,
        rank: idx + 1,
    }));
}

// ---------------------------------------------------------------------------
// Fairness checks
// ---------------------------------------------------------------------------

/**
 * Run fairness checks on a set of ranked recommendations.
 *
 * Checks:
 * 1. Geographic diversity - top results should not all be from same area
 * 2. No monopoly - no single candidate should dominate across requests
 * 3. New user exposure - new users should get some visibility
 */
export function runFairnessChecks(
    recommendations: MatchRecommendation[],
    candidates: MatchCandidate[],
): FairnessCheck[] {
    const checks: FairnessCheck[] = [];

    // Geographic diversity: check if top 5 are all within 2km of each other
    const topCandidates = recommendations.slice(0, 5);
    const candidateMap = new Map(candidates.map(c => [c.candidateDid, c]));
    const topDistances = topCandidates
        .map(r => candidateMap.get(r.candidateDid)?.distanceKm ?? 0);

    const allNearby = topDistances.length > 1 &&
        topDistances.every(d => d <= 2);
    checks.push({
        checkName: 'geographic_diversity',
        passed: !allNearby || topDistances.length <= 1,
        details: allNearby && topDistances.length > 1
            ? 'Top candidates are all within 2km; consider broadening results'
            : 'Geographic distribution is adequate',
    });

    // No monopoly: no single candidate should appear as top rank more than
    // a threshold (simple check: if all recs are the same candidate)
    const uniqueCandidates = new Set(recommendations.map(r => r.candidateDid));
    const monopolyCheck = recommendations.length > 1 && uniqueCandidates.size === 1;
    checks.push({
        checkName: 'no_monopoly',
        passed: !monopolyCheck,
        details: monopolyCheck
            ? 'Single candidate monopolizes all recommendations'
            : 'No candidate monopoly detected',
    });

    // New user exposure: at least one candidate with <5 handoffs in top results
    const hasNewUser = topCandidates.some(r => {
        const c = candidateMap.get(r.candidateDid);
        return c && c.completedHandoffs < 5;
    });
    checks.push({
        checkName: 'new_user_exposure',
        passed: hasNewUser || recommendations.length === 0,
        details: hasNewUser || recommendations.length === 0
            ? 'New users have visibility in results'
            : 'No new users in top results; consider boosting newcomers',
    });

    return checks;
}

// ---------------------------------------------------------------------------
// Operator override application
// ---------------------------------------------------------------------------

/**
 * Apply an operator override to a set of ranked recommendations.
 * Returns a new sorted array reflecting the override action.
 */
export function applyOperatorOverride(
    recommendations: MatchRecommendation[],
    override: OperatorOverride,
): MatchRecommendation[] {
    const result = [...recommendations];

    switch (override.action) {
        case 'exclude': {
            const filtered = result.filter(
                r => r.recommendationId !== override.recommendationId,
            );
            return filtered.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }

        case 'pin': {
            const targetIdx = result.findIndex(
                r => r.recommendationId === override.recommendationId,
            );
            if (targetIdx < 0) return result;

            const [pinned] = result.splice(targetIdx, 1);
            result.unshift({ ...pinned!, rank: 1 });
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }

        case 'boost': {
            const targetIdx = result.findIndex(
                r => r.recommendationId === override.recommendationId,
            );
            if (targetIdx <= 0) return result;

            const [boosted] = result.splice(targetIdx, 1);
            const newIdx = Math.max(0, targetIdx - Math.ceil(result.length / 2));
            result.splice(newIdx, 0, boosted!);
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }

        case 'suppress': {
            const targetIdx = result.findIndex(
                r => r.recommendationId === override.recommendationId,
            );
            if (targetIdx < 0 || targetIdx === result.length - 1) return result;

            const [suppressed] = result.splice(targetIdx, 1);
            const newIdx = Math.min(
                result.length,
                targetIdx + Math.ceil(result.length / 2),
            );
            result.splice(newIdx, 0, suppressed!);
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }

        default:
            return result;
    }
}

// ---------------------------------------------------------------------------
// Feedback-driven weight adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust signal weights based on aggregated feedback.
 *
 * Positive outcomes (accepted, successful) reinforce the top signals.
 * Negative outcomes (declined, unsuccessful) reduce confidence in top signals.
 *
 * Returns new weights (does not mutate input).
 */
export function incorporateFeedback(
    currentWeights: Record<MatchSignalType, number>,
    feedbackItems: MatchFeedback[],
    signalsByRecommendation: Map<string, MatchSignal[]>,
): Record<MatchSignalType, number> {
    const adjustments: Record<MatchSignalType, number> = {
        proximity: 0,
        availability: 0,
        skills: 0,
        reputation: 0,
        history: 0,
        preference: 0,
        urgency: 0,
        capacity: 0,
    };

    const POSITIVE_OUTCOMES = new Set<MatchFeedbackOutcome>([
        'accepted',
        'successful',
    ]);
    const NEGATIVE_OUTCOMES = new Set<MatchFeedbackOutcome>([
        'declined',
        'unsuccessful',
    ]);

    const LEARNING_RATE = 0.01;

    for (const fb of feedbackItems) {
        const signals = signalsByRecommendation.get(fb.recommendationId);
        if (!signals) continue;

        // Sort by weighted contribution descending
        const sorted = [...signals].sort(
            (a, b) => b.score * b.weight - a.score * a.weight,
        );

        const topSignals = sorted.slice(0, 3);

        if (POSITIVE_OUTCOMES.has(fb.outcome)) {
            for (const s of topSignals) {
                adjustments[s.type] += LEARNING_RATE;
            }
        } else if (NEGATIVE_OUTCOMES.has(fb.outcome)) {
            for (const s of topSignals) {
                adjustments[s.type] -= LEARNING_RATE;
            }
        }
    }

    // Apply adjustments and normalize so weights sum to 1
    const raw: Record<MatchSignalType, number> = { ...currentWeights };
    for (const type of MATCH_SIGNAL_TYPES) {
        raw[type] = Math.max(0.01, raw[type] + adjustments[type]);
    }

    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    const normalized: Record<MatchSignalType, number> = { ...raw };
    for (const type of MATCH_SIGNAL_TYPES) {
        normalized[type] = roundScore(raw[type] / sum);
    }

    return normalized;
}

// ---------------------------------------------------------------------------
// Human-readable labels
// ---------------------------------------------------------------------------

export const SIGNAL_TYPE_LABELS: Readonly<Record<MatchSignalType, string>> = {
    proximity: 'Proximity',
    availability: 'Availability',
    skills: 'Skills Match',
    reputation: 'Reputation',
    history: 'Track Record',
    preference: 'Preference Alignment',
    urgency: 'Request Urgency',
    capacity: 'Available Capacity',
};

export const OVERRIDE_ACTION_LABELS: Readonly<Record<OverrideAction, string>> = {
    boost: 'Boost',
    suppress: 'Suppress',
    pin: 'Pin to Top',
    exclude: 'Exclude',
};

export const FEEDBACK_OUTCOME_LABELS: Readonly<Record<MatchFeedbackOutcome, string>> = {
    accepted: 'Accepted',
    declined: 'Declined',
    no_response: 'No Response',
    successful: 'Successful',
    unsuccessful: 'Unsuccessful',
};

// ---------------------------------------------------------------------------
// Contract stubs for testing
// ---------------------------------------------------------------------------

export const matchingContractStubs = {
    signal: {
        type: 'proximity',
        weight: 0.2,
        score: 0.85,
        explanation: 'Candidate is 3km away',
    } satisfies MatchSignal,

    recommendation: {
        recommendationId: 'rec-001',
        candidateDid: 'did:example:volunteer1',
        requestUri: 'at://did:example:alice/app.patchwork.aid.post/post-123',
        overallScore: 0.78,
        signals: [],
        rank: 1,
        explanationSummary: 'Scored 78% for did:example:volunteer1.',
        confidence: 0.85,
        generatedAt: new Date(0).toISOString(),
    } satisfies MatchRecommendation,

    override: {
        overrideId: 'ovr-001',
        recommendationId: 'rec-001',
        operatorDid: 'did:example:operator',
        action: 'boost',
        reason: 'Known reliable volunteer in area',
        appliedAt: new Date(0).toISOString(),
    } satisfies OperatorOverride,

    feedback: {
        feedbackId: 'fb-001',
        recommendationId: 'rec-001',
        fromDid: 'did:example:alice',
        outcome: 'successful',
        rating: 5,
        comment: 'Great help, very quick',
        submittedAt: new Date(0).toISOString(),
    } satisfies MatchFeedback,

    policy: { ...DEFAULT_MATCH_POLICY } satisfies MatchPolicy,

    candidate: {
        candidateDid: 'did:example:volunteer1',
        distanceKm: 3,
        availability: 'immediate',
        skills: ['food-delivery', 'driving'],
        reputationScore: 75,
        completedHandoffs: 12,
        preferredCategories: ['food', 'transport'],
        currentLoad: 1,
        maxLoad: 3,
        accountAgeDays: 120,
    } satisfies MatchCandidate,

    requestContext: {
        requestUri: 'at://did:example:alice/app.patchwork.aid.post/post-123',
        category: 'food',
        urgency: 'high',
        requiredSkills: ['food-delivery'],
        locationLat: 40.7128,
        locationLng: -74.006,
    } satisfies MatchRequestContext,
};
