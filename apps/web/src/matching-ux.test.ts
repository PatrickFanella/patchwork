import { describe, expect, it } from 'vitest';
import {
    buildMatchingDashboard,
    FEEDBACK_OUTCOME_OPTIONS,
    OVERRIDE_ACTION_OPTIONS,
    toExplanationViewModel,
    toFairnessCheckViewModel,
    toFeedbackViewModel,
    toOverrideViewModel,
    toRecommendationCard,
    toSignalBar,
} from './matching-ux.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleSignal = {
    type: 'proximity' as const,
    weight: 0.2,
    score: 0.85,
    explanation: 'Candidate is 3km away',
};

const sampleRecommendation = {
    recommendationId: 'rec-001',
    candidateDid: 'did:example:vol1',
    requestUri: 'at://did:example:alice/app.patchwork.aid.post/post-123',
    overallScore: 0.78,
    signals: [
        sampleSignal,
        {
            type: 'skills' as const,
            weight: 0.2,
            score: 1,
            explanation: 'Matches 1/1 required skills',
        },
        {
            type: 'availability' as const,
            weight: 0.15,
            score: 0.7,
            explanation: 'Availability: within-24h',
        },
    ],
    rank: 1,
    explanationSummary: 'Scored 78% for did:example:vol1.',
    confidence: 0.85,
    generatedAt: '2026-03-01T10:00:00.000Z',
};

const sampleFairnessCheck = {
    checkName: 'geographic_diversity',
    passed: true,
    details: 'Geographic distribution is adequate',
};

const sampleOverride = {
    overrideId: 'ovr-001',
    recommendationId: 'rec-001',
    operatorDid: 'did:example:operator',
    action: 'boost' as const,
    reason: 'Known reliable volunteer',
    appliedAt: '2026-03-01T10:05:00.000Z',
};

const sampleFeedback = {
    feedbackId: 'fb-001',
    recommendationId: 'rec-001',
    fromDid: 'did:example:alice',
    outcome: 'successful' as const,
    rating: 5,
    comment: 'Great help',
    submittedAt: '2026-03-01T12:00:00.000Z',
};

