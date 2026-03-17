import { z, ZodError } from 'zod';
import type {
    FeedbackSubmission,
    FeedbackSummary,
    HandoffOutcome,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local schema + constants (avoids cross-workspace runtime import issues)
// ---------------------------------------------------------------------------

const DID_PATTERN = /^did:[a-z0-9]+:[a-z0-9._:%-]+$/i;
const didSchema = z.string().regex(DID_PATTERN, 'Expected a valid DID');

const handoffOutcomeSchema = z.enum([
    'successful',
    'partially_successful',
    'unsuccessful',
    'no_response',
    'cancelled',
]);

const feedbackRatingSchema = z.number().int().min(1).max(5);

const feedbackSubmissionSchema = z.object({
    requestUri: z.string().min(1),
    submitterDid: didSchema,
    outcome: handoffOutcomeSchema,
    rating: feedbackRatingSchema,
    comment: z.string().max(2000).optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
});

const HANDOFF_OUTCOME_VALUES: readonly HandoffOutcome[] = [
    'successful',
    'partially_successful',
    'unsuccessful',
    'no_response',
    'cancelled',
] as const;

export interface FeedbackRouteResult {
    statusCode: number;
    body: unknown;
}

export class FeedbackService {
    private readonly feedbackByRequest = new Map<string, FeedbackSubmission[]>();
    private readonly feedbackByUser = new Map<string, FeedbackSubmission[]>();

    submitFeedback(body: unknown): FeedbackRouteResult {
        let submission: FeedbackSubmission;
        try {
            submission = feedbackSubmissionSchema.parse(body) as FeedbackSubmission;
        } catch (error) {
            if (error instanceof ZodError) {
                return {
                    statusCode: 400,
                    body: {
                        error: {
                            code: 'INVALID_INPUT',
                            message: 'Feedback validation failed.',
                            details: {
                                issues: error.issues.map(issue => ({
                                    path: issue.path.join('.'),
                                    message: issue.message,
                                })),
                            },
                        },
                    },
                };
            }
            throw error;
        }

        submission = {
            ...submission,
            createdAt: submission.createdAt ?? new Date().toISOString(),
        };

        // Store by request
        const requestFeedback = this.feedbackByRequest.get(submission.requestUri) ?? [];
        requestFeedback.push(submission);
        this.feedbackByRequest.set(submission.requestUri, requestFeedback);

        // Store by user
        const userFeedback = this.feedbackByUser.get(submission.submitterDid) ?? [];
        userFeedback.push(submission);
        this.feedbackByUser.set(submission.submitterDid, userFeedback);

        return { statusCode: 201, body: { feedback: submission } };
    }

    getFeedbackForRequest(requestUri: string): FeedbackSubmission[] {
        return this.feedbackByRequest.get(requestUri) ?? [];
    }

    getFeedbackByUser(userDid: string): FeedbackSubmission[] {
        return this.feedbackByUser.get(userDid) ?? [];
    }

    getSummary(_orgDid?: string): FeedbackSummary {
        // Collect all feedback (orgDid filtering would be implemented with org membership)
        const allFeedback: FeedbackSubmission[] = [];
        for (const items of this.feedbackByRequest.values()) {
            allFeedback.push(...items);
        }

        if (allFeedback.length === 0) {
            const emptyDistribution = Object.fromEntries(
                HANDOFF_OUTCOME_VALUES.map(v => [v, 0]),
            ) as Record<HandoffOutcome, number>;
            return {
                avgRating: 0,
                outcomeDistribution: emptyDistribution,
                totalFeedback: 0,
                recentTrend: 'stable',
            };
        }

        const totalRating = allFeedback.reduce((sum, f) => sum + f.rating, 0);
        const avgRating = Math.round((totalRating / allFeedback.length) * 10) / 10;

        const outcomeDistribution = Object.fromEntries(
            HANDOFF_OUTCOME_VALUES.map(v => [v, 0]),
        ) as Record<HandoffOutcome, number>;

        for (const f of allFeedback) {
            outcomeDistribution[f.outcome]++;
        }

        // Simple trend: compare first half vs second half average rating
        const sorted = [...allFeedback].sort(
            (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
        );
        const mid = Math.floor(sorted.length / 2);
        let recentTrend: FeedbackSummary['recentTrend'] = 'stable';

        if (sorted.length >= 2) {
            const firstHalf = sorted.slice(0, mid);
            const secondHalf = sorted.slice(mid);
            const firstAvg =
                firstHalf.reduce((s, f) => s + f.rating, 0) / firstHalf.length;
            const secondAvg =
                secondHalf.reduce((s, f) => s + f.rating, 0) / secondHalf.length;

            if (secondAvg - firstAvg > 0.5) recentTrend = 'improving';
            else if (firstAvg - secondAvg > 0.5) recentTrend = 'declining';
        }

        return {
            avgRating,
            outcomeDistribution,
            totalFeedback: allFeedback.length,
            recentTrend,
        };
    }

    // -------------------------------------------------------------------
    // Route handlers
    // -------------------------------------------------------------------

    submitFeedbackFromBody(body: unknown): FeedbackRouteResult {
        return this.submitFeedback(body);
    }

    getFeedbackForRequestFromParams(params: URLSearchParams): FeedbackRouteResult {
        const requestUri = params.get('requestUri')?.trim();
        if (!requestUri) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: requestUri.' } },
            };
        }

        return {
            statusCode: 200,
            body: { feedback: this.getFeedbackForRequest(requestUri) },
        };
    }

    getFeedbackByUserFromParams(params: URLSearchParams): FeedbackRouteResult {
        const userDid = params.get('userDid')?.trim();
        if (!userDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: userDid.' } },
            };
        }

        return {
            statusCode: 200,
            body: { feedback: this.getFeedbackByUser(userDid) },
        };
    }

    getSummaryFromParams(params: URLSearchParams): FeedbackRouteResult {
        const orgDid = params.get('orgDid')?.trim() || undefined;
        return {
            statusCode: 200,
            body: { summary: this.getSummary(orgDid) },
        };
    }
}

export const createFeedbackService = (): FeedbackService => {
    return new FeedbackService();
};
