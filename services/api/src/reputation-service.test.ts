import { describe, expect, it, beforeEach } from 'vitest';
import {
    ReputationService,
    createReputationService,
    createFixtureReputationService,
} from './reputation-service.js';

const VOLUNTEER_DID = 'did:example:volunteer';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('ReputationService', () => {
    let service: ReputationService;

    beforeEach(() => {
        service = new ReputationService();
    });

    // -------------------------------------------------------------------
    // Recording handoffs
    // -------------------------------------------------------------------

    describe('recordHandoffCompletion', () => {
        it('increments totalHandoffs', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.totalHandoffs).toBe(1);
            expect(signals.completedHandoffs).toBe(1);
        });

        it('tracks successful outcomes', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            service.recordHandoffCompletion(VOLUNTEER_DID, 'partially_successful', 300_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.completedHandoffs).toBe(2);
            expect(signals.totalHandoffs).toBe(2);
        });

        it('tracks unsuccessful outcomes without incrementing completed', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'unsuccessful', 300_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.completedHandoffs).toBe(0);
            expect(signals.totalHandoffs).toBe(1);
        });

        it('tracks cancelled requests', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'cancelled', 300_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.cancelledRequests).toBe(1);
            expect(signals.completedHandoffs).toBe(0);
        });

        it('tracks no_response outcome', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'no_response', 300_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.completedHandoffs).toBe(0);
            expect(signals.totalHandoffs).toBe(1);
        });

        it('accumulates response times', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 600_000);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.responseTimeAvgMs).toBe(450_000);
        });
    });

    // -------------------------------------------------------------------
    // Recording feedback
    // -------------------------------------------------------------------

    describe('recordFeedback', () => {
        it('accumulates ratings', () => {
            service.recordFeedback(VOLUNTEER_DID, 5);
            service.recordFeedback(VOLUNTEER_DID, 3);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.ratingCount).toBe(2);
            expect(signals.averageRating).toBe(4);
        });

        it('handles single rating', () => {
            service.recordFeedback(VOLUNTEER_DID, 4);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.ratingCount).toBe(1);
            expect(signals.averageRating).toBe(4);
        });
    });

    // -------------------------------------------------------------------
    // Recording moderation actions
    // -------------------------------------------------------------------

    describe('recordModerationAction', () => {
        it('increments moderation action count', () => {
            service.recordModerationAction(VOLUNTEER_DID);
            service.recordModerationAction(VOLUNTEER_DID);
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.moderationActions).toBe(2);
        });
    });

    // -------------------------------------------------------------------
    // Account metadata
    // -------------------------------------------------------------------

    describe('setAccountMetadata', () => {
        it('sets account age and verification tier', () => {
            service.setAccountMetadata(VOLUNTEER_DID, 200, 'community');
            const signals = service.getSignals(VOLUNTEER_DID);
            expect(signals.accountAgeDays).toBe(200);
            expect(signals.verificationTier).toBe('community');
        });
    });

    // -------------------------------------------------------------------
    // getReputation
    // -------------------------------------------------------------------

    describe('getReputation', () => {
        it('returns "new" for unknown user', () => {
            const score = service.getReputation('did:example:unknown');
            expect(score.trustLevel).toBe('new');
            expect(score.overall).toBe(0);
        });

        it('returns "new" for user below interaction threshold', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            const score = service.getReputation(VOLUNTEER_DID);
            expect(score.trustLevel).toBe('new');
        });

        it('returns computed score for user at threshold', () => {
            service.setAccountMetadata(VOLUNTEER_DID, 100, 'basic');
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);
            service.recordFeedback(VOLUNTEER_DID, 5);
            service.recordFeedback(VOLUNTEER_DID, 4);

            const score = service.getReputation(VOLUNTEER_DID);
            expect(score.trustLevel).not.toBe('new');
            expect(score.overall).toBeGreaterThan(0);
            expect(score.reliability).toBe(100);
        });

        it('returns valid ISO timestamp in computedAt', () => {
            const score = service.getReputation(VOLUNTEER_DID);
            expect(Date.parse(score.computedAt)).not.toBeNaN();
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('getReputationFromParams', () => {
        it('returns reputation for valid userDid', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);

            const result = service.getReputationFromParams(
                toParams({ userDid: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { reputation: { trustLevel: string } };
            expect(body.reputation.trustLevel).toBe('new');
        });

        it('returns 400 without userDid', () => {
            const result = service.getReputationFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns 400 with empty userDid', () => {
            const result = service.getReputationFromParams(
                toParams({ userDid: '  ' }),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getSignalsFromParams', () => {
        it('returns signals for valid userDid', () => {
            service.recordHandoffCompletion(VOLUNTEER_DID, 'successful', 300_000);

            const result = service.getSignalsFromParams(
                toParams({ userDid: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { signals: { totalHandoffs: number } };
            expect(body.signals.totalHandoffs).toBe(1);
        });

        it('returns 400 without userDid', () => {
            const result = service.getSignalsFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns empty signals for unknown user', () => {
            const result = service.getSignalsFromParams(
                toParams({ userDid: 'did:example:nobody' }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { signals: { totalHandoffs: number } };
            expect(body.signals.totalHandoffs).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Factory functions
    // -------------------------------------------------------------------

    describe('createReputationService', () => {
        it('returns a fresh instance', () => {
            const s = createReputationService();
            expect(s).toBeInstanceOf(ReputationService);
            const score = s.getReputation('did:example:anyone');
            expect(score.trustLevel).toBe('new');
        });
    });

    describe('createFixtureReputationService', () => {
        it('returns a pre-seeded instance', () => {
            const s = createFixtureReputationService();

            // Trusted volunteer should have a computed score
            const trusted = s.getReputation('did:example:trusted-volunteer');
            expect(trusted.trustLevel).not.toBe('new');
            expect(trusted.overall).toBeGreaterThan(0);

            // New volunteer should still be "new"
            const newVol = s.getReputation('did:example:new-volunteer');
            expect(newVol.trustLevel).toBe('new');
        });
    });
});
