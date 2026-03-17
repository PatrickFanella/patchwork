/**
 * Progressive delivery (canary / weighted rollout) contracts (#110).
 *
 * Defines rollout strategy types, SLO-burn rollback triggers, deployment
 * observability checkpoints, and runbook types for manual override/abort.
 */

import type { PatchworkService } from './sli.js';
import type { AlertSeverity } from './alerting.js';

// ---------------------------------------------------------------------------
// Rollout strategy
// ---------------------------------------------------------------------------

export type RolloutStrategyType = 'canary' | 'weighted' | 'blue-green';

export interface RolloutStep {
    /** Human-readable label for this step (e.g. "canary-10%"). */
    label: string;
    /** Percentage of traffic routed to the new version (0-100). */
    weightPercent: number;
    /** How long to bake at this step before advancing (seconds). */
    bakeTimeSeconds: number;
    /** Whether to run smoke checks at this checkpoint. */
    smokeCheckRequired: boolean;
}

export interface RolloutStrategy {
    /** Strategy type. */
    type: RolloutStrategyType;
    /** Ordered list of rollout steps. */
    steps: readonly RolloutStep[];
    /** Service this strategy applies to. */
    service: PatchworkService;
}

/**
 * Default canary rollout steps: 5% -> 25% -> 50% -> 100%.
 * Each step includes a bake time and smoke check gate.
 */
export const DEFAULT_CANARY_STEPS: readonly RolloutStep[] = [
    {
        label: 'canary-5%',
        weightPercent: 5,
        bakeTimeSeconds: 300, // 5 minutes
        smokeCheckRequired: true,
    },
    {
        label: 'canary-25%',
        weightPercent: 25,
        bakeTimeSeconds: 300,
        smokeCheckRequired: true,
    },
    {
        label: 'canary-50%',
        weightPercent: 50,
        bakeTimeSeconds: 600, // 10 minutes
        smokeCheckRequired: true,
    },
    {
        label: 'full-rollout',
        weightPercent: 100,
        bakeTimeSeconds: 0,
        smokeCheckRequired: false,
    },
] as const;

/**
 * Build a canary rollout strategy for a given service.
 */
export const buildCanaryStrategy = (
    service: PatchworkService,
    steps?: readonly RolloutStep[],
): RolloutStrategy => ({
    type: 'canary',
    service,
    steps: steps ?? DEFAULT_CANARY_STEPS,
});

// ---------------------------------------------------------------------------
// SLO burn-rate rollback triggers
// ---------------------------------------------------------------------------

export interface BurnRateThreshold {
    /** SLO metric name (matches SLI metric names or alert rule names). */
    metric: string;
    /** Maximum burn rate before triggering rollback (e.g. 2.0 = 2x budget). */
    maxBurnRate: number;
    /** Evaluation window in seconds. */
    windowSeconds: number;
    /** Alert severity when threshold is breached. */
    severity: AlertSeverity;
}

/** Default burn-rate thresholds that trigger automatic rollback. */
export const DEFAULT_BURN_RATE_THRESHOLDS: readonly BurnRateThreshold[] = [
    {
        metric: 'error_rate',
        maxBurnRate: 2.0,
        windowSeconds: 300,
        severity: 'critical',
    },
    {
        metric: 'latency_p95',
        maxBurnRate: 1.5,
        windowSeconds: 300,
        severity: 'warning',
    },
    {
        metric: 'saturation',
        maxBurnRate: 1.5,
        windowSeconds: 600,
        severity: 'warning',
    },
] as const;

export type DeliveryRollbackReason =
    | 'burn-rate-exceeded'
    | 'health-check-failed'
    | 'smoke-check-failed'
    | 'manual-abort'
    | 'bake-timeout-exceeded';

export interface DeliveryRollbackTrigger {
    /** Why the rollback was triggered. */
    reason: DeliveryRollbackReason;
    /** Which metric or check caused the trigger. */
    source: string;
    /** The observed value that crossed the threshold. */
    observedValue?: number;
    /** The threshold that was crossed. */
    thresholdValue?: number;
    /** ISO-8601 timestamp of the trigger. */
    triggeredAt: string;
}

/**
 * Evaluate whether a burn-rate threshold has been breached.
 */
export const evaluateBurnRate = (
    threshold: BurnRateThreshold,
    currentRate: number,
): DeliveryRollbackTrigger | null => {
    if (currentRate > threshold.maxBurnRate) {
        return {
            reason: 'burn-rate-exceeded',
            source: threshold.metric,
            observedValue: currentRate,
            thresholdValue: threshold.maxBurnRate,
            triggeredAt: new Date().toISOString(),
        };
    }
    return null;
};

// ---------------------------------------------------------------------------
// Deployment observability checkpoints
// ---------------------------------------------------------------------------

export type CheckpointStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

export interface DeploymentCheckpoint {
    /** Human-readable name of the checkpoint. */
    name: string;
    /** Which rollout step this checkpoint belongs to. */
    stepLabel: string;
    /** Current status. */
    status: CheckpointStatus;
    /** ISO-8601 timestamp when the checkpoint was evaluated. */
    evaluatedAt?: string;
    /** Duration of the check in milliseconds. */
    durationMs?: number;
    /** Detail message. */
    message?: string;
}

