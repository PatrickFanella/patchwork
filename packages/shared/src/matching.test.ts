import { describe, expect, it } from 'vitest';
import {
    applyOperatorOverride,
    computeConfidence,
    computeMatchScore,
    computeMatchSignals,
    DEFAULT_SIGNAL_WEIGHTS,
    generateExplanation,
    incorporateFeedback,
    rankCandidates,
    runFairnessChecks,
    scoreAvailability,
    scoreCapacity,
    scoreHistory,
    scorePreference,
    scoreProximity,
    scoreSkills,
    scoreUrgency,
    matchingContractStubs,
    type MatchCandidate,
    type MatchFeedback,
    type MatchRecommendation,
    type MatchRequestContext,
    type MatchSignal,
    type OperatorOverride,
} from './matching.js';

// ---------------------------------------------------------------------------
// Individual signal scoring
// ---------------------------------------------------------------------------

describe('signal scoring', () => {
    describe('scoreProximity', () => {
        it('returns 1 for candidates within 2km', () => {
            expect(scoreProximity(0.5)).toBe(1);
            expect(scoreProximity(2)).toBe(1);
        });

        it('returns decreasing scores for further distances', () => {
            expect(scoreProximity(3)).toBe(0.85);
            expect(scoreProximity(7)).toBe(0.65);
            expect(scoreProximity(15)).toBe(0.4);
            expect(scoreProximity(50)).toBe(0.15);
        });
    });

    describe('scoreAvailability', () => {
        it('scores immediate as 1', () => {
            expect(scoreAvailability('immediate')).toBe(1);
        });

        it('scores unavailable as 0', () => {
            expect(scoreAvailability('unavailable')).toBe(0);
        });

        it('scores within-24h and scheduled between 0 and 1', () => {
            expect(scoreAvailability('within-24h')).toBe(0.7);
            expect(scoreAvailability('scheduled')).toBe(0.4);
        });
    });

    describe('scoreSkills', () => {
        it('returns 1 when no skills required', () => {
            expect(scoreSkills(['driving'], [])).toBe(1);
        });

        it('returns 1 when all required skills are present', () => {
            expect(
                scoreSkills(['driving', 'food-delivery'], ['driving', 'food-delivery']),
            ).toBe(1);
        });

        it('returns fraction when partial skills match', () => {
            expect(scoreSkills(['driving'], ['driving', 'cooking'])).toBe(0.5);
        });

        it('returns 0 when no skills match', () => {
            expect(scoreSkills(['swimming'], ['driving'])).toBe(0);
        });

        it('is case-insensitive', () => {
            expect(scoreSkills(['DRIVING'], ['driving'])).toBe(1);
        });
    });

    describe('scoreUrgency', () => {
        it('scores critical highest', () => {
            expect(scoreUrgency('critical')).toBe(1);
        });

        it('scores low lowest', () => {
            expect(scoreUrgency('low')).toBe(0.3);
        });
    });

    describe('scoreCapacity', () => {
        it('returns 1 when fully available', () => {
            expect(scoreCapacity(0, 5)).toBe(1);
        });

        it('returns 0 when at full capacity', () => {
            expect(scoreCapacity(5, 5)).toBe(0);
        });

        it('returns proportional value', () => {
            expect(scoreCapacity(2, 4)).toBe(0.5);
        });

        it('returns 0 when maxLoad is 0', () => {
            expect(scoreCapacity(0, 0)).toBe(0);
        });
    });

    describe('scorePreference', () => {
        it('returns 1 when category matches preference', () => {
            expect(scorePreference(['food', 'medical'], 'food')).toBe(1);
        });

        it('returns 0.2 when category does not match', () => {
            expect(scorePreference(['medical'], 'food')).toBe(0.2);
        });

        it('returns 0.5 when no preferences set', () => {
            expect(scorePreference([], 'food')).toBe(0.5);
        });
    });

    describe('scoreHistory', () => {
        it('returns 1 for 20+ handoffs', () => {
            expect(scoreHistory(25)).toBe(1);
        });

        it('returns 0.1 for 0 handoffs', () => {
            expect(scoreHistory(0)).toBe(0.1);
        });
    });
});

