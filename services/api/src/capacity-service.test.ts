import { describe, expect, it } from 'vitest';
import type {
    LoadTestResult,
    PerformanceBudget,
    LatencyHistogram,
    LoadTestEndpoint,
} from '../../../packages/shared/src/load-testing.js';
import {
    detectBottlenecks,
    computeEndpointCapacity,
    generateScalingRecommendations,
    buildCapacityEnvelope,
    BOTTLENECK_THRESHOLDS,
    type ResourceSnapshot,
} from './capacity-service.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSnapshot = (overrides?: Partial<ResourceSnapshot>): ResourceSnapshot => ({
    timestamp: '2026-03-01T00:00:00.000Z',
    memorySaturation: 0.5,
    eventLoopDelayMs: 10,
    activeRequests: 20,
    currentRps: 50,
    ...overrides,
});

const makeHistogram = (overrides?: Partial<LatencyHistogram>): LatencyHistogram => ({
    min: 5,
    max: 200,
    mean: 50,
    p50: 40,
    p95: 120,
    p99: 180,
    sampleCount: 500,
    ...overrides,
});

const makeResult = (overrides?: Partial<LoadTestResult>): LoadTestResult => ({
    endpoint: 'feed',
    tier: 'baseline',
    latency: makeHistogram(),
    totalRequests: 1000,
    successCount: 998,
    errorCount: 2,
    actualRps: 100,
    durationSeconds: 60,
    withinBudget: true,
    ...overrides,
});

const feedBudget: PerformanceBudget = {
    endpoint: 'feed',
    latency: { p50Ms: 100, p95Ms: 300, p99Ms: 800 },
    maxErrorRate: 0.005,
    minThroughputRps: 80,
};

// ---------------------------------------------------------------------------
// detectBottlenecks
// ---------------------------------------------------------------------------

