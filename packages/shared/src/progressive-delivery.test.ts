import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CANARY_STEPS,
    buildCanaryStrategy,
    DEFAULT_BURN_RATE_THRESHOLDS,
    evaluateBurnRate,
    STANDARD_CHECKPOINT_NAMES,
    createStepCheckpoints,
    ROLLOUT_TRANSITIONS,
    isValidTransition,
    advanceRollout,
    PROGRESSIVE_DELIVERY_RUNBOOK,
    type RolloutState,
    type RolloutStrategy,
} from './progressive-delivery.js';

describe('DEFAULT_CANARY_STEPS', () => {
    it('has four steps', () => {
        expect(DEFAULT_CANARY_STEPS).toHaveLength(4);
    });

    it('starts at 5% and ends at 100%', () => {
        expect(DEFAULT_CANARY_STEPS[0]!.weightPercent).toBe(5);
        expect(DEFAULT_CANARY_STEPS[DEFAULT_CANARY_STEPS.length - 1]!.weightPercent).toBe(100);
    });

    it('weights are monotonically increasing', () => {
        for (let i = 1; i < DEFAULT_CANARY_STEPS.length; i++) {
            expect(DEFAULT_CANARY_STEPS[i]!.weightPercent).toBeGreaterThan(
                DEFAULT_CANARY_STEPS[i - 1]!.weightPercent,
            );
        }
    });

    it('early steps require smoke checks', () => {
        expect(DEFAULT_CANARY_STEPS[0]!.smokeCheckRequired).toBe(true);
        expect(DEFAULT_CANARY_STEPS[1]!.smokeCheckRequired).toBe(true);
        expect(DEFAULT_CANARY_STEPS[2]!.smokeCheckRequired).toBe(true);
    });

    it('each step has a label and bake time', () => {
        for (const step of DEFAULT_CANARY_STEPS) {
            expect(step.label).toBeTruthy();
            expect(step.bakeTimeSeconds).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('buildCanaryStrategy', () => {
    it('builds a canary strategy with default steps', () => {
        const strategy = buildCanaryStrategy('api');
        expect(strategy.type).toBe('canary');
        expect(strategy.service).toBe('api');
        expect(strategy.steps).toEqual(DEFAULT_CANARY_STEPS);
    });

    it('accepts custom steps', () => {
        const customSteps = [
            {
                label: 'test-10%',
                weightPercent: 10,
                bakeTimeSeconds: 60,
                smokeCheckRequired: true,
            },
            {
                label: 'full',
                weightPercent: 100,
                bakeTimeSeconds: 0,
                smokeCheckRequired: false,
            },
        ];
        const strategy = buildCanaryStrategy('indexer', customSteps);
        expect(strategy.steps).toEqual(customSteps);
    });
});

describe('DEFAULT_BURN_RATE_THRESHOLDS', () => {
    it('includes error_rate, latency_p95, and saturation', () => {
        const metrics = DEFAULT_BURN_RATE_THRESHOLDS.map(t => t.metric).sort();
        expect(metrics).toEqual(['error_rate', 'latency_p95', 'saturation']);
    });

    it('all thresholds have positive burn rates', () => {
        for (const threshold of DEFAULT_BURN_RATE_THRESHOLDS) {
            expect(threshold.maxBurnRate).toBeGreaterThan(0);
        }
    });

    it('all thresholds have positive evaluation windows', () => {
        for (const threshold of DEFAULT_BURN_RATE_THRESHOLDS) {
            expect(threshold.windowSeconds).toBeGreaterThan(0);
        }
    });
});

describe('evaluateBurnRate', () => {
    const threshold = {
        metric: 'error_rate',
        maxBurnRate: 2.0,
        windowSeconds: 300,
        severity: 'critical' as const,
    };

    it('returns null when burn rate is within threshold', () => {
        expect(evaluateBurnRate(threshold, 1.5)).toBeNull();
    });

    it('returns null when burn rate equals threshold', () => {
        expect(evaluateBurnRate(threshold, 2.0)).toBeNull();
    });

    it('returns a trigger when burn rate exceeds threshold', () => {
        const trigger = evaluateBurnRate(threshold, 3.0);
        expect(trigger).not.toBeNull();
        expect(trigger!.reason).toBe('burn-rate-exceeded');
        expect(trigger!.source).toBe('error_rate');
        expect(trigger!.observedValue).toBe(3.0);
        expect(trigger!.thresholdValue).toBe(2.0);
        expect(trigger!.triggeredAt).toBeTruthy();
    });
});

describe('STANDARD_CHECKPOINT_NAMES', () => {
    it('includes all expected checkpoints', () => {
        expect(STANDARD_CHECKPOINT_NAMES).toContain('health-probe');
        expect(STANDARD_CHECKPOINT_NAMES).toContain('smoke-test');
        expect(STANDARD_CHECKPOINT_NAMES).toContain('error-rate-check');
        expect(STANDARD_CHECKPOINT_NAMES).toContain('latency-check');
        expect(STANDARD_CHECKPOINT_NAMES).toContain('saturation-check');
    });
});

describe('createStepCheckpoints', () => {
    it('creates pending checkpoints for each standard name', () => {
        const checkpoints = createStepCheckpoints('canary-5%');
        expect(checkpoints).toHaveLength(STANDARD_CHECKPOINT_NAMES.length);
        for (const cp of checkpoints) {
            expect(cp.status).toBe('pending');
            expect(cp.stepLabel).toBe('canary-5%');
        }
    });

    it('includes all standard checkpoint names', () => {
        const checkpoints = createStepCheckpoints('test');
        const names = checkpoints.map(c => c.name).sort();
        expect(names).toEqual([...STANDARD_CHECKPOINT_NAMES].sort());
    });
});

describe('ROLLOUT_TRANSITIONS', () => {
    it('not-started can only go to in-progress', () => {
        expect(ROLLOUT_TRANSITIONS['not-started']).toEqual(['in-progress']);
    });

    it('completed has no valid transitions', () => {
        expect(ROLLOUT_TRANSITIONS['completed']).toEqual([]);
    });

    it('rolled-back has no valid transitions', () => {
        expect(ROLLOUT_TRANSITIONS['rolled-back']).toEqual([]);
    });

    it('in-progress can transition to baking, rolled-back, or aborted', () => {
        expect(ROLLOUT_TRANSITIONS['in-progress']).toContain('baking');
        expect(ROLLOUT_TRANSITIONS['in-progress']).toContain('rolled-back');
        expect(ROLLOUT_TRANSITIONS['in-progress']).toContain('aborted');
    });
});

describe('isValidTransition', () => {
    it('allows not-started to in-progress', () => {
        expect(isValidTransition('not-started', 'in-progress')).toBe(true);
    });

    it('rejects not-started to completed', () => {
        expect(isValidTransition('not-started', 'completed')).toBe(false);
    });

    it('allows baking to completed', () => {
        expect(isValidTransition('baking', 'completed')).toBe(true);
    });

    it('rejects completed to in-progress', () => {
        expect(isValidTransition('completed', 'in-progress')).toBe(false);
    });
});

describe('advanceRollout', () => {
    const strategy: RolloutStrategy = buildCanaryStrategy('api');

    const makeState = (stepIndex: number): RolloutState => ({
        phase: 'baking',
        currentStepIndex: stepIndex,
        service: 'api',
        strategy,
        startedAt: new Date().toISOString(),
    });

    it('advances to the next step', () => {
        const state = makeState(0);
        const next = advanceRollout(state);
        expect(next).not.toBeNull();
        expect(next!.currentStepIndex).toBe(1);
        expect(next!.phase).toBe('in-progress');
    });

    it('completes when at the last step', () => {
        const state = makeState(strategy.steps.length - 1);
        const next = advanceRollout(state);
        expect(next).not.toBeNull();
        expect(next!.phase).toBe('completed');
        expect(next!.endedAt).toBeTruthy();
    });
});

describe('PROGRESSIVE_DELIVERY_RUNBOOK', () => {
    it('has at least 5 entries', () => {
        expect(PROGRESSIVE_DELIVERY_RUNBOOK.length).toBeGreaterThanOrEqual(5);
    });

    it('includes abort-rollout and manual-rollback', () => {
        const actions = PROGRESSIVE_DELIVERY_RUNBOOK.map(e => e.action);
        expect(actions).toContain('abort-rollout');
        expect(actions).toContain('manual-rollback');
    });

    it('every entry has a description and procedure', () => {
        for (const entry of PROGRESSIVE_DELIVERY_RUNBOOK) {
            expect(entry.description).toBeTruthy();
            expect(entry.procedure).toBeTruthy();
        }
    });

    it('force-complete requires elevation', () => {
        const forceComplete = PROGRESSIVE_DELIVERY_RUNBOOK.find(
            e => e.action === 'force-complete',
        );
        expect(forceComplete?.requiresElevation).toBe(true);
    });

    it('pause-rollout does not require elevation', () => {
        const pause = PROGRESSIVE_DELIVERY_RUNBOOK.find(
            e => e.action === 'pause-rollout',
        );
        expect(pause?.requiresElevation).toBe(false);
    });
});