// ---------------------------------------------------------------------------
// Composite scoring
// ---------------------------------------------------------------------------

describe('computeMatchSignals', () => {
    const candidate: MatchCandidate = matchingContractStubs.candidate;
    const context: MatchRequestContext = matchingContractStubs.requestContext;

    it('returns signals for all 8 signal types', () => {
        const signals = computeMatchSignals(
            candidate,
            context,
            DEFAULT_SIGNAL_WEIGHTS,
        );
        expect(signals).toHaveLength(8);
        const types = signals.map(s => s.type);
        expect(types).toContain('proximity');
        expect(types).toContain('availability');
        expect(types).toContain('skills');
        expect(types).toContain('reputation');
        expect(types).toContain('history');
        expect(types).toContain('preference');
        expect(types).toContain('urgency');
        expect(types).toContain('capacity');
    });

    it('each signal has score between 0 and 1', () => {
        const signals = computeMatchSignals(
            candidate,
            context,
            DEFAULT_SIGNAL_WEIGHTS,
        );
        for (const signal of signals) {
            expect(signal.score).toBeGreaterThanOrEqual(0);
            expect(signal.score).toBeLessThanOrEqual(1);
        }
    });

    it('each signal has a non-empty explanation', () => {
        const signals = computeMatchSignals(
            candidate,
            context,
            DEFAULT_SIGNAL_WEIGHTS,
        );
        for (const signal of signals) {
            expect(signal.explanation.length).toBeGreaterThan(0);
        }
    });
});

describe('computeMatchScore', () => {
    it('returns 0 for empty signals', () => {
        expect(computeMatchScore([])).toBe(0);
    });

    it('computes weighted average', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.5, score: 1, explanation: '' },
            { type: 'skills', weight: 0.5, score: 0.5, explanation: '' },
        ];
        expect(computeMatchScore(signals)).toBe(0.75);
    });

    it('normalizes by total weight', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.2, score: 1, explanation: '' },
            { type: 'skills', weight: 0.2, score: 1, explanation: '' },
        ];
        expect(computeMatchScore(signals)).toBe(1);
    });
});

describe('computeConfidence', () => {
    it('returns 0 for empty signals', () => {
        expect(computeConfidence([])).toBe(0);
    });

    it('returns higher confidence when all scores are non-zero', () => {
        const allPositive: MatchSignal[] = [
            { type: 'proximity', weight: 0.5, score: 0.8, explanation: '' },
            { type: 'skills', weight: 0.5, score: 0.7, explanation: '' },
        ];
        const mixed: MatchSignal[] = [
            { type: 'proximity', weight: 0.5, score: 0.9, explanation: '' },
            { type: 'skills', weight: 0.5, score: 0, explanation: '' },
        ];
        expect(computeConfidence(allPositive)).toBeGreaterThan(
            computeConfidence(mixed),
        );
    });
});

describe('generateExplanation', () => {
    it('includes score percentage and top factors', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.5, score: 0.9, explanation: 'Close by' },
            { type: 'skills', weight: 0.3, score: 0.8, explanation: 'Skilled' },
            { type: 'capacity', weight: 0.2, score: 0.1, explanation: 'Busy' },
        ];

        const result = generateExplanation('did:example:v1', signals, 0.78);
        expect(result).toContain('78%');
        expect(result).toContain('did:example:v1');
        expect(result).toContain('Close by');
    });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

