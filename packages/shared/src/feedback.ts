import { z } from 'zod';
import { didSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Handoff outcome taxonomy
// ---------------------------------------------------------------------------

export const handoffOutcomeValues = [
    'successful',
    'partially_successful',
    'unsuccessful',
    'no_response',
    'cancelled',
] as const;

export const handoffOutcomeSchema = z.enum(handoffOutcomeValues);
export type HandoffOutcome = z.infer<typeof handoffOutcomeSchema>;

// ---------------------------------------------------------------------------
// Feedback rating (1-5)
// ---------------------------------------------------------------------------

export const feedbackRatingSchema = z.number().int().min(1).max(5);
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;

// ---------------------------------------------------------------------------
// Feedback submission
// ---------------------------------------------------------------------------

export const feedbackSubmissionSchema = z.object({
    requestUri: z.string().min(1),
    submitterDid: didSchema,
    outcome: handoffOutcomeSchema,
    rating: feedbackRatingSchema,
    comment: z.string().max(2000).optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
});

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

// ---------------------------------------------------------------------------
// Feedback summary (aggregated)
// ---------------------------------------------------------------------------

export interface FeedbackSummary {
    avgRating: number;
    outcomeDistribution: Record<HandoffOutcome, number>;
    totalFeedback: number;
    recentTrend: 'improving' | 'stable' | 'declining';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const OUTCOME_LABELS: Readonly<Record<HandoffOutcome, string>> = {
    successful: 'Successful',
    partially_successful: 'Partially Successful',
    unsuccessful: 'Unsuccessful',
    no_response: 'No Response',
    cancelled: 'Cancelled',
};

export const OUTCOME_TONES: Readonly<
    Record<HandoffOutcome, 'success' | 'info' | 'danger' | 'neutral'>
> = {
    successful: 'success',
    partially_successful: 'info',
    unsuccessful: 'danger',
    no_response: 'neutral',
    cancelled: 'neutral',
};
