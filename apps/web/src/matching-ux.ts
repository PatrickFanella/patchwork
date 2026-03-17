// ---------------------------------------------------------------------------
// Matching UX: view models for the explainable matching assistant
// ---------------------------------------------------------------------------

// Local type definitions (avoids cross-workspace runtime import issues)

type MatchSignalType =
    | 'proximity'
    | 'availability'
    | 'skills'
    | 'reputation'
    | 'history'
    | 'preference'
    | 'urgency'
    | 'capacity';

interface MatchSignal {
    type: MatchSignalType;
    weight: number;
    score: number;
    explanation: string;
}

interface MatchRecommendation {
    recommendationId: string;
    candidateDid: string;
    requestUri: string;
    overallScore: number;
    signals: MatchSignal[];
    rank: number;
    explanationSummary: string;
    confidence: number;
    generatedAt: string;
}

interface FairnessCheck {
    checkName: string;
    passed: boolean;
    details: string;
}

type OverrideAction = 'boost' | 'suppress' | 'pin' | 'exclude';

interface OperatorOverride {
    overrideId: string;
    recommendationId: string;
    operatorDid: string;
    action: OverrideAction;
    reason: string;
    appliedAt: string;
}

type MatchFeedbackOutcome =
    | 'accepted'
    | 'declined'
    | 'no_response'
    | 'successful'
    | 'unsuccessful';

interface MatchFeedback {
    feedbackId: string;
    recommendationId: string;
    fromDid: string;
    outcome: MatchFeedbackOutcome;
    rating?: number;
    comment?: string;
    submittedAt: string;
}

interface MatchExplanationTrace {
    recommendationId: string;
    signals: MatchSignal[];
    appliedPolicies: string[];
    fairnessChecks: FairnessCheck[];
    operatorOverrides: OperatorOverride[];
    traceGeneratedAt: string;
}

// ---------------------------------------------------------------------------
// Labels and tone maps
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_LABELS: Readonly<Record<MatchSignalType, string>> = {
    proximity: 'Proximity',
    availability: 'Availability',
    skills: 'Skills Match',
    reputation: 'Reputation',
    history: 'Track Record',
    preference: 'Preference Alignment',
    urgency: 'Request Urgency',
    capacity: 'Available Capacity',
};

const OVERRIDE_ACTION_LABELS: Readonly<Record<OverrideAction, string>> = {
    boost: 'Boost',
    suppress: 'Suppress',
    pin: 'Pin to Top',
    exclude: 'Exclude',
};

const FEEDBACK_OUTCOME_LABELS: Readonly<Record<MatchFeedbackOutcome, string>> = {
    accepted: 'Accepted',
    declined: 'Declined',
    no_response: 'No Response',
    successful: 'Successful',
    unsuccessful: 'Unsuccessful',
};

const FEEDBACK_OUTCOME_TONES: Readonly<
    Record<MatchFeedbackOutcome, 'success' | 'danger' | 'neutral' | 'info'>
> = {
    accepted: 'info',
    declined: 'danger',
    no_response: 'neutral',
    successful: 'success',
    unsuccessful: 'danger',
};

// ---------------------------------------------------------------------------
// Signal bar view model
// ---------------------------------------------------------------------------

export interface SignalBarViewModel {
    type: MatchSignalType;
    label: string;
    score: number;
    scorePercent: number;
    weight: number;
    weightedContribution: number;
    explanation: string;
    ariaLabel: string;
}

export function toSignalBar(signal: MatchSignal): SignalBarViewModel {
    const scorePercent = Math.round(signal.score * 100);
    const label = SIGNAL_TYPE_LABELS[signal.type];
    const weightedContribution = Number(
        (signal.score * signal.weight).toFixed(4),
    );

    return {
        type: signal.type,
        label,
        score: signal.score,
        scorePercent,
        weight: signal.weight,
        weightedContribution,
        explanation: signal.explanation,
        ariaLabel: `${label}: ${scorePercent}% (weight ${Math.round(signal.weight * 100)}%)`,
    };
}

// ---------------------------------------------------------------------------
// Recommendation card view model
// ---------------------------------------------------------------------------

export interface MatchRecommendationCardViewModel {
    recommendationId: string;
    candidateDid: string;
    rank: number;
    rankLabel: string;
    overallScorePercent: number;
    confidencePercent: number;
    explanationSummary: string;
    signalBars: SignalBarViewModel[];
    scoreTone: 'success' | 'info' | 'neutral' | 'danger';
    confidenceTone: 'success' | 'info' | 'neutral' | 'danger';
    generatedAt: string;
    ariaLabel: string;
}