describe('rankCandidates', () => {
    it('assigns ranks by descending score', () => {
        const recs = [
            { ...matchingContractStubs.recommendation, recommendationId: 'r1', overallScore: 0.5, candidateDid: 'did:example:a' },
            { ...matchingContractStubs.recommendation, recommendationId: 'r2', overallScore: 0.9, candidateDid: 'did:example:b' },
            { ...matchingContractStubs.recommendation, recommendationId: 'r3', overallScore: 0.7, candidateDid: 'did:example:c' },
        ];

        const ranked = rankCandidates(recs);
        expect(ranked[0].rank).toBe(1);
        expect(ranked[0].overallScore).toBe(0.9);
        expect(ranked[1].rank).toBe(2);
        expect(ranked[2].rank).toBe(3);
    });

    it('breaks ties deterministically by DID', () => {
        const recs = [
            { ...matchingContractStubs.recommendation, recommendationId: 'r1', overallScore: 0.8, candidateDid: 'did:example:z' },
            { ...matchingContractStubs.recommendation, recommendationId: 'r2', overallScore: 0.8, candidateDid: 'did:example:a' },
        ];

        const ranked = rankCandidates(recs);
        expect(ranked[0].candidateDid).toBe('did:example:a');
        expect(ranked[1].candidateDid).toBe('did:example:z');
    });
});

// ---------------------------------------------------------------------------
// Fairness checks
// ---------------------------------------------------------------------------

