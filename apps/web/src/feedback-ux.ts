import type {
    FeedbackSummary,
    HandoffOutcome,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Local constants (avoids cross-workspace runtime import issues)
// ---------------------------------------------------------------------------

const HANDOFF_OUTCOME_VALUES: readonly HandoffOutcome[] = [
    'successful',
    'partially_successful',
    'unsuccessful',
    'no_response',
    'cancelled',
] as const;

const OUTCOME_LABELS: Readonly<Record<HandoffOutcome, string>> = {
    successful: 'Successful',
    partially_successful: 'Partially Successful',
    unsuccessful: 'Unsuccessful',
    no_response: 'No Response',
    cancelled: 'Cancelled',
};

const OUTCOME_TONES: Readonly<
    Record<HandoffOutcome, 'success' | 'info' | 'danger' | 'neutral'>
> = {
    successful: 'success',
    partially_successful: 'info',
    unsuccessful: 'danger',
    no_response: 'neutral',
    cancelled: 'neutral',
};

// ---------------------------------------------------------------------------
// Feedback form view model
// ---------------------------------------------------------------------------

export interface FeedbackFormViewModel {
    requestUri: string;
    outcomes: Array<{
        value: HandoffOutcome;
        label: string;
        selected: boolean;
    }>;
    selectedOutcome: HandoffOutcome | null;
    rating: number | null;
    ratingStars: Array<{ value: number; filled: boolean; ariaLabel: string }>;
    comment: string;
    tags: string[];
    canSubmit: boolean;
    validationError: string | null;
}

export const toFeedbackForm = (
    requestUri: string,
    _handoffMetadata?: {
        completedBy?: string;
        deliveryMethod?: string;
    },
    selectedOutcome: HandoffOutcome | null = null,
    rating: number | null = null,
    comment: string = '',
    tags: string[] = [],
): FeedbackFormViewModel => {
    const canSubmit = selectedOutcome !== null && rating !== null && rating >= 1 && rating <= 5;

    let validationError: string | null = null;
    if (selectedOutcome === null) {
        validationError = 'Please select an outcome.';
    } else if (rating === null) {
        validationError = 'Please provide a rating.';
    }

    return {
        requestUri,
        outcomes: HANDOFF_OUTCOME_VALUES.map(value => ({
            value,
            label: OUTCOME_LABELS[value],
            selected: value === selectedOutcome,
        })),
        selectedOutcome,
        rating,
        ratingStars: [1, 2, 3, 4, 5].map(value => ({
            value,
            filled: rating !== null && value <= rating,
            ariaLabel: `${value} star${value !== 1 ? 's' : ''}`,
        })),
        comment,
        tags,
        canSubmit,
        validationError: canSubmit ? null : validationError,
    };
};

// ---------------------------------------------------------------------------
// Feedback summary view model
// ---------------------------------------------------------------------------

export interface OutcomeBar {
    outcome: HandoffOutcome;
    label: string;
    count: number;
    percentage: number;
    tone: 'success' | 'info' | 'danger' | 'neutral';
}

export interface FeedbackSummaryView {
    avgRating: number;
    avgRatingLabel: string;
    totalFeedback: number;
    outcomeBars: OutcomeBar[];
    trendLabel: string;
    trendTone: 'success' | 'neutral' | 'danger';
}

export const toFeedbackSummary = (
    summary: FeedbackSummary,
): FeedbackSummaryView => {
    const avgRatingLabel =
        summary.avgRating >= 4.5 ? 'Excellent'
        : summary.avgRating >= 3.5 ? 'Good'
        : summary.avgRating >= 2.5 ? 'Fair'
        : summary.avgRating > 0 ? 'Needs Improvement'
        : 'No ratings';

    const outcomeBars: OutcomeBar[] = HANDOFF_OUTCOME_VALUES.map(outcome => {
        const count = summary.outcomeDistribution[outcome] ?? 0;
        const percentage =
            summary.totalFeedback > 0
                ? Math.round((count / summary.totalFeedback) * 100)
                : 0;

        return {
            outcome,
            label: OUTCOME_LABELS[outcome],
            count,
            percentage,
            tone: OUTCOME_TONES[outcome],
        };
    });

    const trendTone: FeedbackSummaryView['trendTone'] =
        summary.recentTrend === 'improving' ? 'success'
        : summary.recentTrend === 'declining' ? 'danger'
        : 'neutral';

    const trendLabel =
        summary.recentTrend === 'improving' ? 'Trending up'
        : summary.recentTrend === 'declining' ? 'Trending down'
        : 'Stable';

    return {
        avgRating: summary.avgRating,
        avgRatingLabel,
        totalFeedback: summary.totalFeedback,
        outcomeBars,
        trendLabel,
        trendTone,
    };
};