function toScoreTone(
    score: number,
): 'success' | 'info' | 'neutral' | 'danger' {
    if (score >= 0.75) return 'success';
    if (score >= 0.5) return 'info';
    if (score >= 0.25) return 'neutral';
    return 'danger';
}

function toConfidenceTone(
    confidence: number,
): 'success' | 'info' | 'neutral' | 'danger' {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'info';
    if (confidence >= 0.3) return 'neutral';
    return 'danger';
}

export function toRecommendationCard(
    rec: MatchRecommendation,
): MatchRecommendationCardViewModel {
    const overallScorePercent = Math.round(rec.overallScore * 100);
    const confidencePercent = Math.round(rec.confidence * 100);

    return {
        recommendationId: rec.recommendationId,
        candidateDid: rec.candidateDid,
        rank: rec.rank,
        rankLabel: `#${rec.rank}`,
        overallScorePercent,
        confidencePercent,
        explanationSummary: rec.explanationSummary,
        signalBars: rec.signals.map(toSignalBar),
        scoreTone: toScoreTone(rec.overallScore),
        confidenceTone: toConfidenceTone(rec.confidence),
        generatedAt: rec.generatedAt,
        ariaLabel: `Match #${rec.rank}: ${rec.candidateDid}, score ${overallScorePercent}%, confidence ${confidencePercent}%`,
    };
}

// ---------------------------------------------------------------------------
// Explanation view model
// ---------------------------------------------------------------------------

export interface FairnessCheckViewModel {
    checkName: string;
    passed: boolean;
    details: string;
    statusLabel: string;
    tone: 'success' | 'danger';
    ariaLabel: string;
}

export function toFairnessCheckViewModel(
    check: FairnessCheck,
): FairnessCheckViewModel {
    return {
        checkName: check.checkName,
        passed: check.passed,
        details: check.details,
        statusLabel: check.passed ? 'Passed' : 'Warning',
        tone: check.passed ? 'success' : 'danger',
        ariaLabel: `Fairness check "${check.checkName}": ${check.passed ? 'Passed' : 'Warning'} - ${check.details}`,
    };
}

export interface MatchExplanationViewModel {
    recommendationId: string;
    signalBars: SignalBarViewModel[];
    appliedPolicies: string[];
    fairnessChecks: FairnessCheckViewModel[];
    overrideCount: number;
    traceGeneratedAt: string;
    ariaLabel: string;
}

export function toExplanationViewModel(
    trace: MatchExplanationTrace,
): MatchExplanationViewModel {
    return {
        recommendationId: trace.recommendationId,
        signalBars: trace.signals.map(toSignalBar),
        appliedPolicies: trace.appliedPolicies,
        fairnessChecks: trace.fairnessChecks.map(toFairnessCheckViewModel),
        overrideCount: trace.operatorOverrides.length,
        traceGeneratedAt: trace.traceGeneratedAt,
        ariaLabel: `Explanation trace for recommendation ${trace.recommendationId}: ${trace.signals.length} signals, ${trace.fairnessChecks.length} fairness checks`,
    };
}

// ---------------------------------------------------------------------------
// Operator override view model
// ---------------------------------------------------------------------------

export interface OverrideActionOption {
    action: OverrideAction;
    label: string;
    ariaLabel: string;
}

export const OVERRIDE_ACTION_OPTIONS: readonly OverrideActionOption[] = [
    { action: 'boost', label: 'Boost', ariaLabel: 'Boost this recommendation higher in the list' },
    { action: 'suppress', label: 'Suppress', ariaLabel: 'Suppress this recommendation lower in the list' },
    { action: 'pin', label: 'Pin to Top', ariaLabel: 'Pin this recommendation to the top of the list' },
    { action: 'exclude', label: 'Exclude', ariaLabel: 'Exclude this recommendation from the list' },
];

export interface OperatorOverrideViewModel {
    overrideId: string;
    recommendationId: string;
    operatorDid: string;
    actionLabel: string;
    reason: string;
    appliedAt: string;
    tone: 'info' | 'danger' | 'success' | 'neutral';
    ariaLabel: string;
}

function toOverrideTone(
    action: OverrideAction,
): 'info' | 'danger' | 'success' | 'neutral' {
    switch (action) {
        case 'boost':
            return 'info';
        case 'pin':
            return 'success';
        case 'suppress':
            return 'neutral';
        case 'exclude':
            return 'danger';
    }
}

