import { describe, expect, it } from 'vitest';
import {
    computeReputation,
    MIN_INTERACTIONS_FOR_SCORE,
    MIN_RATINGS_FOR_DISPLAY,
    TRUST_LEVEL_THRESHOLDS,
    TRUST_LEVELS,
    TRUST_LEVEL_LABELS,
    TRUST_LEVEL_TONES,
    type ReputationSignals,
} from './reputation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSignals = (overrides: Partial<ReputationSignals> = {}): ReputationSignals => ({
    completedHandoffs: 5,
    totalHandoffs: 5,
    averageRating: 4.5,
    ratingCount: 5,
    responseTimeAvgMs: 600_000, // 10 minutes
    accountAgeDays: 180,
    verificationTier: 'community',
    moderationActions: 0,
    cancelledRequests: 0,
    ...overrides,
});

describe('reputation scoring', () => {
    // -------------------------------------------------------------------
    // New user / insufficient interactions
    // -------------------------------------------------------------------

    describe('new user (insufficient interactions)', () => {
        it('returns "new" trust level with 0 handoffs', () => {
            const score = computeReputation(makeSignals({ totalHandoffs: 0 }));
            expect(score.trustLevel).toBe('new');
            expect(score.overall).toBe(0);
            expect(score.reliability).toBe(0);
            expect(score.responsiveness).toBe(0);
            expect(score.communityRating).toBe(0);
        });

        it('returns "new" trust level with interactions below threshold', () => {
            const score = computeReputation(
                makeSignals({ totalHandoffs: MIN_INTERACTIONS_FOR_SCORE - 1 }),
            );
            expect(score.trustLevel).toBe('new');
            expect(score.overall).toBe(0);
        });

        it('computes a real score once threshold is met', () => {
            const score = computeReputation(
                makeSignals({ totalHandoffs: MIN_INTERACTIONS_FOR_SCORE }),
            );
            expect(score.trustLevel).not.toBe('new');
            expect(score.overall).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------
    // Reliability
    // -------------------------------------------------------------------

    describe('reliability', () => {
        it('perfect completion rate yields high reliability', () => {
            const score = computeReputation(
                makeSignals({
                    completedHandoffs: 10,
                    totalHandoffs: 10,
                    cancelledRequests: 0,
                }),
            );
            expect(score.reliability).toBe(100);
        });

        it('50% completion rate yields ~50 reliability', () => {
            const score = computeReputation(
                makeSignals({
                    completedHandoffs: 5,
                    totalHandoffs: 10,
                    cancelledRequests: 0,
                }),
            );
            expect(score.reliability).toBe(50);
        });

        it('cancellations penalize reliability', () => {
            const withoutCancel = computeReputation(
                makeSignals({
                    completedHandoffs: 8,
                    totalHandoffs: 10,
                    cancelledRequests: 0,
                }),
            );
            const withCancel = computeReputation(
                makeSignals({
                    completedHandoffs: 8,
                    totalHandoffs: 10,
                    cancelledRequests: 4,
                }),
            );
            expect(withCancel.reliability).toBeLessThan(withoutCancel.reliability);
        });

        it('reliability cannot go below 0', () => {
            const score = computeReputation(
                makeSignals({
                    completedHandoffs: 0,
                    totalHandoffs: 10,
                    cancelledRequests: 10,
                }),
            );
            expect(score.reliability).toBeGreaterThanOrEqual(0);
        });
    });

    // -------------------------------------------------------------------
    // Responsiveness
    // -------------------------------------------------------------------

    describe('responsiveness', () => {
        it('fast response time yields high responsiveness', () => {
            const score = computeReputation(
                makeSignals({ responseTimeAvgMs: 60_000 }), // 1 minute
            );
            expect(score.responsiveness).toBe(100);
        });

        it('slow response time yields low responsiveness', () => {
            const score = computeReputation(
                makeSignals({ responseTimeAvgMs: 24 * 60 * 60 * 1000 }), // 24 hours
            );
            expect(score.responsiveness).toBe(0);
        });

        it('moderate response time yields moderate responsiveness', () => {
            // ~12 hours - roughly middle of 5min to 24h range
            const score = computeReputation(
                makeSignals({ responseTimeAvgMs: 12 * 60 * 60 * 1000 }),
            );
            expect(score.responsiveness).toBeGreaterThan(10);
            expect(score.responsiveness).toBeLessThan(90);
        });

        it('zero response time yields 0 responsiveness', () => {
            const score = computeReputation(
                makeSignals({ responseTimeAvgMs: 0 }),
            );
            expect(score.responsiveness).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Community rating
    // -------------------------------------------------------------------

    describe('community rating', () => {
        it('high average rating yields high community rating', () => {
            const score = computeReputation(
                makeSignals({ averageRating: 5, ratingCount: 10 }),
            );
            expect(score.communityRating).toBe(100);
        });

        it('minimum rating yields 0 community rating', () => {
            const score = computeReputation(
                makeSignals({ averageRating: 1, ratingCount: 10 }),
            );
            expect(score.communityRating).toBe(0);
        });

        it('mid-range rating yields ~50 community rating', () => {
            const score = computeReputation(
                makeSignals({ averageRating: 3, ratingCount: 10 }),
            );
            expect(score.communityRating).toBe(50);
        });

        it('insufficient ratings yield 0 community rating', () => {
            const score = computeReputation(
                makeSignals({
                    averageRating: 5,
                    ratingCount: MIN_RATINGS_FOR_DISPLAY - 1,
                }),
            );
            expect(score.communityRating).toBe(0);
        });

        it('exactly MIN_RATINGS_FOR_DISPLAY ratings are sufficient', () => {
            const score = computeReputation(
                makeSignals({
                    averageRating: 5,
                    ratingCount: MIN_RATINGS_FOR_DISPLAY,
                }),
            );
            expect(score.communityRating).toBe(100);
        });
    });

    // -------------------------------------------------------------------
    // Trust bonus
    // -------------------------------------------------------------------

    describe('trust bonus', () => {
        it('old account with high verification has high trust bonus', () => {
            const highTrust = computeReputation(
                makeSignals({ accountAgeDays: 365, verificationTier: 'full' }),
            );
            const lowTrust = computeReputation(
                makeSignals({ accountAgeDays: 1, verificationTier: 'none' }),
            );
            expect(highTrust.overall).toBeGreaterThan(lowTrust.overall);
        });

        it('brand new account with no verification gets minimal trust bonus', () => {
            const score = computeReputation(
                makeSignals({ accountAgeDays: 0, verificationTier: 'none' }),
            );
            // The overall should still be positive from other sub-scores
            expect(score.overall).toBeGreaterThanOrEqual(0);
        });
    });

    // -------------------------------------------------------------------
    // Moderation penalties
    // -------------------------------------------------------------------

    describe('moderation penalties', () => {
        it('moderation actions reduce overall score', () => {
            const clean = computeReputation(makeSignals({ moderationActions: 0 }));
            const penalized = computeReputation(makeSignals({ moderationActions: 3 }));
            expect(penalized.overall).toBeLessThan(clean.overall);
        });

        it('many moderation actions can bring score to 0', () => {
            const score = computeReputation(
                makeSignals({ moderationActions: 100 }),
            );
            expect(score.overall).toBe(0);
        });

        it('score does not go negative', () => {
            const score = computeReputation(
                makeSignals({ moderationActions: 1000 }),
            );
            expect(score.overall).toBeGreaterThanOrEqual(0);
        });
    });

    // -------------------------------------------------------------------
    // Trust level determination
    // -------------------------------------------------------------------

    describe('trust level thresholds', () => {
        it('thresholds are in ascending order', () => {
            const thresholdValues = TRUST_LEVELS.map(
                level => TRUST_LEVEL_THRESHOLDS[level],
            );
            for (let i = 1; i < thresholdValues.length; i++) {
                expect(thresholdValues[i]).toBeGreaterThanOrEqual(thresholdValues[i - 1]);
            }
        });

        it('exemplary trust level for very high scores', () => {
            const score = computeReputation(
                makeSignals({
                    completedHandoffs: 100,
                    totalHandoffs: 100,
                    averageRating: 5,
                    ratingCount: 50,
                    responseTimeAvgMs: 60_000,
                    accountAgeDays: 365,
                    verificationTier: 'full',
                    moderationActions: 0,
                    cancelledRequests: 0,
                }),
            );
            expect(score.trustLevel).toBe('exemplary');
            expect(score.overall).toBeGreaterThanOrEqual(80);
        });
    });

    // -------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------

    describe('edge cases', () => {
        it('all zero signals below threshold', () => {
            const score = computeReputation({
                completedHandoffs: 0,
                totalHandoffs: 0,
                averageRating: 0,
                ratingCount: 0,
                responseTimeAvgMs: 0,
                accountAgeDays: 0,
                verificationTier: 'none',
                moderationActions: 0,
                cancelledRequests: 0,
            });
            expect(score.trustLevel).toBe('new');
            expect(score.overall).toBe(0);
        });

        it('exactly at threshold with all zeros except handoffs', () => {
            const score = computeReputation({
                completedHandoffs: 0,
                totalHandoffs: MIN_INTERACTIONS_FOR_SCORE,
                averageRating: 0,
                ratingCount: 0,
                responseTimeAvgMs: 0,
                accountAgeDays: 0,
                verificationTier: 'none',
                moderationActions: 0,
                cancelledRequests: 0,
            });
            // Should produce a real score (even if 0)
            expect(score.trustLevel).toBe('new');
            expect(score.overall).toBe(0);
        });

        it('computedAt is a valid ISO timestamp', () => {
            const score = computeReputation(makeSignals());
            expect(Date.parse(score.computedAt)).not.toBeNaN();
        });

        it('score is deterministic for same inputs', () => {
            const signals = makeSignals();
            const score1 = computeReputation(signals);
            const score2 = computeReputation(signals);
            expect(score1.overall).toBe(score2.overall);
            expect(score1.reliability).toBe(score2.reliability);
            expect(score1.responsiveness).toBe(score2.responsiveness);
            expect(score1.communityRating).toBe(score2.communityRating);
            expect(score1.trustLevel).toBe(score2.trustLevel);
        });

        it('very old account maxes out age bonus', () => {
            const score1 = computeReputation(makeSignals({ accountAgeDays: 365 }));
            const score2 = computeReputation(makeSignals({ accountAgeDays: 3650 }));
            // Beyond 365 days the age bonus should be the same
            expect(score1.overall).toBe(score2.overall);
        });
    });

    // -------------------------------------------------------------------
    // Labels and tones
    // -------------------------------------------------------------------

    describe('labels and tones', () => {
        it('every trust level has a label', () => {
            for (const level of TRUST_LEVELS) {
                expect(TRUST_LEVEL_LABELS[level]).toBeTruthy();
                expect(typeof TRUST_LEVEL_LABELS[level]).toBe('string');
            }
        });

        it('every trust level has a tone', () => {
            for (const level of TRUST_LEVELS) {
                expect(TRUST_LEVEL_TONES[level]).toBeTruthy();
                expect(['neutral', 'info', 'success']).toContain(
                    TRUST_LEVEL_TONES[level],
                );
            }
        });
    });
});
