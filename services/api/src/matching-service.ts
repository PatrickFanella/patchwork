import type {
    FairnessCheck,
    MatchCandidate,
    MatchExplanationTrace,
    MatchFeedback,
    MatchFeedbackOutcome,
    MatchPolicy,
    MatchRecommendation,
    MatchRequestContext,
    MatchSignal,
    MatchSignalType,
    OperatorOverride,
    OverrideAction,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local re-implementation of shared scoring (avoids cross-workspace issues)
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

const roundScore = (value: number): number => Number(value.toFixed(6));

function localScoreProximity(distanceKm: number): number {
    if (distanceKm <= 2) return 1;
    if (distanceKm <= 5) return 0.85;
    if (distanceKm <= 10) return 0.65;
    if (distanceKm <= 25) return 0.4;
    return 0.15;
}

function localScoreAvailability(
    availability: MatchCandidate['availability'],
): number {
    switch (availability) {
        case 'immediate': return 1;
        case 'within-24h': return 0.7;
        case 'scheduled': return 0.4;
        case 'unavailable': return 0;
    }
}

function localScoreSkills(
    candidateSkills: string[],
    requiredSkills: string[],
): number {
    if (requiredSkills.length === 0) return 1;
    const normalizedCandidate = new Set(candidateSkills.map(s => s.toLowerCase()));
    const matched = requiredSkills.filter(s => normalizedCandidate.has(s.toLowerCase()));
    return roundScore(matched.length / requiredSkills.length);
}

function localScoreUrgency(urgency: MatchRequestContext['urgency']): number {
    switch (urgency) {
        case 'critical': return 1;
        case 'high': return 0.8;
        case 'medium': return 0.5;
        case 'low': return 0.3;
    }
}

function localScoreCapacity(currentLoad: number, maxLoad: number): number {
    if (maxLoad <= 0) return 0;
    const available = Math.max(0, maxLoad - currentLoad);
    return roundScore(clamp(available / maxLoad, 0, 1));
}

function localScorePreference(
    preferredCategories: string[],
    requestCategory: string,
): number {
    if (preferredCategories.length === 0) return 0.5;
    const normalized = new Set(preferredCategories.map(c => c.toLowerCase()));
    return normalized.has(requestCategory.toLowerCase()) ? 1 : 0.2;
}

function localScoreHistory(completedHandoffs: number): number {
    if (completedHandoffs >= 20) return 1;
    if (completedHandoffs >= 10) return 0.8;
    if (completedHandoffs >= 5) return 0.6;
    if (completedHandoffs >= 1) return 0.4;
    return 0.1;
}

function localComputeMatchSignals(
    candidate: MatchCandidate,
    context: MatchRequestContext,
    weights: Record<MatchSignalType, number>,
): MatchSignal[] {
    const proximityScore = localScoreProximity(candidate.distanceKm);
    const availabilityScore = localScoreAvailability(candidate.availability);
    const skillsScore = localScoreSkills(candidate.skills, context.requiredSkills);
    const reputationScoreVal = clamp(candidate.reputationScore / 100, 0, 1);
    const historyScore = localScoreHistory(candidate.completedHandoffs);
    const preferenceScore = localScorePreference(candidate.preferredCategories, context.category);
    const urgencyScore = localScoreUrgency(context.urgency);
    const capacityScore = localScoreCapacity(candidate.currentLoad, candidate.maxLoad);

    return [
        { type: 'proximity', weight: weights.proximity, score: proximityScore, explanation: `Candidate is ${candidate.distanceKm}km away` },
        { type: 'availability', weight: weights.availability, score: availabilityScore, explanation: `Availability: ${candidate.availability}` },
        { type: 'skills', weight: weights.skills, score: skillsScore, explanation: context.requiredSkills.length === 0 ? 'No specific skills required' : `Matches ${Math.round(skillsScore * context.requiredSkills.length)}/${context.requiredSkills.length} required skills` },
        { type: 'reputation', weight: weights.reputation, score: roundScore(reputationScoreVal), explanation: `Reputation score: ${candidate.reputationScore}/100` },
        { type: 'history', weight: weights.history, score: historyScore, explanation: `${candidate.completedHandoffs} completed handoffs` },
        { type: 'preference', weight: weights.preference, score: preferenceScore, explanation: candidate.preferredCategories.includes(context.category) ? `Prefers ${context.category} requests` : `No preference for ${context.category}` },
        { type: 'urgency', weight: weights.urgency, score: urgencyScore, explanation: `Request urgency: ${context.urgency}` },
        { type: 'capacity', weight: weights.capacity, score: capacityScore, explanation: `Load: ${candidate.currentLoad}/${candidate.maxLoad}` },
    ];
}

function localComputeMatchScore(signals: MatchSignal[]): number {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const signal of signals) {
        weightedSum += signal.score * signal.weight;
        totalWeight += signal.weight;
    }
    if (totalWeight === 0) return 0;
    return roundScore(clamp(weightedSum / totalWeight, 0, 1));
}