export function toOverrideViewModel(
    override: OperatorOverride,
): OperatorOverrideViewModel {
    const actionLabel = OVERRIDE_ACTION_LABELS[override.action];
    return {
        overrideId: override.overrideId,
        recommendationId: override.recommendationId,
        operatorDid: override.operatorDid,
        actionLabel,
        reason: override.reason,
        appliedAt: override.appliedAt,
        tone: toOverrideTone(override.action),
        ariaLabel: `Override: ${actionLabel} by ${override.operatorDid} - ${override.reason}`,
    };
}

// ---------------------------------------------------------------------------
// Feedback view model
// ---------------------------------------------------------------------------

export interface FeedbackOutcomeOption {
    outcome: MatchFeedbackOutcome;
    label: string;
}

export const FEEDBACK_OUTCOME_OPTIONS: readonly FeedbackOutcomeOption[] = [
    { outcome: 'accepted', label: 'Accepted' },
    { outcome: 'declined', label: 'Declined' },
    { outcome: 'no_response', label: 'No Response' },
    { outcome: 'successful', label: 'Successful' },
    { outcome: 'unsuccessful', label: 'Unsuccessful' },
];

export interface MatchFeedbackViewModel {
    feedbackId: string;
    recommendationId: string;
    fromDid: string;
    outcomeLabel: string;
    outcomeTone: 'success' | 'danger' | 'neutral' | 'info';
    rating: number | null;
    ratingDisplay: string;
    comment: string | null;
    submittedAt: string;
    ariaLabel: string;
}

export function toFeedbackViewModel(
    feedback: MatchFeedback,
): MatchFeedbackViewModel {
    const outcomeLabel = FEEDBACK_OUTCOME_LABELS[feedback.outcome];
    const outcomeTone = FEEDBACK_OUTCOME_TONES[feedback.outcome];
    const ratingDisplay =
        feedback.rating !== undefined ? `${feedback.rating}/5` : 'No rating';

    return {
        feedbackId: feedback.feedbackId,
        recommendationId: feedback.recommendationId,
        fromDid: feedback.fromDid,
        outcomeLabel,
        outcomeTone,
        rating: feedback.rating ?? null,
        ratingDisplay,
        comment: feedback.comment ?? null,
        submittedAt: feedback.submittedAt,
        ariaLabel: `Feedback from ${feedback.fromDid}: ${outcomeLabel}${feedback.rating !== undefined ? `, rated ${feedback.rating}/5` : ''}`,
    };
}

// ---------------------------------------------------------------------------
// Matching dashboard view model
// ---------------------------------------------------------------------------

export interface MatchingDashboardViewModel {
    recommendations: MatchRecommendationCardViewModel[];
    totalRecommendations: number;
    averageScore: number;
    averageConfidence: number;
    overrideCount: number;
    feedbackCount: number;
    fairnessCheckSummary: {
        total: number;
        passed: number;
        warnings: number;
    };
    ariaLabel: string;
}

export function buildMatchingDashboard(input: {
    recommendations: MatchRecommendation[];
    overrides: OperatorOverride[];
    feedback: MatchFeedback[];
    fairnessChecks: FairnessCheck[];
}): MatchingDashboardViewModel {
    const cards = input.recommendations.map(toRecommendationCard);
    const totalRecommendations = cards.length;

    const avgScore =
        totalRecommendations > 0
            ? Math.round(
                  (input.recommendations.reduce(
                      (sum, r) => sum + r.overallScore,
                      0,
                  ) /
                      totalRecommendations) *
                      100,
              )
            : 0;

    const avgConfidence =
        totalRecommendations > 0
            ? Math.round(
                  (input.recommendations.reduce(
                      (sum, r) => sum + r.confidence,
                      0,
                  ) /
                      totalRecommendations) *
                      100,
              )
            : 0;

    const passed = input.fairnessChecks.filter(c => c.passed).length;
    const warnings = input.fairnessChecks.filter(c => !c.passed).length;

    return {
        recommendations: cards,
        totalRecommendations,
        averageScore: avgScore,
        averageConfidence: avgConfidence,
        overrideCount: input.overrides.length,
        feedbackCount: input.feedback.length,
        fairnessCheckSummary: {
            total: input.fairnessChecks.length,
            passed,
            warnings,
        },
        ariaLabel: `Matching dashboard: ${totalRecommendations} recommendations, average score ${avgScore}%, ${input.overrides.length} overrides, ${input.feedback.length} feedback items`,
    };
}
