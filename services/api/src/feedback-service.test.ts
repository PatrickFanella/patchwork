import { describe, expect, it, beforeEach } from 'vitest';
import { FeedbackService } from './feedback-service.js';

const SUBMITTER_DID = 'did:example:alice';
const REQUEST_URI = 'at://did:example:bob/app.patchwork.aid.post/req-1';

const makeFeedbackBody = (overrides: Record<string, unknown> = {}) => ({
    requestUri: REQUEST_URI,
    submitterDid: SUBMITTER_DID,
    outcome: 'successful',
    rating: 4,
    comment: 'Great help!',
    tags: ['timely'],
    createdAt: '2026-03-01T12:00:00.000Z',
    ...overrides,
});

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('FeedbackService', () => {
    let service: FeedbackService;

    beforeEach(() => {
        service = new FeedbackService();
    });

    // -------------------------------------------------------------------
    // Submit feedback
    // -------------------------------------------------------------------

    describe('submitFeedback', () => {
        it('accepts valid feedback', () => {
            const result = service.submitFeedback(makeFeedbackBody());
            expect(result.statusCode).toBe(201);
            const body = result.body as { feedback: { rating: number } };
            expect(body.feedback.rating).toBe(4);
        });

        it('rejects invalid outcome', () => {
            const result = service.submitFeedback(
                makeFeedbackBody({ outcome: 'amazing' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects rating out of range', () => {
            const result = service.submitFeedback(
                makeFeedbackBody({ rating: 6 }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects rating of 0', () => {
            const result = service.submitFeedback(
                makeFeedbackBody({ rating: 0 }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects missing required fields', () => {
            const result = service.submitFeedback({});
            expect(result.statusCode).toBe(400);
        });

        it('accepts feedback without optional fields', () => {
            const result = service.submitFeedback({
                requestUri: REQUEST_URI,
                submitterDid: SUBMITTER_DID,
                outcome: 'successful',
                rating: 3,
            });
            expect(result.statusCode).toBe(201);
        });
    });

    // -------------------------------------------------------------------
    // Get feedback for request
    // -------------------------------------------------------------------

    describe('getFeedbackForRequest', () => {
        it('returns feedback for a request', () => {
            service.submitFeedback(makeFeedbackBody());
            service.submitFeedback(makeFeedbackBody({ submitterDid: 'did:example:carol' }));

            const feedback = service.getFeedbackForRequest(REQUEST_URI);
            expect(feedback).toHaveLength(2);
        });

        it('returns empty array for unknown request', () => {
            const feedback = service.getFeedbackForRequest('at://unknown');
            expect(feedback).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // Get feedback by user
    // -------------------------------------------------------------------

    describe('getFeedbackByUser', () => {
        it('returns feedback from a user', () => {
            service.submitFeedback(makeFeedbackBody());
            service.submitFeedback(
                makeFeedbackBody({ requestUri: 'at://did:example:bob/app.patchwork.aid.post/req-2' }),
            );

            const feedback = service.getFeedbackByUser(SUBMITTER_DID);
            expect(feedback).toHaveLength(2);
        });

        it('returns empty array for unknown user', () => {
            const feedback = service.getFeedbackByUser('did:example:nobody');
            expect(feedback).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // Get summary
    // -------------------------------------------------------------------

    describe('getSummary', () => {
        it('returns empty summary with no feedback', () => {
            const summary = service.getSummary();
            expect(summary.totalFeedback).toBe(0);
            expect(summary.avgRating).toBe(0);
            expect(summary.recentTrend).toBe('stable');
        });

        it('calculates average rating', () => {
            service.submitFeedback(makeFeedbackBody({ rating: 5, createdAt: '2026-03-01T10:00:00.000Z' }));
            service.submitFeedback(makeFeedbackBody({ rating: 3, createdAt: '2026-03-01T11:00:00.000Z' }));

            const summary = service.getSummary();
            expect(summary.avgRating).toBe(4);
            expect(summary.totalFeedback).toBe(2);
        });

        it('calculates outcome distribution', () => {
            service.submitFeedback(makeFeedbackBody({ outcome: 'successful' }));
            service.submitFeedback(makeFeedbackBody({ outcome: 'successful' }));
            service.submitFeedback(makeFeedbackBody({ outcome: 'unsuccessful' }));

            const summary = service.getSummary();
            expect(summary.outcomeDistribution.successful).toBe(2);
            expect(summary.outcomeDistribution.unsuccessful).toBe(1);
            expect(summary.outcomeDistribution.cancelled).toBe(0);
        });

        it('detects improving trend', () => {
            service.submitFeedback(
                makeFeedbackBody({ rating: 2, createdAt: '2026-03-01T10:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 2, createdAt: '2026-03-01T11:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 5, createdAt: '2026-03-01T12:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 5, createdAt: '2026-03-01T13:00:00.000Z' }),
            );

            const summary = service.getSummary();
            expect(summary.recentTrend).toBe('improving');
        });

        it('detects declining trend', () => {
            service.submitFeedback(
                makeFeedbackBody({ rating: 5, createdAt: '2026-03-01T10:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 5, createdAt: '2026-03-01T11:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 2, createdAt: '2026-03-01T12:00:00.000Z' }),
            );
            service.submitFeedback(
                makeFeedbackBody({ rating: 1, createdAt: '2026-03-01T13:00:00.000Z' }),
            );

            const summary = service.getSummary();
            expect(summary.recentTrend).toBe('declining');
        });
    });

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    describe('getFeedbackForRequestFromParams', () => {
        it('returns feedback for a request', () => {
            service.submitFeedback(makeFeedbackBody());

            const result = service.getFeedbackForRequestFromParams(
                toParams({ requestUri: REQUEST_URI }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { feedback: unknown[] };
            expect(body.feedback).toHaveLength(1);
        });

        it('returns 400 without requestUri', () => {
            const result = service.getFeedbackForRequestFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getFeedbackByUserFromParams', () => {
        it('returns feedback by user', () => {
            service.submitFeedback(makeFeedbackBody());

            const result = service.getFeedbackByUserFromParams(
                toParams({ userDid: SUBMITTER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { feedback: unknown[] };
            expect(body.feedback).toHaveLength(1);
        });

        it('returns 400 without userDid', () => {
            const result = service.getFeedbackByUserFromParams(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getSummaryFromParams', () => {
        it('returns summary', () => {
            service.submitFeedback(makeFeedbackBody());

            const result = service.getSummaryFromParams(toParams({}));
            expect(result.statusCode).toBe(200);
            const body = result.body as { summary: { totalFeedback: number } };
            expect(body.summary.totalFeedback).toBe(1);
        });
    });
});