describe('detectBottlenecks', () => {
    it('returns empty array when all metrics are healthy', () => {
        const snapshots = [makeSnapshot()];
        const results = [makeResult()];
        const bottlenecks = detectBottlenecks(snapshots, results);
        expect(bottlenecks).toHaveLength(0);
    });

    it('detects memory saturation bottleneck', () => {
        const snapshots = [makeSnapshot({ memorySaturation: 0.92, currentRps: 300 })];
        const results = [makeResult()];
        const bottlenecks = detectBottlenecks(snapshots, results);

        expect(bottlenecks.some(b => b.resource === 'memory')).toBe(true);
        const memBottleneck = bottlenecks.find(b => b.resource === 'memory')!;
        expect(memBottleneck.observedAtRps).toBe(300);
        expect(memBottleneck.symptom).toContain('92.0%');
    });

    it('detects event-loop delay bottleneck', () => {
        const snapshots = [makeSnapshot({ eventLoopDelayMs: 250, currentRps: 200 })];
        const results = [makeResult()];
        const bottlenecks = detectBottlenecks(snapshots, results);

        expect(bottlenecks.some(b => b.resource === 'event-loop')).toBe(true);
        const elBottleneck = bottlenecks.find(b => b.resource === 'event-loop')!;
        expect(elBottleneck.observedAtRps).toBe(200);
    });

    it('detects latency degradation from test results', () => {
        const snapshots = [makeSnapshot()];
        const results = [makeResult({
            latency: makeHistogram({ p99: 1500 }),
            actualRps: 400,
            tier: 'stress',
        })];
        const bottlenecks = detectBottlenecks(snapshots, results);

        expect(bottlenecks.some(b => b.resource === 'cpu')).toBe(true);
        const cpuBottleneck = bottlenecks.find(b => b.resource === 'cpu')!;
        expect(cpuBottleneck.symptom).toContain('feed');
        expect(cpuBottleneck.symptom).toContain('1500ms');
    });

    it('detects multiple bottlenecks simultaneously', () => {
        const snapshots = [
            makeSnapshot({ memorySaturation: 0.95, eventLoopDelayMs: 200, currentRps: 350 }),
        ];
        const results = [makeResult({ latency: makeHistogram({ p99: 2000 }) })];
        const bottlenecks = detectBottlenecks(snapshots, results);

        expect(bottlenecks.length).toBeGreaterThanOrEqual(3);
        const resources = bottlenecks.map(b => b.resource);
        expect(resources).toContain('memory');
        expect(resources).toContain('event-loop');
        expect(resources).toContain('cpu');
    });

    it('handles empty snapshots gracefully', () => {
        const bottlenecks = detectBottlenecks([], [makeResult()]);
        // No snapshot-based bottlenecks, only result-based
        expect(bottlenecks.every(b => b.resource !== 'memory')).toBe(true);
        expect(bottlenecks.every(b => b.resource !== 'event-loop')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// computeEndpointCapacity
// ---------------------------------------------------------------------------

describe('computeEndpointCapacity', () => {
    it('computes positive capacity from passing results', () => {
        const results = [
            makeResult({ actualRps: 80, withinBudget: true }),
            makeResult({ actualRps: 120, withinBudget: true, tier: 'peak' }),
        ];
        const snapshots = [makeSnapshot()];
        const capacity = computeEndpointCapacity(results, snapshots, feedBudget);

        expect(capacity.maxRps).toBe(120);
        expect(capacity.maxConcurrentUsers).toBeGreaterThan(0);
        expect(capacity.maxCpuSaturation).toBe(0.80);
    });

    it('returns zero rps when no results pass budget', () => {
        const results = [
            makeResult({ withinBudget: false }),
        ];
        const snapshots = [makeSnapshot()];
        const capacity = computeEndpointCapacity(results, snapshots, feedBudget);

        expect(capacity.maxRps).toBe(0);
        expect(capacity.maxConcurrentUsers).toBe(0);
    });

    it('caps memory saturation at bottleneck threshold', () => {
        const snapshots = [makeSnapshot({ memorySaturation: 0.95 })];
        const results = [makeResult()];
        const capacity = computeEndpointCapacity(results, snapshots, feedBudget);

        expect(capacity.maxMemorySaturation).toBeLessThanOrEqual(
            BOTTLENECK_THRESHOLDS.memorySaturation,
        );
    });

    it('uses default memory threshold when no snapshots', () => {
        const capacity = computeEndpointCapacity([makeResult()], [], feedBudget);
        expect(capacity.maxMemorySaturation).toBe(BOTTLENECK_THRESHOLDS.memorySaturation);
    });
});

// ---------------------------------------------------------------------------
// generateScalingRecommendations
// ---------------------------------------------------------------------------

describe('generateScalingRecommendations', () => {
    it('recommends CAPACITY-OK when no bottlenecks or failures', () => {
        const recommendations = generateScalingRecommendations([], [makeResult()]);
        expect(recommendations.some(r => r.startsWith('CAPACITY-OK'))).toBe(true);
    });

    it('recommends SCALE-MEM for memory bottleneck', () => {
        const bottlenecks = [{
            resource: 'memory' as const,
            observedAtRps: 300,
            symptom: 'high memory',
            recommendation: '',
        }];
        const recommendations = generateScalingRecommendations(bottlenecks, []);
        expect(recommendations.some(r => r.startsWith('SCALE-MEM'))).toBe(true);
    });

    it('recommends SCALE-CPU for event-loop bottleneck', () => {
        const bottlenecks = [{
            resource: 'event-loop' as const,
            observedAtRps: 200,
            symptom: 'high event loop delay',
            recommendation: '',
        }];
        const recommendations = generateScalingRecommendations(bottlenecks, []);
        expect(recommendations.some(r => r.startsWith('SCALE-CPU'))).toBe(true);
    });

    it('recommends SCALE-HORIZONTAL for stress tier failures', () => {
        const results = [
            makeResult({ tier: 'stress', withinBudget: false, endpoint: 'feed' }),
            makeResult({ tier: 'stress', withinBudget: false, endpoint: 'map' }),
        ];
        const recommendations = generateScalingRecommendations([], results);
        expect(recommendations.some(r => r.startsWith('SCALE-HORIZONTAL'))).toBe(true);
        expect(recommendations.some(r => r.includes('feed') && r.includes('map'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// buildCapacityEnvelope
// ---------------------------------------------------------------------------

describe('buildCapacityEnvelope', () => {
    it('builds a complete envelope for a single endpoint', () => {
        const resultsByEndpoint: Record<LoadTestEndpoint, LoadTestResult[]> = {
            feed: [makeResult({ endpoint: 'feed', withinBudget: true })],
            map: [],
            chat: [],
            moderation: [],
            directory: [],
            health: [],
        };
        const snapshots = [makeSnapshot()];
        const budgets = [feedBudget];

        const envelope = buildCapacityEnvelope(resultsByEndpoint, snapshots, budgets);

        expect(envelope.service).toBe('api');
        expect(envelope.measuredAt).toBeTruthy();
        expect(envelope.limits.feed).toBeDefined();
        expect(envelope.limits.feed.maxRps).toBeGreaterThan(0);
        expect(envelope.scalingRecommendations.length).toBeGreaterThan(0);
    });

    it('includes bottlenecks when resource thresholds exceeded', () => {
        const resultsByEndpoint: Record<LoadTestEndpoint, LoadTestResult[]> = {
            feed: [makeResult({ latency: makeHistogram({ p99: 2000 }) })],
            map: [],
            chat: [],
            moderation: [],
            directory: [],
            health: [],
        };
        const snapshots = [makeSnapshot({ memorySaturation: 0.92 })];
        const budgets = [feedBudget];

        const envelope = buildCapacityEnvelope(resultsByEndpoint, snapshots, budgets);

        expect(envelope.bottlenecks.length).toBeGreaterThan(0);
    });

    it('envelope service is always api', () => {
        const envelope = buildCapacityEnvelope(
            { feed: [], map: [], chat: [], moderation: [], directory: [], health: [] },
            [],
            [],
        );
        expect(envelope.service).toBe('api');
    });
});
