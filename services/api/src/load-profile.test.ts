/**
 * Load profile validation tests.
 *
 * Validates that the defined load profiles and performance budgets are
 * self-consistent and that simulated load test results can be correctly
 * evaluated against the capacity envelope.
 */

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LOAD_PROFILES,
    DEFAULT_PERFORMANCE_BUDGETS,
    LOAD_TEST_ENDPOINTS,
    computeLatencyHistogram,
    evaluateBudget,
    getBudgetForEndpoint,
    getProfileForEndpoint,
    type LoadTestResult,
    type LoadTestEndpoint,
} from '../../../packages/shared/src/load-testing.js';
import {
    buildCapacityEnvelope,
    type ResourceSnapshot,
} from './capacity-service.js';

// ---------------------------------------------------------------------------
// Profile structural validation
// ---------------------------------------------------------------------------

describe('load profile structural validation', () => {
    it('every endpoint has both a load profile and a performance budget', () => {
        for (const ep of LOAD_TEST_ENDPOINTS) {
            expect(getProfileForEndpoint(ep)).toBeDefined();
            expect(getBudgetForEndpoint(ep)).toBeDefined();
        }
    });

    it('stress tier always has higher concurrency than baseline', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            const baseline = profile.tiers.find(t => t.name === 'baseline');
            const stress = profile.tiers.find(t => t.name === 'stress');
            if (baseline && stress) {
                expect(stress.concurrentUsers).toBeGreaterThan(baseline.concurrentUsers);
                expect(stress.requestsPerSecond).toBeGreaterThan(baseline.requestsPerSecond);
            }
        }
    });

    it('peak tier sits between baseline and stress', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            const baseline = profile.tiers.find(t => t.name === 'baseline');
            const peak = profile.tiers.find(t => t.name === 'peak');
            const stress = profile.tiers.find(t => t.name === 'stress');
            if (baseline && peak && stress) {
                expect(peak.concurrentUsers).toBeGreaterThanOrEqual(baseline.concurrentUsers);
                expect(peak.concurrentUsers).toBeLessThanOrEqual(stress.concurrentUsers);
            }
        }
    });

    it('all paths start with a forward slash', () => {
        for (const profile of DEFAULT_LOAD_PROFILES) {
            expect(profile.path).toMatch(/^\//);
        }
    });
});

// ---------------------------------------------------------------------------
// Budget consistency
// ---------------------------------------------------------------------------

describe('performance budget consistency', () => {
    it('health endpoint has the tightest latency budget', () => {
        const healthBudget = getBudgetForEndpoint('health')!;
        for (const budget of DEFAULT_PERFORMANCE_BUDGETS) {
            if (budget.endpoint === 'health') continue;
            expect(healthBudget.latency.p95Ms).toBeLessThanOrEqual(budget.latency.p95Ms);
        }
    });

    it('moderation endpoint tolerates higher error rate than chat', () => {
        const modBudget = getBudgetForEndpoint('moderation')!;
        const chatBudget = getBudgetForEndpoint('chat')!;
        expect(modBudget.maxErrorRate).toBeGreaterThanOrEqual(chatBudget.maxErrorRate);
    });

    it('feed has highest minimum throughput requirement', () => {
        const feedBudget = getBudgetForEndpoint('feed')!;
        for (const budget of DEFAULT_PERFORMANCE_BUDGETS) {
            if (budget.endpoint === 'feed') continue;
            // Feed should be among the highest throughput requirements
            expect(feedBudget.minThroughputRps).toBeGreaterThanOrEqual(budget.minThroughputRps);
        }
    });
});

// ---------------------------------------------------------------------------
// Simulated load test result evaluation
// ---------------------------------------------------------------------------