describe('runFairnessChecks', () => {
    const makeRec = (did: string, id: string): MatchRecommendation => ({
        ...matchingContractStubs.recommendation,
        recommendationId: id,
        candidateDid: did,
    });

    const makeCand = (did: string, dist: number, handoffs: number): MatchCandidate => ({
        ...matchingContractStubs.candidate,
        candidateDid: did,
        distanceKm: dist,
        completedHandoffs: handoffs,
    });

    it('passes all checks for diverse results', () => {
        const recs = [
            makeRec('did:example:a', 'r1'),
            makeRec('did:example:b', 'r2'),
        ];
        const cands = [
            makeCand('did:example:a', 1, 2),
            makeCand('did:example:b', 8, 15),
        ];

        const checks = runFairnessChecks(recs, cands);
        expect(checks).toHaveLength(3);
        expect(checks.every(c => c.passed)).toBe(true);
    });

    it('detects monopoly when single candidate dominates', () => {
        const recs = [
            makeRec('did:example:a', 'r1'),
            makeRec('did:example:a', 'r2'),
        ];
        const cands = [makeCand('did:example:a', 5, 10)];

        const checks = runFairnessChecks(recs, cands);
        const monopoly = checks.find(c => c.checkName === 'no_monopoly');
        expect(monopoly?.passed).toBe(false);
    });

    it('detects lack of new user exposure', () => {
        const recs = [
            makeRec('did:example:a', 'r1'),
            makeRec('did:example:b', 'r2'),
        ];
        const cands = [
            makeCand('did:example:a', 1, 20),
            makeCand('did:example:b', 5, 10),
        ];

        const checks = runFairnessChecks(recs, cands);
        const newUser = checks.find(c => c.checkName === 'new_user_exposure');
        expect(newUser?.passed).toBe(false);
    });

    it('passes for empty recommendations', () => {
        const checks = runFairnessChecks([], []);
        expect(checks.every(c => c.passed)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Operator overrides
// ---------------------------------------------------------------------------

describe('applyOperatorOverride', () => {
    const baseRecs: MatchRecommendation[] = [
        { ...matchingContractStubs.recommendation, recommendationId: 'r1', rank: 1, overallScore: 0.9, candidateDid: 'did:example:a' },
        { ...matchingContractStubs.recommendation, recommendationId: 'r2', rank: 2, overallScore: 0.7, candidateDid: 'did:example:b' },
        { ...matchingContractStubs.recommendation, recommendationId: 'r3', rank: 3, overallScore: 0.5, candidateDid: 'did:example:c' },
    ];

    const makeOverride = (action: OperatorOverride['action'], recId: string): OperatorOverride => ({
        ...matchingContractStubs.override,
        action,
        recommendationId: recId,
    });

    it('excludes a recommendation', () => {
        const result = applyOperatorOverride(baseRecs, makeOverride('exclude', 'r2'));
        expect(result).toHaveLength(2);
        expect(result.find(r => r.recommendationId === 'r2')).toBeUndefined();
        expect(result[0].rank).toBe(1);
        expect(result[1].rank).toBe(2);
    });

    it('pins a recommendation to top', () => {
        const result = applyOperatorOverride(baseRecs, makeOverride('pin', 'r3'));
        expect(result[0].recommendationId).toBe('r3');
        expect(result[0].rank).toBe(1);
    });

    it('boosts a recommendation higher', () => {
        const result = applyOperatorOverride(baseRecs, makeOverride('boost', 'r3'));
        const r3Rank = result.find(r => r.recommendationId === 'r3')!.rank;
        expect(r3Rank).toBeLessThan(3);
    });

    it('suppresses a recommendation lower', () => {
        const result = applyOperatorOverride(baseRecs, makeOverride('suppress', 'r1'));
        const r1Rank = result.find(r => r.recommendationId === 'r1')!.rank;
        expect(r1Rank).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// Feedback loop
// ---------------------------------------------------------------------------

describe('incorporateFeedback', () => {
    it('adjusts weights based on positive feedback', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.2, score: 0.9, explanation: '' },
            { type: 'skills', weight: 0.2, score: 0.8, explanation: '' },
            { type: 'capacity', weight: 0.05, score: 0.1, explanation: '' },
        ];
        const signalMap = new Map([['rec-1', signals]]);
        const feedback: MatchFeedback[] = [
            { ...matchingContractStubs.feedback, recommendationId: 'rec-1', outcome: 'successful' },
        ];

        const newWeights = incorporateFeedback(
            DEFAULT_SIGNAL_WEIGHTS,
            feedback,
            signalMap,
        );

        // Proximity and skills should have increased
        expect(newWeights.proximity).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.proximity);
        expect(newWeights.skills).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.skills);

        // All weights should still sum to approximately 1
        const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 2);
    });

    it('adjusts weights based on negative feedback', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.2, score: 0.9, explanation: '' },
            { type: 'skills', weight: 0.2, score: 0.8, explanation: '' },
            { type: 'capacity', weight: 0.05, score: 0.1, explanation: '' },
        ];
        const signalMap = new Map([['rec-1', signals]]);
        const feedback: MatchFeedback[] = [
            { ...matchingContractStubs.feedback, recommendationId: 'rec-1', outcome: 'unsuccessful' },
        ];

        const newWeights = incorporateFeedback(
            DEFAULT_SIGNAL_WEIGHTS,
            feedback,
            signalMap,
        );

        // Top signals should decrease relative to others
        expect(newWeights.proximity).toBeLessThan(DEFAULT_SIGNAL_WEIGHTS.proximity);
    });

    it('returns unchanged weights for no-response feedback', () => {
        const signals: MatchSignal[] = [
            { type: 'proximity', weight: 0.2, score: 0.9, explanation: '' },
        ];
        const signalMap = new Map([['rec-1', signals]]);
        const feedback: MatchFeedback[] = [
            { ...matchingContractStubs.feedback, recommendationId: 'rec-1', outcome: 'no_response' },
        ];

        const newWeights = incorporateFeedback(
            DEFAULT_SIGNAL_WEIGHTS,
            feedback,
            signalMap,
        );

        // Sum should still be ~1 and no adjustments made
        const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 2);
    });
});

// ---------------------------------------------------------------------------
// Contract stubs
// ---------------------------------------------------------------------------

describe('matching contract stubs', () => {
    it('provides valid signal stub', () => {
        expect(matchingContractStubs.signal.type).toBe('proximity');
        expect(matchingContractStubs.signal.score).toBeGreaterThanOrEqual(0);
        expect(matchingContractStubs.signal.score).toBeLessThanOrEqual(1);
    });

    it('provides valid recommendation stub', () => {
        expect(matchingContractStubs.recommendation.recommendationId).toBeTruthy();
        expect(matchingContractStubs.recommendation.overallScore).toBeGreaterThanOrEqual(0);
        expect(matchingContractStubs.recommendation.overallScore).toBeLessThanOrEqual(1);
    });

    it('provides valid policy stub', () => {
        const sum = Object.values(matchingContractStubs.policy.signalWeights).reduce(
            (a, b) => a + b,
            0,
        );
        expect(sum).toBeCloseTo(1, 2);
    });
});
