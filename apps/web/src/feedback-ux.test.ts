import { describe, expect, it } from 'vitest';
import type { FeedbackSummary } from '@patchwork/shared';
import { toFeedbackForm, toFeedbackSummary } from './feedback-ux.js';

// ---------------------------------------------------------------------------
// toFeedbackForm
// ---------------------------------------------------------------------------

describe('toFeedbackForm', () => {
    it('builds an empty form', () => {
        const form = toFeedbackForm('at://req-1');
        expect(form.requestUri).toBe('at://req-1');
        expect(form.selectedOutcome).toBeNull();
        expect(form.rating).toBeNull();
        expect(form.canSubmit).toBe(false);
        expect(form.validationError).toBe('Please select an outcome.');
    });

    it('lists all outcomes', () => {
        const form = toFeedbackForm('at://req-1');
        expect(form.outcomes).toHaveLength(5);
        expect(form.outcomes.map(o => o.value)).toContain('successful');
        expect(form.outcomes.map(o => o.value)).toContain('cancelled');
    });

    it('marks selected outcome', () => {
        const form = toFeedbackForm('at://req-1', undefined, 'successful');
        const selected = form.outcomes.find(o => o.selected);
        expect(selected?.value).toBe('successful');
    });

    it('shows validation error when outcome selected but no rating', () => {
        const form = toFeedbackForm('at://req-1', undefined, 'successful', null);
        expect(form.canSubmit).toBe(false);
        expect(form.validationError).toBe('Please provide a rating.');
    });

    it('allows submit with outcome and rating', () => {
        const form = toFeedbackForm('at://req-1', undefined, 'successful', 4);
        expect(form.canSubmit).toBe(true);
        expect(form.validationError).toBeNull();
    });

    it('fills rating stars correctly', () => {
        const form = toFeedbackForm('at://req-1', undefined, 'successful', 3);
        const filled = form.ratingStars.filter(s => s.filled);
        expect(filled).toHaveLength(3);
        expect(form.ratingStars[0]!.filled).toBe(true);
        expect(form.ratingStars[2]!.filled).toBe(true);
        expect(form.ratingStars[3]!.filled).toBe(false);
    });

    it('preserves comment and tags', () => {
        const form = toFeedbackForm(
            'at://req-1',
            undefined,
            'successful',
            5,
            'Very helpful',
            ['timely', 'friendly'],
        );
        expect(form.comment).toBe('Very helpful');
        expect(form.tags).toEqual(['timely', 'friendly']);
    });

    it('creates proper aria labels for stars', () => {
        const form = toFeedbackForm('at://req-1');
        expect(form.ratingStars[0]!.ariaLabel).toBe('1 star');
        expect(form.ratingStars[1]!.ariaLabel).toBe('2 stars');
    });
});

// ---------------------------------------------------------------------------
// toFeedbackSummary
// ---------------------------------------------------------------------------

describe('toFeedbackSummary', () => {
    const makeSummary = (
        overrides: Partial<FeedbackSummary> = {},
    ): FeedbackSummary => ({
        avgRating: 4.2,
        outcomeDistribution: {
            successful: 10,
            partially_successful: 3,
            unsuccessful: 2,
            no_response: 1,
            cancelled: 0,
        },
        totalFeedback: 16,
        recentTrend: 'stable',
        ...overrides,
    });

    it('labels excellent rating', () => {
        const view = toFeedbackSummary(makeSummary({ avgRating: 4.8 }));
        expect(view.avgRatingLabel).toBe('Excellent');
    });

    it('labels good rating', () => {
        const view = toFeedbackSummary(makeSummary({ avgRating: 3.7 }));
        expect(view.avgRatingLabel).toBe('Good');
    });

    it('labels fair rating', () => {
        const view = toFeedbackSummary(makeSummary({ avgRating: 2.8 }));
        expect(view.avgRatingLabel).toBe('Fair');
    });

    it('labels needs improvement', () => {
        const view = toFeedbackSummary(makeSummary({ avgRating: 1.5 }));
        expect(view.avgRatingLabel).toBe('Needs Improvement');
    });

    it('labels no ratings when 0', () => {
        const view = toFeedbackSummary(makeSummary({ avgRating: 0 }));
        expect(view.avgRatingLabel).toBe('No ratings');
    });

    it('calculates outcome bar percentages', () => {
        const view = toFeedbackSummary(makeSummary());
        const successBar = view.outcomeBars.find(b => b.outcome === 'successful');
        expect(successBar).toBeDefined();
        expect(successBar!.count).toBe(10);
        expect(successBar!.percentage).toBe(63); // 10/16 = 62.5 -> 63
        expect(successBar!.tone).toBe('success');
    });

    it('handles zero total feedback', () => {
        const view = toFeedbackSummary(
            makeSummary({
                totalFeedback: 0,
                outcomeDistribution: {
                    successful: 0,
                    partially_successful: 0,
                    unsuccessful: 0,
                    no_response: 0,
                    cancelled: 0,
                },
            }),
        );
        expect(view.outcomeBars.every(b => b.percentage === 0)).toBe(true);
    });

    it('maps improving trend', () => {
        const view = toFeedbackSummary(makeSummary({ recentTrend: 'improving' }));
        expect(view.trendLabel).toBe('Trending up');
        expect(view.trendTone).toBe('success');
    });

    it('maps declining trend', () => {
        const view = toFeedbackSummary(makeSummary({ recentTrend: 'declining' }));
        expect(view.trendLabel).toBe('Trending down');
        expect(view.trendTone).toBe('danger');
    });

    it('maps stable trend', () => {
        const view = toFeedbackSummary(makeSummary({ recentTrend: 'stable' }));
        expect(view.trendLabel).toBe('Stable');
        expect(view.trendTone).toBe('neutral');
    });
});