describe('simulated load test evaluation', () => {
    const simulatePassingResult = (endpoint: LoadTestEndpoint): LoadTestResult => {
        const budget = getBudgetForEndpoint(endpoint)!;
        const samples = Array.from({ length: 200 }, () =>
            Math.random() * budget.latency.p50Ms * 0.8,
        );
        const histogram = computeLatencyHistogram(samples);
        return {
            endpoint,
            tier: 'baseline',
            latency: histogram,
            totalRequests: 200,
            successCount: 200,
            errorCount: 0,
            actualRps: budget.minThroughputRps * 1.5,
            durationSeconds: 60,
            withinBudget: true,
        };
    };

    it('simulated passing results satisfy all budgets', () => {
        for (const ep of LOAD_TEST_ENDPOINTS) {
            const result = simulatePassingResult(ep);
            const budget = getBudgetForEndpoint(ep)!;
            const { withinBudget } = evaluateBudget(result, budget);
            expect(withinBudget).toBe(true);
        }
    });

    it('simulated high-latency result fails budget', () => {
        const budget = getBudgetForEndpoint('feed')!;
        // Generate samples that will produce p95 above budget
        const samples = Array.from({ length: 100 }, (_, i) =>
            i < 90 ? 50 : budget.latency.p95Ms + 100,
        );
        const histogram = computeLatencyHistogram(samples);
        const { withinBudget, violations } = evaluateBudget(
            {
                latency: histogram,
                errorCount: 0,
                totalRequests: 100,
                actualRps: budget.minThroughputRps,
            },
            budget,
        );
        expect(withinBudget).toBe(false);
        expect(violations.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Capacity envelope integration
// ---------------------------------------------------------------------------

describe('capacity envelope integration', () => {
    it('builds envelope with passing results and healthy snapshots', () => {
        const makePassingResult = (ep: LoadTestEndpoint): LoadTestResult => ({
            endpoint: ep,
            tier: 'peak',
            latency: computeLatencyHistogram(Array.from({ length: 100 }, () => Math.random() * 50)),
            totalRequests: 500,
            successCount: 500,
            errorCount: 0,
            actualRps: 100,
            durationSeconds: 120,
            withinBudget: true,
        });

        const resultsByEndpoint: Record<LoadTestEndpoint, LoadTestResult[]> = {
            feed: [makePassingResult('feed')],
            map: [makePassingResult('map')],
            chat: [makePassingResult('chat')],
            moderation: [makePassingResult('moderation')],
            directory: [makePassingResult('directory')],
            health: [makePassingResult('health')],
        };

        const snapshots: ResourceSnapshot[] = [
            {
                timestamp: '2026-03-01T00:00:00.000Z',
                memorySaturation: 0.45,
                eventLoopDelayMs: 5,
                activeRequests: 30,
                currentRps: 100,
            },
        ];

        const envelope = buildCapacityEnvelope(
            resultsByEndpoint,
            snapshots,
            DEFAULT_PERFORMANCE_BUDGETS,
        );

        expect(envelope.service).toBe('api');
        expect(envelope.bottlenecks).toHaveLength(0);
        expect(envelope.scalingRecommendations.some(r => r.startsWith('CAPACITY-OK'))).toBe(true);
        expect(envelope.limits.feed.maxRps).toBeGreaterThan(0);
    });

    it('envelope captures bottlenecks from degraded snapshots', () => {
        const resultsByEndpoint: Record<LoadTestEndpoint, LoadTestResult[]> = {
            feed: [{
                endpoint: 'feed',
                tier: 'stress',
                latency: computeLatencyHistogram(Array.from({ length: 100 }, () => 1500)),
                totalRequests: 100,
                successCount: 90,
                errorCount: 10,
                actualRps: 50,
                durationSeconds: 60,
                withinBudget: false,
            }],
            map: [], chat: [], moderation: [], directory: [], health: [],
        };

        const snapshots: ResourceSnapshot[] = [{
            timestamp: '2026-03-01T00:05:00.000Z',
            memorySaturation: 0.93,
            eventLoopDelayMs: 150,
            activeRequests: 200,
            currentRps: 350,
        }];

        const envelope = buildCapacityEnvelope(
            resultsByEndpoint,
            snapshots,
            DEFAULT_PERFORMANCE_BUDGETS,
        );

        expect(envelope.bottlenecks.length).toBeGreaterThan(0);
        expect(envelope.scalingRecommendations.length).toBeGreaterThan(0);
        const resources = envelope.bottlenecks.map(b => b.resource);
        expect(resources).toContain('memory');
    });
});
