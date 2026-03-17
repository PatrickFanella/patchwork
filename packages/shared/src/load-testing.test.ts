import { describe, expect, it } from 'vitest';
import {
    computeLatencyHistogram,
    evaluateBudget,
    getBudgetForEndpoint,
    getProfileForEndpoint,
    DEFAULT_LOAD_PROFILES,
    DEFAULT_PERFORMANCE_BUDGETS,
    LOAD_TEST_ENDPOINTS,
    type LatencyHistogram,
    type PerformanceBudget,
} from './load-testing.js';

// ---------------------------------------------------------------------------
// computeLatencyHistogram
// ---------------------------------------------------------------------------

describe('computeLatencyHistogram', () => {
    it('returns zeroed histogram for empty samples', () => {
        const h = computeLatencyHistogram([]);
        expect(h.sampleCount).toBe(0);
        expect(h.min).toBe(0);
        expect(h.max).toBe(0);
        expect(h.mean).toBe(0);
        expect(h.p50).toBe(0);
        expect(h.p95).toBe(0);
        expect(h.p99).toBe(0);
    });

    it('computes correct percentiles for a single sample', () => {
        const h = computeLatencyHistogram([42]);
        expect(h.min).toBe(42);
        expect(h.max).toBe(42);
        expect(h.mean).toBe(42);
        expect(h.p50).toBe(42);
        expect(h.p95).toBe(42);
        expect(h.p99).toBe(42);
        expect(h.sampleCount).toBe(1);
    });

    it('computes correct percentiles for 100 sequential samples', () => {
        const samples = Array.from({ length: 100 }, (_, i) => i + 1);
        const h = computeLatencyHistogram(samples);

        expect(h.min).toBe(1);
        expect(h.max).toBe(100);
        expect(h.p50).toBe(50);
        expect(h.p95).toBe(95);
        expect(h.p99).toBe(99);
        expect(h.sampleCount).toBe(100);
    });

    it('handles unsorted input correctly', () => {
        const samples = [100, 1, 50, 75, 25];
        const h = computeLatencyHistogram(samples);

        expect(h.min).toBe(1);
        expect(h.max).toBe(100);
        expect(h.sampleCount).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// evaluateBudget
// ---------------------------------------------------------------------------

describe('evaluateBudget', () => {
    const baseBudget: PerformanceBudget = {
        endpoint: 'feed',
        latency: { p50Ms: 100, p95Ms: 300, p99Ms: 800 },
        maxErrorRate: 0.005,
        minThroughputRps: 80,
    };

    const passingResult = {
        latency: { min: 10, max: 200, mean: 60, p50: 50, p95: 150, p99: 400, sampleCount: 1000 } as LatencyHistogram,
        errorCount: 2,
        totalRequests: 1000,
        actualRps: 100,
    };

    it('passes when all metrics within budget', () => {
        const { withinBudget, violations } = evaluateBudget(passingResult, baseBudget);
        expect(withinBudget).toBe(true);
        expect(violations).toHaveLength(0);
    });

    it('fails when p95 exceeds budget', () => {
        const result = { ...passingResult, latency: { ...passingResult.latency, p95: 500 } };
        const { withinBudget, violations } = evaluateBudget(result, baseBudget);
        expect(withinBudget).toBe(false);
        expect(violations.some(v => v.includes('p95'))).toBe(true);
    });

    it('fails when p99 exceeds budget', () => {
        const result = { ...passingResult, latency: { ...passingResult.latency, p99: 1000 } };
        const { withinBudget, violations } = evaluateBudget(result, baseBudget);
        expect(withinBudget).toBe(false);
        expect(violations.some(v => v.includes('p99'))).toBe(true);
    });

    it('fails when error rate exceeds budget', () => {
        const result = { ...passingResult, errorCount: 50 };
        const { withinBudget, violations } = evaluateBudget(result, baseBudget);
        expect(withinBudget).toBe(false);
        expect(violations.some(v => v.includes('error rate'))).toBe(true);
    });

    it('fails when throughput is below minimum', () => {
        const result = { ...passingResult, actualRps: 30 };
        const { withinBudget, violations } = evaluateBudget(result, baseBudget);
        expect(withinBudget).toBe(false);
        expect(violations.some(v => v.includes('throughput'))).toBe(true);
    });

    it('accumulates multiple violations', () => {
        const result = {
            latency: { min: 10, max: 2000, mean: 500, p50: 200, p95: 500, p99: 1500, sampleCount: 100 } as LatencyHistogram,
            errorCount: 50,
            totalRequests: 100,
            actualRps: 10,
        };
        const { withinBudget, violations } = evaluateBudget(result, baseBudget);
        expect(withinBudget).toBe(false);
        expect(violations.length).toBeGreaterThanOrEqual(3);
    });

    it('handles zero total requests without dividing by zero', () => {
        const result = { ...passingResult, totalRequests: 0, errorCount: 0, actualRps: 0 };
        const { withinBudget } = evaluateBudget(result, baseBudget);
        // Error rate is 0 when totalRequests is 0, but throughput is 0 which violates the minimum
        expect(withinBudget).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Default profiles & budgets
// ---------------------------------------------------------------------------

describe('DEFAULT_LOAD_PROFILES', () => {
    it('defines a profile for every load test endpoint', () => {
        for (const ep of LOAD_TEST_ENDPOINTS) {
            const profile = getProfileForEndpoint(ep);
            expect(profile).toBeDefined();
            expect(profile!.endpoint).toBe(ep);
        }
    });

    it('every profile has at least 2 tiers', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            expect(profile.tiers.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('tiers are ordered from lowest to highest concurrentUsers', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            for (let i = 1; i < profile.tiers.length; i++) {
                expect(profile.tiers[i]!.concurrentUsers).toBeGreaterThanOrEqual(
                    profile.tiers[i - 1]!.concurrentUsers,
                );
            }
        }
    });

    it('every tier has positive duration', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            for (const tier of profile.tiers) {
                expect(tier.durationSeconds).toBeGreaterThan(0);
            }
        }
    });
});

describe('DEFAULT_PERFORMANCE_BUDGETS', () => {
    it('defines a budget for every load test endpoint', () => {
        for (const ep of LOAD_TEST_ENDPOINTS) {
            const budget = getBudgetForEndpoint(ep);
            expect(budget).toBeDefined();
            expect(budget!.endpoint).toBe(ep);
        }
    });

    it('p50 <= p95 <= p99 for all budgets', () => {
        for (const budget of DEFAULT_PERFORMANCE_BUDGETS) {
            expect(budget.latency.p50Ms).toBeLessThanOrEqual(budget.latency.p95Ms);
            expect(budget.latency.p95Ms).toBeLessThanOrEqual(budget.latency.p99Ms);
        }
    });

    it('error rate budgets are between 0 and 1', () => {
        for (const budget of DEFAULT_PERFORMANCE_BUDGETS) {
            expect(budget.maxErrorRate).toBeGreaterThanOrEqual(0);
            expect(budget.maxErrorRate).toBeLessThanOrEqual(1);
        }
    });

    it('minimum throughput is positive for all endpoints', () => {
        for (const budget of DEFAULT_PERFORMANCE_BUDGETS) {
            expect(budget.minThroughputRps).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('getBudgetForEndpoint', () => {
    it('returns undefined for an unknown endpoint', () => {
        const result = getBudgetForEndpoint('nonexistent' as never);
        expect(result).toBeUndefined();
    });
});

describe('getProfileForEndpoint', () => {
    it('returns undefined for an unknown endpoint', () => {
        const result = getProfileForEndpoint('nonexistent' as never);
        expect(result).toBeUndefined();
    });
});