const sampleTrace = {
    recommendationId: 'rec-001',
    signals: [sampleSignal],
    appliedPolicies: ['Default Match Policy'],
    fairnessChecks: [sampleFairnessCheck],
    operatorOverrides: [sampleOverride],
    traceGeneratedAt: '2026-03-01T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Signal bar
// ---------------------------------------------------------------------------

describe('toSignalBar', () => {
    it('transforms signal to bar view model', () => {
        const bar = toSignalBar(sampleSignal);
        expect(bar.type).toBe('proximity');
        expect(bar.label).toBe('Proximity');
        expect(bar.scorePercent).toBe(85);
        expect(bar.weightedContribution).toBeCloseTo(0.17, 2);
        expect(bar.explanation).toBe('Candidate is 3km away');
    });

    it('includes accessible aria label', () => {
        const bar = toSignalBar(sampleSignal);
        expect(bar.ariaLabel).toContain('Proximity');
        expect(bar.ariaLabel).toContain('85%');
    });
});

// ---------------------------------------------------------------------------
// Recommendation card
// ---------------------------------------------------------------------------

describe('toRecommendationCard', () => {
    it('transforms recommendation to card view model', () => {
        const card = toRecommendationCard(sampleRecommendation);
        expect(card.recommendationId).toBe('rec-001');
        expect(card.candidateDid).toBe('did:example:vol1');
        expect(card.rankLabel).toBe('#1');
        expect(card.overallScorePercent).toBe(78);
        expect(card.confidencePercent).toBe(85);
        expect(card.signalBars).toHaveLength(3);
    });

    it('assigns correct score tone for high score', () => {
        const card = toRecommendationCard({
            ...sampleRecommendation,
            overallScore: 0.9,
        });
        expect(card.scoreTone).toBe('success');
    });

    it('assigns correct score tone for medium score', () => {
        const card = toRecommendationCard({
            ...sampleRecommendation,
            overallScore: 0.55,
        });
        expect(card.scoreTone).toBe('info');
    });

    it('assigns correct score tone for low score', () => {
        const card = toRecommendationCard({
            ...sampleRecommendation,
            overallScore: 0.15,
        });
        expect(card.scoreTone).toBe('danger');
    });

    it('includes accessible aria label', () => {
        const card = toRecommendationCard(sampleRecommendation);
        expect(card.ariaLabel).toContain('#1');
        expect(card.ariaLabel).toContain('did:example:vol1');
        expect(card.ariaLabel).toContain('78%');
    });
});

// ---------------------------------------------------------------------------
// Fairness check
// ---------------------------------------------------------------------------

describe('toFairnessCheckViewModel', () => {
    it('transforms passing check', () => {
        const vm = toFairnessCheckViewModel(sampleFairnessCheck);
        expect(vm.statusLabel).toBe('Passed');
        expect(vm.tone).toBe('success');
    });

    it('transforms failing check', () => {
        const vm = toFairnessCheckViewModel({
            ...sampleFairnessCheck,
            passed: false,
            details: 'Issue found',
        });
        expect(vm.statusLabel).toBe('Warning');
        expect(vm.tone).toBe('danger');
    });

    it('includes accessible aria label', () => {
        const vm = toFairnessCheckViewModel(sampleFairnessCheck);
        expect(vm.ariaLabel).toContain('geographic_diversity');
        expect(vm.ariaLabel).toContain('Passed');
    });
});

// ---------------------------------------------------------------------------
// Explanation view model
// ---------------------------------------------------------------------------

describe('toExplanationViewModel', () => {
    it('transforms trace to explanation view model', () => {
        const vm = toExplanationViewModel(sampleTrace);
        expect(vm.recommendationId).toBe('rec-001');
        expect(vm.signalBars).toHaveLength(1);
        expect(vm.appliedPolicies).toContain('Default Match Policy');
        expect(vm.fairnessChecks).toHaveLength(1);
        expect(vm.overrideCount).toBe(1);
    });

    it('includes accessible aria label', () => {
        const vm = toExplanationViewModel(sampleTrace);
        expect(vm.ariaLabel).toContain('rec-001');
        expect(vm.ariaLabel).toContain('1 signals');
        expect(vm.ariaLabel).toContain('1 fairness checks');
    });
});

// ---------------------------------------------------------------------------
// Operator override view model
// ---------------------------------------------------------------------------

describe('toOverrideViewModel', () => {
    it('transforms boost override', () => {
        const vm = toOverrideViewModel(sampleOverride);
        expect(vm.actionLabel).toBe('Boost');
        expect(vm.tone).toBe('info');
        expect(vm.reason).toBe('Known reliable volunteer');
    });

    it('transforms exclude override', () => {
        const vm = toOverrideViewModel({
            ...sampleOverride,
            action: 'exclude',
        });
        expect(vm.actionLabel).toBe('Exclude');
        expect(vm.tone).toBe('danger');
    });

    it('transforms pin override', () => {
        const vm = toOverrideViewModel({
            ...sampleOverride,
            action: 'pin',
        });
        expect(vm.actionLabel).toBe('Pin to Top');
        expect(vm.tone).toBe('success');
    });

    it('transforms suppress override', () => {
        const vm = toOverrideViewModel({
            ...sampleOverride,
            action: 'suppress',
        });
        expect(vm.actionLabel).toBe('Suppress');
        expect(vm.tone).toBe('neutral');
    });

    it('includes accessible aria label', () => {
        const vm = toOverrideViewModel(sampleOverride);
        expect(vm.ariaLabel).toContain('Boost');
        expect(vm.ariaLabel).toContain('did:example:operator');
    });
});

describe('OVERRIDE_ACTION_OPTIONS', () => {
    it('provides all 4 override actions', () => {
        expect(OVERRIDE_ACTION_OPTIONS).toHaveLength(4);
        const actions = OVERRIDE_ACTION_OPTIONS.map(o => o.action);
        expect(actions).toContain('boost');
        expect(actions).toContain('suppress');
        expect(actions).toContain('pin');
        expect(actions).toContain('exclude');
    });

    it('each option has label and ariaLabel', () => {
        for (const option of OVERRIDE_ACTION_OPTIONS) {
            expect(option.label.length).toBeGreaterThan(0);
            expect(option.ariaLabel.length).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Feedback view model
// ---------------------------------------------------------------------------

describe('toFeedbackViewModel', () => {
    it('transforms feedback with rating', () => {
        const vm = toFeedbackViewModel(sampleFeedback);
        expect(vm.outcomeLabel).toBe('Successful');
        expect(vm.outcomeTone).toBe('success');
        expect(vm.rating).toBe(5);
        expect(vm.ratingDisplay).toBe('5/5');
        expect(vm.comment).toBe('Great help');
    });

    it('handles feedback without rating', () => {
        const vm = toFeedbackViewModel({
            ...sampleFeedback,
            rating: undefined,
        });
        expect(vm.rating).toBeNull();
        expect(vm.ratingDisplay).toBe('No rating');
    });

    it('handles feedback without comment', () => {
        const vm = toFeedbackViewModel({
            ...sampleFeedback,
            comment: undefined,
        });
        expect(vm.comment).toBeNull();
    });

    it('maps outcome tones correctly', () => {
        expect(
            toFeedbackViewModel({ ...sampleFeedback, outcome: 'accepted' })
                .outcomeTone,
        ).toBe('info');
        expect(
            toFeedbackViewModel({ ...sampleFeedback, outcome: 'declined' })
                .outcomeTone,
        ).toBe('danger');
        expect(
            toFeedbackViewModel({ ...sampleFeedback, outcome: 'no_response' })
                .outcomeTone,
        ).toBe('neutral');
        expect(
            toFeedbackViewModel({ ...sampleFeedback, outcome: 'unsuccessful' })
                .outcomeTone,
        ).toBe('danger');
    });

    it('includes accessible aria label', () => {
        const vm = toFeedbackViewModel(sampleFeedback);
        expect(vm.ariaLabel).toContain('did:example:alice');
        expect(vm.ariaLabel).toContain('Successful');
        expect(vm.ariaLabel).toContain('5/5');
    });
});

describe('FEEDBACK_OUTCOME_OPTIONS', () => {
    it('provides all 5 outcome options', () => {
        expect(FEEDBACK_OUTCOME_OPTIONS).toHaveLength(5);
        const outcomes = FEEDBACK_OUTCOME_OPTIONS.map(o => o.outcome);
        expect(outcomes).toContain('accepted');
        expect(outcomes).toContain('declined');
        expect(outcomes).toContain('no_response');
        expect(outcomes).toContain('successful');
        expect(outcomes).toContain('unsuccessful');
    });
});

// ---------------------------------------------------------------------------
// Dashboard view model
// ---------------------------------------------------------------------------

describe('buildMatchingDashboard', () => {
    it('builds dashboard from recommendations, overrides, and feedback', () => {
        const dashboard = buildMatchingDashboard({
            recommendations: [
                sampleRecommendation,
                {
                    ...sampleRecommendation,
                    recommendationId: 'rec-002',
                    overallScore: 0.6,
                    confidence: 0.7,
                    rank: 2,
                },
            ],
            overrides: [sampleOverride],
            feedback: [sampleFeedback],
            fairnessChecks: [
                sampleFairnessCheck,
                { ...sampleFairnessCheck, checkName: 'no_monopoly' },
            ],
        });

        expect(dashboard.totalRecommendations).toBe(2);
        expect(dashboard.averageScore).toBe(69); // (78+60)/2 = 69
        expect(dashboard.overrideCount).toBe(1);
        expect(dashboard.feedbackCount).toBe(1);
        expect(dashboard.fairnessCheckSummary.total).toBe(2);
        expect(dashboard.fairnessCheckSummary.passed).toBe(2);
        expect(dashboard.fairnessCheckSummary.warnings).toBe(0);
    });

    it('handles empty input', () => {
        const dashboard = buildMatchingDashboard({
            recommendations: [],
            overrides: [],
            feedback: [],
            fairnessChecks: [],
        });

        expect(dashboard.totalRecommendations).toBe(0);
        expect(dashboard.averageScore).toBe(0);
        expect(dashboard.averageConfidence).toBe(0);
        expect(dashboard.overrideCount).toBe(0);
        expect(dashboard.feedbackCount).toBe(0);
    });

    it('counts fairness warnings', () => {
        const dashboard = buildMatchingDashboard({
            recommendations: [],
            overrides: [],
            feedback: [],
            fairnessChecks: [
                sampleFairnessCheck,
                { ...sampleFairnessCheck, passed: false, checkName: 'monopoly' },
            ],
        });

        expect(dashboard.fairnessCheckSummary.passed).toBe(1);
        expect(dashboard.fairnessCheckSummary.warnings).toBe(1);
    });

    it('includes accessible aria label', () => {
        const dashboard = buildMatchingDashboard({
            recommendations: [sampleRecommendation],
            overrides: [sampleOverride],
            feedback: [sampleFeedback],
            fairnessChecks: [sampleFairnessCheck],
        });

        expect(dashboard.ariaLabel).toContain('1 recommendations');
        expect(dashboard.ariaLabel).toContain('1 overrides');
        expect(dashboard.ariaLabel).toContain('1 feedback');
    });
});
