import { describe, expect, it, beforeEach } from 'vitest';
import {
    MatchingService,
    createMatchingService,
    createFixtureMatchingService,
} from './matching-service.js';
import type {
    MatchCandidate,
    MatchRequestContext,
    MatchRecommendation,
    MatchExplanationTrace,
    MatchFeedback,
    MatchPolicy,
    OperatorOverride,
} from '@patchwork/shared';

const REQUEST_URI = 'at://did:example:alice/app.patchwork.aid.post/post-123';
const OPERATOR_DID = 'did:example:operator';
const REQUESTER_DID = 'did:example:alice';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

const sampleContext: MatchRequestContext = {
    requestUri: REQUEST_URI,
    category: 'food',
    urgency: 'high',
    requiredSkills: ['food-delivery'],
    locationLat: 40.7128,
    locationLng: -74.006,
};

const sampleCandidates: MatchCandidate[] = [
    {
        candidateDid: 'did:example:vol-a',
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
        candidateDid: 'did:example:vol-b',
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
    {
        candidateDid: 'did:example:vol-c',
        distanceKm: 20,
        availability: 'scheduled',
        skills: ['cooking'],
        reputationScore: 40,
        completedHandoffs: 0,
        preferredCategories: ['medical'],
        currentLoad: 2,
        maxLoad: 2,
        accountAgeDays: 10,
    },
    {
        candidateDid: 'did:example:vol-unavail',
        distanceKm: 1,
        availability: 'unavailable',
        skills: ['food-delivery'],
        reputationScore: 90,
        completedHandoffs: 25,
        preferredCategories: ['food'],
        currentLoad: 0,
        maxLoad: 5,
        accountAgeDays: 365,
    },
];

const NOW = '2026-03-01T10:00:00.000Z';

describe('MatchingService', () => {
    let service: MatchingService;

    beforeEach(() => {
        service = createMatchingService();
    });

    // -------------------------------------------------------------------
    // Recommendation generation
    // -------------------------------------------------------------------

    describe('generateRecommendations', () => {
        it('generates ranked recommendations from candidates', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            expect(recs.length).toBeGreaterThan(0);
            expect(recs.length).toBeLessThanOrEqual(sampleCandidates.length);

            // Should be ranked
            for (let i = 0; i < recs.length; i++) {
                expect(recs[i].rank).toBe(i + 1);
            }
        });

        it('excludes unavailable candidates', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const dids = recs.map(r => r.candidateDid);
            expect(dids).not.toContain('did:example:vol-unavail');
        });

        it('includes scores between 0 and 1', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            for (const rec of recs) {
                expect(rec.overallScore).toBeGreaterThanOrEqual(0);
                expect(rec.overallScore).toBeLessThanOrEqual(1);
            }
        });

        it('includes explanation summaries', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            for (const rec of recs) {
                expect(rec.explanationSummary.length).toBeGreaterThan(0);
                expect(rec.explanationSummary).toContain(rec.candidateDid);
            }
        });

        it('top-ranked candidate has highest score', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            if (recs.length > 1) {
                expect(recs[0].overallScore).toBeGreaterThanOrEqual(
                    recs[1].overallScore,
                );
            }
        });

        it('records recommendations for later retrieval', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            for (const rec of recs) {
                const retrieved = service.getRecommendation(rec.recommendationId);
                expect(retrieved).toBeDefined();
                expect(retrieved!.candidateDid).toBe(rec.candidateDid);
            }
        });

        it('returns empty for no candidates', () => {
            const recs = service.generateRecommendations(sampleContext, [], NOW);
            expect(recs).toHaveLength(0);
        });

        it('respects maxResults policy', () => {
            const policy: MatchPolicy = {
                policyId: 'limited',
                name: 'Limited Policy',
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
                minConfidence: 0,
                maxResults: 1,
                fairnessRules: [],
            };

            const limited = createMatchingService(policy);
            const recs = limited.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            expect(recs).toHaveLength(1);
        });
    });

    // -------------------------------------------------------------------
    // Retrieval
    // -------------------------------------------------------------------

    describe('getRecommendation', () => {
        it('returns undefined for unknown ID', () => {
            expect(service.getRecommendation('nonexistent')).toBeUndefined();
        });
    });

    describe('getRecommendationsForRequest', () => {
        it('returns all recommendations for a request', () => {
            service.generateRecommendations(sampleContext, sampleCandidates, NOW);

            const recs = service.getRecommendationsForRequest(REQUEST_URI);
            expect(recs.length).toBeGreaterThan(0);

            for (const rec of recs) {
                expect(rec.requestUri).toBe(REQUEST_URI);
            }
        });

        it('returns empty for unknown request', () => {
            const recs = service.getRecommendationsForRequest(
                'at://did:example:nobody/app.patchwork.aid.post/none',
            );
            expect(recs).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // Operator overrides
    // -------------------------------------------------------------------

    describe('applyOverride', () => {
        it('returns undefined for unknown recommendation', () => {
            const result = service.applyOverride({
                recommendationId: 'nonexistent',
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'Test',
            });
            expect(result).toBeUndefined();
        });

        it('applies a boost override and re-ranks', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            if (recs.length < 2) return;

            const lastRec = recs[recs.length - 1];
            const override = service.applyOverride({
                recommendationId: lastRec.recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'Known reliable volunteer',
                now: NOW,
            });

            expect(override).toBeDefined();
            expect(override!.action).toBe('boost');

            // Verify re-ranking occurred
            const updated = service.getRecommendation(lastRec.recommendationId);
            expect(updated!.rank).toBeLessThan(recs.length);
        });

        it('applies a pin override', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            if (recs.length < 2) return;

            const lastRec = recs[recs.length - 1];
            service.applyOverride({
                recommendationId: lastRec.recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'pin',
                reason: 'Pin to top',
                now: NOW,
            });

            const updated = service.getRecommendation(lastRec.recommendationId);
            expect(updated!.rank).toBe(1);
        });

        it('applies an exclude override', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const firstRec = recs[0];
            service.applyOverride({
                recommendationId: firstRec.recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'exclude',
                reason: 'Conflict of interest',
                now: NOW,
            });

            const remaining = service.getRecommendationsForRequest(REQUEST_URI);
            const dids = remaining.map(r => r.recommendationId);
            expect(dids).not.toContain(firstRec.recommendationId);
        });
    });

    describe('getOverrides', () => {
        it('returns overrides for a recommendation', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const rec = recs[0];
            service.applyOverride({
                recommendationId: rec.recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'Test boost',
                now: NOW,
            });

            const overrides = service.getOverrides(rec.recommendationId);
            expect(overrides).toHaveLength(1);
            expect(overrides[0].action).toBe('boost');
        });

        it('returns empty for no overrides', () => {
            expect(service.getOverrides('nonexistent')).toHaveLength(0);
        });
    });

    describe('getOverrideHistory', () => {
        it('returns all overrides sorted by most recent', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            if (recs.length < 2) return;

            service.applyOverride({
                recommendationId: recs[0].recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'First',
                now: '2026-03-01T10:00:00.000Z',
            });

            service.applyOverride({
                recommendationId: recs[1].recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'suppress',
                reason: 'Second',
                now: '2026-03-01T11:00:00.000Z',
            });

            const history = service.getOverrideHistory();
            expect(history).toHaveLength(2);
            expect(history[0].reason).toBe('Second');
            expect(history[1].reason).toBe('First');
        });
    });

    // -------------------------------------------------------------------
    // Feedback
    // -------------------------------------------------------------------

    describe('submitFeedback', () => {
        it('records feedback for a valid recommendation', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const fb = service.submitFeedback({
                recommendationId: recs[0].recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'successful',
                rating: 5,
                comment: 'Great help',
                now: NOW,
            });

            expect(fb).toBeDefined();
            expect(fb!.outcome).toBe('successful');
            expect(fb!.rating).toBe(5);
        });

        it('returns undefined for unknown recommendation', () => {
            const fb = service.submitFeedback({
                recommendationId: 'nonexistent',
                fromDid: REQUESTER_DID,
                outcome: 'declined',
            });

            expect(fb).toBeUndefined();
        });
    });

    describe('getFeedbackHistory', () => {
        it('returns feedback for a specific recommendation', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const rec = recs[0];
            service.submitFeedback({
                recommendationId: rec.recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'accepted',
                now: '2026-03-01T10:00:00.000Z',
            });
            service.submitFeedback({
                recommendationId: rec.recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'successful',
                rating: 4,
                now: '2026-03-01T12:00:00.000Z',
            });

            const history = service.getFeedbackHistory(rec.recommendationId);
            expect(history).toHaveLength(2);
        });

        it('returns all feedback when no recommendation specified', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            service.submitFeedback({
                recommendationId: recs[0].recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'accepted',
                now: NOW,
            });

            if (recs.length > 1) {
                service.submitFeedback({
                    recommendationId: recs[1].recommendationId,
                    fromDid: REQUESTER_DID,
                    outcome: 'declined',
                    now: NOW,
                });
            }

            const all = service.getFeedbackHistory();
            expect(all.length).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------
    // Explanation trace
    // -------------------------------------------------------------------

    describe('getExplanationTrace', () => {
        it('returns full trace for a recommendation', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const trace = service.getExplanationTrace(recs[0].recommendationId);
            expect(trace).toBeDefined();
            expect(trace!.recommendationId).toBe(recs[0].recommendationId);
            expect(trace!.signals.length).toBeGreaterThan(0);
            expect(trace!.appliedPolicies).toContain('Default Match Policy');
            expect(trace!.fairnessChecks.length).toBeGreaterThan(0);
        });

        it('includes overrides in trace', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            service.applyOverride({
                recommendationId: recs[0].recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'Test',
                now: NOW,
            });

            const trace = service.getExplanationTrace(recs[0].recommendationId);
            expect(trace!.operatorOverrides).toHaveLength(1);
            expect(trace!.operatorOverrides[0].action).toBe('boost');
        });

        it('returns undefined for unknown recommendation', () => {
            expect(service.getExplanationTrace('nonexistent')).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------
    // Policy management
    // -------------------------------------------------------------------

    describe('getMatchPolicy', () => {
        it('returns the current policy', () => {
            const policy = service.getMatchPolicy();
            expect(policy.policyId).toBe('default');
            expect(policy.name).toBe('Default Match Policy');
        });
    });

    describe('updateMatchPolicy', () => {
        it('updates policy fields while preserving policyId', () => {
            const updated = service.updateMatchPolicy({
                name: 'Custom Policy',
                maxResults: 5,
            });

            expect(updated.policyId).toBe('default');
            expect(updated.name).toBe('Custom Policy');
            expect(updated.maxResults).toBe(5);
        });

        it('persists updated policy', () => {
            service.updateMatchPolicy({ minConfidence: 0.5 });
            const policy = service.getMatchPolicy();
            expect(policy.minConfidence).toBe(0.5);
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('getRecommendationFromParams', () => {
        it('returns recommendation for valid ID', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const result = service.getRecommendationFromParams(
                toParams({ recommendationId: recs[0].recommendationId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { recommendation: MatchRecommendation };
            expect(body.recommendation.candidateDid).toBe(recs[0].candidateDid);
        });

        it('returns 400 without recommendationId', () => {
            const result = service.getRecommendationFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns 404 for unknown recommendationId', () => {
            const result = service.getRecommendationFromParams(
                toParams({ recommendationId: 'nonexistent' }),
            );
            expect(result.statusCode).toBe(404);
        });
    });

    describe('getRecommendationsForRequestFromParams', () => {
        it('returns recommendations for valid requestUri', () => {
            service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const result = service.getRecommendationsForRequestFromParams(
                toParams({ requestUri: REQUEST_URI }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { recommendations: MatchRecommendation[] };
            expect(body.recommendations.length).toBeGreaterThan(0);
        });

        it('returns 400 without requestUri', () => {
            const result = service.getRecommendationsForRequestFromParams(
                toParams({}),
            );
            expect(result.statusCode).toBe(400);
        });

        it('returns empty array for unknown requestUri', () => {
            const result = service.getRecommendationsForRequestFromParams(
                toParams({ requestUri: 'at://unknown/post/none' }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { recommendations: MatchRecommendation[] };
            expect(body.recommendations).toHaveLength(0);
        });
    });

    describe('getExplanationTraceFromParams', () => {
        it('returns trace for valid ID', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            const result = service.getExplanationTraceFromParams(
                toParams({ recommendationId: recs[0].recommendationId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { trace: MatchExplanationTrace };
            expect(body.trace.signals.length).toBeGreaterThan(0);
        });

        it('returns 400 without recommendationId', () => {
            const result = service.getExplanationTraceFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns 404 for unknown recommendationId', () => {
            const result = service.getExplanationTraceFromParams(
                toParams({ recommendationId: 'nonexistent' }),
            );
            expect(result.statusCode).toBe(404);
        });
    });

    describe('getOverridesFromParams', () => {
        it('returns overrides for valid recommendationId', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            service.applyOverride({
                recommendationId: recs[0].recommendationId,
                operatorDid: OPERATOR_DID,
                action: 'boost',
                reason: 'Test',
                now: NOW,
            });

            const result = service.getOverridesFromParams(
                toParams({ recommendationId: recs[0].recommendationId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { overrides: OperatorOverride[] };
            expect(body.overrides).toHaveLength(1);
        });

        it('returns 400 without recommendationId', () => {
            const result = service.getOverridesFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getFeedbackFromParams', () => {
        it('returns all feedback without recommendation filter', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            service.submitFeedback({
                recommendationId: recs[0].recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'accepted',
                now: NOW,
            });

            const result = service.getFeedbackFromParams(toParams({}));
            expect(result.statusCode).toBe(200);
            const body = result.body as { feedback: MatchFeedback[] };
            expect(body.feedback.length).toBeGreaterThan(0);
        });

        it('filters by recommendationId when provided', () => {
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );

            service.submitFeedback({
                recommendationId: recs[0].recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'accepted',
                now: NOW,
            });

            const result = service.getFeedbackFromParams(
                toParams({ recommendationId: recs[0].recommendationId }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { feedback: MatchFeedback[] };
            expect(body.feedback).toHaveLength(1);
        });
    });

    describe('getPolicyFromParams', () => {
        it('returns the current policy', () => {
            const result = service.getPolicyFromParams(toParams({}));
            expect(result.statusCode).toBe(200);
            const body = result.body as { policy: MatchPolicy };
            expect(body.policy.policyId).toBe('default');
        });
    });

    // -------------------------------------------------------------------
    // Factory functions
    // -------------------------------------------------------------------

    describe('createMatchingService', () => {
        it('returns a fresh instance', () => {
            const s = createMatchingService();
            expect(s).toBeInstanceOf(MatchingService);
            const policy = s.getMatchPolicy();
            expect(policy.policyId).toBe('default');
        });
    });

    describe('createFixtureMatchingService', () => {
        it('returns a pre-seeded instance', () => {
            const s = createFixtureMatchingService();
            const recs = s.getRecommendationsForRequest(
                'at://did:example:alice/app.patchwork.aid.post/post-fixture',
            );
            expect(recs.length).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------
    // E2E: full matching + override + feedback flow
    // -------------------------------------------------------------------

    describe('E2E: full matching workflow', () => {
        it('generates, overrides, collects feedback, and traces', () => {
            // 1. Generate recommendations
            const recs = service.generateRecommendations(
                sampleContext,
                sampleCandidates,
                NOW,
            );
            expect(recs.length).toBeGreaterThan(0);

            // 2. Operator boosts second candidate
            if (recs.length > 1) {
                const override = service.applyOverride({
                    recommendationId: recs[1].recommendationId,
                    operatorDid: OPERATOR_DID,
                    action: 'pin',
                    reason: 'Known volunteer for this area',
                    now: NOW,
                });
                expect(override).toBeDefined();

                const updated = service.getRecommendation(
                    recs[1].recommendationId,
                );
                expect(updated!.rank).toBe(1);
            }

            // 3. Submit feedback
            const fb = service.submitFeedback({
                recommendationId: recs[0].recommendationId,
                fromDid: REQUESTER_DID,
                outcome: 'successful',
                rating: 5,
                comment: 'Quick and helpful',
                now: NOW,
            });
            expect(fb).toBeDefined();

            // 4. Get explanation trace
            const trace = service.getExplanationTrace(
                recs[0].recommendationId,
            );
            expect(trace).toBeDefined();
            expect(trace!.signals.length).toBeGreaterThan(0);
            expect(trace!.fairnessChecks.length).toBeGreaterThan(0);

            // 5. Verify override history
            const overrideHistory = service.getOverrideHistory();
            expect(overrideHistory.length).toBeGreaterThanOrEqual(
                recs.length > 1 ? 1 : 0,
            );

            // 6. Verify feedback history
            const fbHistory = service.getFeedbackHistory();
            expect(fbHistory).toHaveLength(1);
        });
    });
});