export interface DeploymentObservabilityReport {
    /** Service being deployed. */
    service: PatchworkService;
    /** Image tag being rolled out. */
    imageTag: string;
    /** Current rollout step. */
    currentStep: string;
    /** Overall rollout progress (0-100). */
    progressPercent: number;
    /** All checkpoint results so far. */
    checkpoints: readonly DeploymentCheckpoint[];
    /** Any rollback triggers that fired. */
    rollbackTriggers: readonly DeliveryRollbackTrigger[];
    /** ISO-8601 timestamp of the report. */
    reportedAt: string;
}

/**
 * Standard checkpoint names for each rollout step.
 */
export const STANDARD_CHECKPOINT_NAMES = [
    'health-probe',
    'smoke-test',
    'error-rate-check',
    'latency-check',
    'saturation-check',
] as const;

export type StandardCheckpointName = (typeof STANDARD_CHECKPOINT_NAMES)[number];

/**
 * Create initial pending checkpoints for a rollout step.
 */
export const createStepCheckpoints = (
    stepLabel: string,
): DeploymentCheckpoint[] =>
    STANDARD_CHECKPOINT_NAMES.map(name => ({
        name,
        stepLabel,
        status: 'pending' as const,
    }));

// ---------------------------------------------------------------------------
// Rollout state machine
// ---------------------------------------------------------------------------

export type RolloutPhase =
    | 'not-started'
    | 'in-progress'
    | 'baking'
    | 'paused'
    | 'completed'
    | 'rolled-back'
    | 'aborted';

export interface RolloutState {
    /** Current phase. */
    phase: RolloutPhase;
    /** Index of the current step in the strategy. */
    currentStepIndex: number;
    /** Service being rolled out. */
    service: PatchworkService;
    /** Strategy being used. */
    strategy: RolloutStrategy;
    /** ISO-8601 start time. */
    startedAt: string;
    /** ISO-8601 end time (set when completed/rolled-back/aborted). */
    endedAt?: string;
}

/** Valid phase transitions for the rollout state machine. */
export const ROLLOUT_TRANSITIONS: Record<RolloutPhase, readonly RolloutPhase[]> = {
    'not-started': ['in-progress'],
    'in-progress': ['baking', 'rolled-back', 'aborted'],
    'baking': ['in-progress', 'completed', 'rolled-back', 'aborted'],
    'paused': ['in-progress', 'rolled-back', 'aborted'],
    'completed': [],
    'rolled-back': [],
    'aborted': [],
} as const;

/**
 * Check whether a phase transition is valid.
 */
export const isValidTransition = (
    from: RolloutPhase,
    to: RolloutPhase,
): boolean => ROLLOUT_TRANSITIONS[from].includes(to);

/**
 * Advance the rollout state to the next step.
 * Returns null if the rollout is already at the final step.
 */
export const advanceRollout = (state: RolloutState): RolloutState | null => {
    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex >= state.strategy.steps.length) {
        return { ...state, phase: 'completed', endedAt: new Date().toISOString() };
    }
    return { ...state, currentStepIndex: nextIndex, phase: 'in-progress' };
};

// ---------------------------------------------------------------------------
// Runbook types for manual override / abort
// ---------------------------------------------------------------------------

export type RunbookAction =
    | 'pause-rollout'
    | 'resume-rollout'
    | 'skip-step'
    | 'abort-rollout'
    | 'force-complete'
    | 'manual-rollback';

export interface RunbookEntry {
    /** Action name. */
    action: RunbookAction;
    /** Human-readable description. */
    description: string;
    /** Command or procedure to execute. */
    procedure: string;
    /** Whether this action requires elevated privileges. */
    requiresElevation: boolean;
}

/** Standard runbook entries for progressive delivery. */
export const PROGRESSIVE_DELIVERY_RUNBOOK: readonly RunbookEntry[] = [
    {
        action: 'pause-rollout',
        description: 'Pause the current rollout at the current step.',
        procedure: 'make deploy-rollout-pause SERVICE=<service>',
        requiresElevation: false,
    },
    {
        action: 'resume-rollout',
        description: 'Resume a paused rollout from the current step.',
        procedure: 'make deploy-rollout-resume SERVICE=<service>',
        requiresElevation: false,
    },
    {
        action: 'skip-step',
        description: 'Skip the current bake step and advance to the next weight.',
        procedure: 'make deploy-rollout-skip SERVICE=<service>',
        requiresElevation: true,
    },
    {
        action: 'abort-rollout',
        description: 'Abort the rollout and route all traffic to the previous version.',
        procedure: 'make deploy-rollout-abort SERVICE=<service>',
        requiresElevation: false,
    },
    {
        action: 'force-complete',
        description: 'Force the rollout to 100% immediately (emergency only).',
        procedure: 'make deploy-rollout-force SERVICE=<service>',
        requiresElevation: true,
    },
    {
        action: 'manual-rollback',
        description: 'Manually roll back to a specific previous version tag.',
        procedure: 'make rollback SERVICE=<service> TAG=<tag>',
        requiresElevation: true,
    },
] as const;