function localComputeConfidence(signals: MatchSignal[]): number {
    if (signals.length === 0) return 0;
    const nonZero = signals.filter(s => s.score > 0).length;
    const completeness = nonZero / signals.length;
    const mean = signals.reduce((acc, s) => acc + s.score, 0) / signals.length;
    const variance = signals.reduce((acc, s) => acc + (s.score - mean) ** 2, 0) / signals.length;
    const consistency = Math.max(0, 1 - Math.sqrt(variance));
    return roundScore(clamp(completeness * 0.6 + consistency * 0.4, 0, 1));
}

function localGenerateExplanation(
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

function localRunFairnessChecks(
    recommendations: MatchRecommendation[],
    candidates: MatchCandidate[],
): FairnessCheck[] {
    const checks: FairnessCheck[] = [];
    const topCandidates = recommendations.slice(0, 5);
    const candidateMap = new Map(candidates.map(c => [c.candidateDid, c]));
    const topDistances = topCandidates.map(r => candidateMap.get(r.candidateDid)?.distanceKm ?? 0);
    const allNearby = topDistances.length > 1 && topDistances.every(d => d <= 2);

    checks.push({
        checkName: 'geographic_diversity',
        passed: !allNearby || topDistances.length <= 1,
        details: allNearby && topDistances.length > 1
            ? 'Top candidates are all within 2km; consider broadening results'
            : 'Geographic distribution is adequate',
    });

    const uniqueCandidates = new Set(recommendations.map(r => r.candidateDid));
    const monopolyCheck = recommendations.length > 1 && uniqueCandidates.size === 1;
    checks.push({
        checkName: 'no_monopoly',
        passed: !monopolyCheck,
        details: monopolyCheck
            ? 'Single candidate monopolizes all recommendations'
            : 'No candidate monopoly detected',
    });

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

function localApplyOperatorOverride(
    recommendations: MatchRecommendation[],
    override: OperatorOverride,
): MatchRecommendation[] {
    const result = [...recommendations];

    switch (override.action) {
        case 'exclude': {
            const filtered = result.filter(r => r.recommendationId !== override.recommendationId);
            return filtered.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }
        case 'pin': {
            const targetIdx = result.findIndex(r => r.recommendationId === override.recommendationId);
            if (targetIdx < 0) return result;
            const [pinned] = result.splice(targetIdx, 1);
            result.unshift({ ...pinned!, rank: 1 });
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }
        case 'boost': {
            const targetIdx = result.findIndex(r => r.recommendationId === override.recommendationId);
            if (targetIdx <= 0) return result;
            const [boosted] = result.splice(targetIdx, 1);
            const newIdx = Math.max(0, targetIdx - Math.ceil(result.length / 2));
            result.splice(newIdx, 0, boosted!);
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }
        case 'suppress': {
            const targetIdx = result.findIndex(r => r.recommendationId === override.recommendationId);
            if (targetIdx < 0 || targetIdx === result.length - 1) return result;
            const [suppressed] = result.splice(targetIdx, 1);
            const newIdx = Math.min(result.length, targetIdx + Math.ceil(result.length / 2));
            result.splice(newIdx, 0, suppressed!);
            return result.map((r, idx) => ({ ...r, rank: idx + 1 }));
        }
        default:
            return result;
    }
}

// ---------------------------------------------------------------------------
// Route result type (matches existing service patterns)
// ---------------------------------------------------------------------------

export interface MatchingRouteResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let idCounter = 0;

function generateId(prefix: string): string {
    idCounter++;
    return `${prefix}-${Date.now()}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Matching service
// ---------------------------------------------------------------------------

export class MatchingService {
    private readonly recommendations = new Map<string, MatchRecommendation>();
    private readonly recommendationsByRequest = new Map<string, string[]>();
    private readonly signalsByRecommendation = new Map<string, MatchSignal[]>();
    private readonly overrides = new Map<string, OperatorOverride>();
    private readonly overridesByRecommendation = new Map<string, string[]>();
    private readonly feedbackRecords = new Map<string, MatchFeedback>();
    private readonly feedbackByRecommendation = new Map<string, string[]>();
    private readonly fairnessChecksByRequest = new Map<string, FairnessCheck[]>();
    private policy: MatchPolicy;

    constructor(policy?: MatchPolicy) {
        this.policy = policy ?? {
            policyId: 'default',
            name: 'Default Match Policy',
            signalWeights: {
                proximity: 0.2,
                availability: 0.15,
                skills: 0.2,
                reputation: 0.15,
                history: 0.1,
                preference: 0.05,
                urgency: 0.1,
                capacity: 0.05,
            },
            minConfidence: 0.3,
            maxResults: 10,
            fairnessRules: ['geographic_diversity', 'no_monopoly', 'new_user_exposure'],
        };
    }

    /**
     * Generate recommendations for a request from a set of candidates.
     * Scores, ranks, runs fairness checks, and produces explanation traces.
     */
    generateRecommendations(
        context: MatchRequestContext,
        candidates: MatchCandidate[],
        now?: string,
    ): MatchRecommendation[] {
        const timestamp = now ?? new Date().toISOString();
        const weights = this.policy.signalWeights;

        // Score each candidate
        const scored = candidates
            .filter(c => c.availability !== 'unavailable')
            .map(candidate => {
                const signals = localComputeMatchSignals(candidate, context, weights);
                const overallScore = localComputeMatchScore(signals);
                const confidence = localComputeConfidence(signals);

                return {
                    candidate,
                    signals,
                    overallScore,
                    confidence,
                };
            })
            .filter(entry => entry.confidence >= this.policy.minConfidence);

        // Sort by score descending, tiebreak by DID
        scored.sort((a, b) => {
            if (b.overallScore !== a.overallScore) {
                return b.overallScore - a.overallScore;
            }
            return a.candidate.candidateDid.localeCompare(b.candidate.candidateDid);
        });

        // Limit results
        const limited = scored.slice(0, this.policy.maxResults);

        // Create recommendations
        const recs: MatchRecommendation[] = limited.map((entry, idx) => {
            const recId = generateId('rec');
            const rec: MatchRecommendation = {
                recommendationId: recId,
                candidateDid: entry.candidate.candidateDid,
                requestUri: context.requestUri,
                overallScore: entry.overallScore,
                signals: entry.signals,
                rank: idx + 1,
                explanationSummary: localGenerateExplanation(
                    entry.candidate.candidateDid,
                    entry.signals,
                    entry.overallScore,
                ),
                confidence: entry.confidence,
                generatedAt: timestamp,
            };

            this.recommendations.set(recId, rec);
            this.signalsByRecommendation.set(recId, entry.signals);
            return rec;
        });

        // Index by request
        const recIds = recs.map(r => r.recommendationId);
        this.recommendationsByRequest.set(context.requestUri, recIds);

        // Run fairness checks
        const fairnessChecks = localRunFairnessChecks(recs, candidates);
        this.fairnessChecksByRequest.set(context.requestUri, fairnessChecks);

        return recs;
    }

    /**
     * Get a single recommendation by ID.
     */
    getRecommendation(recommendationId: string): MatchRecommendation | undefined {
        return this.recommendations.get(recommendationId);
    }

    /**
     * Get all recommendations for a request.
     */
    getRecommendationsForRequest(requestUri: string): MatchRecommendation[] {
        const ids = this.recommendationsByRequest.get(requestUri) ?? [];
        return ids
            .map(id => this.recommendations.get(id))
            .filter((r): r is MatchRecommendation => r !== undefined);
    }

    /**
     * Apply an operator override to a recommendation.
     * Records the override and re-ranks affected recommendations.
     */
    applyOverride(input: {
        recommendationId: string;
        operatorDid: string;
        action: OverrideAction;
        reason: string;
        now?: string;
    }): OperatorOverride | undefined {
        const rec = this.recommendations.get(input.recommendationId);
        if (!rec) return undefined;

        const override: OperatorOverride = {
            overrideId: generateId('ovr'),
            recommendationId: input.recommendationId,
            operatorDid: input.operatorDid,
            action: input.action,
            reason: input.reason,
            appliedAt: input.now ?? new Date().toISOString(),
        };

        this.overrides.set(override.overrideId, override);

        // Index by recommendation
        const existing = this.overridesByRecommendation.get(input.recommendationId) ?? [];
        existing.push(override.overrideId);
        this.overridesByRecommendation.set(input.recommendationId, existing);

        // Re-rank recommendations for this request
        const requestRecs = this.getRecommendationsForRequest(rec.requestUri);
        const reranked = localApplyOperatorOverride(requestRecs, override);

        // Update stored recommendations
        for (const updated of reranked) {
            this.recommendations.set(updated.recommendationId, updated);
        }

        // If excluded, remove from request index
        if (input.action === 'exclude') {
            const ids = this.recommendationsByRequest.get(rec.requestUri) ?? [];
            this.recommendationsByRequest.set(
                rec.requestUri,
                ids.filter(id => id !== input.recommendationId),
            );
        }

        return override;
    }

    /**
     * Get all overrides for a recommendation.
     */
    getOverrides(recommendationId: string): OperatorOverride[] {
        const ids = this.overridesByRecommendation.get(recommendationId) ?? [];
        return ids
            .map(id => this.overrides.get(id))
            .filter((o): o is OperatorOverride => o !== undefined);
    }

    /**
     * Get override history across all recommendations.
     */
    getOverrideHistory(): OperatorOverride[] {
        return [...this.overrides.values()].sort(
            (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
        );
    }

    /**
     * Submit feedback for a recommendation.
     */
    submitFeedback(input: {
        recommendationId: string;
        fromDid: string;
        outcome: MatchFeedbackOutcome;
        rating?: number;
        comment?: string;
        now?: string;
    }): MatchFeedback | undefined {
        if (!this.recommendations.has(input.recommendationId)) {
            return undefined;
        }

        const feedback: MatchFeedback = {
            feedbackId: generateId('fb'),
            recommendationId: input.recommendationId,
            fromDid: input.fromDid,
            outcome: input.outcome,
            rating: input.rating,
            comment: input.comment,
            submittedAt: input.now ?? new Date().toISOString(),
        };

        this.feedbackRecords.set(feedback.feedbackId, feedback);

        const existing = this.feedbackByRecommendation.get(input.recommendationId) ?? [];
        existing.push(feedback.feedbackId);
        this.feedbackByRecommendation.set(input.recommendationId, existing);

        return feedback;
    }

    /**
     * Get feedback history for a recommendation.
     */
    getFeedbackHistory(recommendationId?: string): MatchFeedback[] {
        if (recommendationId) {
            const ids = this.feedbackByRecommendation.get(recommendationId) ?? [];
            return ids
                .map(id => this.feedbackRecords.get(id))
                .filter((f): f is MatchFeedback => f !== undefined);
        }

        return [...this.feedbackRecords.values()].sort(
            (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        );
    }

    /**
     * Get full explanation trace for a recommendation.
     */
    getExplanationTrace(recommendationId: string): MatchExplanationTrace | undefined {
        const rec = this.recommendations.get(recommendationId);
        if (!rec) return undefined;

        const signals = this.signalsByRecommendation.get(recommendationId) ?? [];
        const overrides = this.getOverrides(recommendationId);
        const fairnessChecks = this.fairnessChecksByRequest.get(rec.requestUri) ?? [];

        return {
            recommendationId,
            signals,
            appliedPolicies: [this.policy.name],
            fairnessChecks,
            operatorOverrides: overrides,
            traceGeneratedAt: new Date().toISOString(),
        };
    }

    /**
     * Get the current match policy.
     */
    getMatchPolicy(): MatchPolicy {
        return { ...this.policy };
    }

    /**
     * Update the match policy.
     */
    updateMatchPolicy(updates: Partial<Omit<MatchPolicy, 'policyId'>>): MatchPolicy {
        this.policy = {
            ...this.policy,
            ...updates,
            policyId: this.policy.policyId,
        };
        return { ...this.policy };
    }

    // -------------------------------------------------------------------
    // Route handlers (matching existing service patterns)
    // -------------------------------------------------------------------

    getRecommendationFromParams(params: URLSearchParams): MatchingRouteResult {
        const recommendationId = params.get('recommendationId')?.trim();
        if (!recommendationId) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: recommendationId.',
                    },
                },
            };
        }

        const rec = this.getRecommendation(recommendationId);
        if (!rec) {
            return {
                statusCode: 404,
                body: {
                    error: {
                        code: 'NOT_FOUND',
                        message: `No recommendation found: ${recommendationId}`,
                    },
                },
            };
        }

        return { statusCode: 200, body: { recommendation: rec } };
    }

    getRecommendationsForRequestFromParams(
        params: URLSearchParams,
    ): MatchingRouteResult {
        const requestUri = params.get('requestUri')?.trim();
        if (!requestUri) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: requestUri.',
                    },
                },
            };
        }

        const recs = this.getRecommendationsForRequest(requestUri);
        return { statusCode: 200, body: { recommendations: recs } };
    }

    getExplanationTraceFromParams(params: URLSearchParams): MatchingRouteResult {
        const recommendationId = params.get('recommendationId')?.trim();
        if (!recommendationId) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: recommendationId.',
                    },
                },
            };
        }

        const trace = this.getExplanationTrace(recommendationId);
        if (!trace) {
            return {
                statusCode: 404,
                body: {
                    error: {
                        code: 'NOT_FOUND',
                        message: `No explanation trace found: ${recommendationId}`,
                    },
                },
            };
        }

        return { statusCode: 200, body: { trace } };
    }

    getOverridesFromParams(params: URLSearchParams): MatchingRouteResult {
        const recommendationId = params.get('recommendationId')?.trim();
        if (!recommendationId) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required field: recommendationId.',
                    },
                },
            };
        }

        const overrides = this.getOverrides(recommendationId);
        return { statusCode: 200, body: { overrides } };
    }

    getFeedbackFromParams(params: URLSearchParams): MatchingRouteResult {
        const recommendationId = params.get('recommendationId')?.trim();

        const feedback = this.getFeedbackHistory(recommendationId ?? undefined);
        return { statusCode: 200, body: { feedback } };
    }

    getPolicyFromParams(_params: URLSearchParams): MatchingRouteResult {
        return { statusCode: 200, body: { policy: this.getMatchPolicy() } };
    }
}

export const createMatchingService = (policy?: MatchPolicy): MatchingService => {
    return new MatchingService(policy);
};

export const createFixtureMatchingService = (): MatchingService => {
    const service = new MatchingService();

    const context: MatchRequestContext = {
        requestUri: 'at://did:example:alice/app.patchwork.aid.post/post-fixture',
        category: 'food',
        urgency: 'high',
        requiredSkills: ['food-delivery'],
        locationLat: 40.7128,
        locationLng: -74.006,
    };

    const candidates: MatchCandidate[] = [
        {
            candidateDid: 'did:example:volunteer-a',
            distanceKm: 2,
            availability: 'immediate',
            skills: ['food-delivery', 'driving'],
            reputationScore: 80,
            completedHandoffs: 15,
            preferredCategories: ['food', 'transport'],
            currentLoad: 1,
            maxLoad: 3,
            accountAgeDays: 200,
        },
        {
            candidateDid: 'did:example:volunteer-b',
            distanceKm: 8,
            availability: 'within-24h',
            skills: ['food-delivery'],
            reputationScore: 60,
            completedHandoffs: 3,
            preferredCategories: ['food'],
            currentLoad: 0,
            maxLoad: 2,
            accountAgeDays: 30,
        },
    ];

    service.generateRecommendations(context, candidates, '2026-03-01T10:00:00.000Z');

    return service;
};
