/**
 * Load testing profile types, capacity envelope contracts, and performance
 * budget definitions for Patchwork services.
 *
 * These contracts define the load test scenarios, expected throughput/latency
 * targets, and safe operating envelope so that capacity validation is
 * repeatable and documented in code.
 */

import type { PatchworkService } from './sli.js';

// ---------------------------------------------------------------------------
// Endpoint categories
// ---------------------------------------------------------------------------

export type LoadTestEndpoint =
    | 'feed'
    | 'map'
    | 'chat'
    | 'moderation'
    | 'directory'
    | 'health';

export const LOAD_TEST_ENDPOINTS: readonly LoadTestEndpoint[] = [
    'feed',
    'map',
    'chat',
    'moderation',
    'directory',
    'health',
] as const;

// ---------------------------------------------------------------------------
// Load profile definitions
// ---------------------------------------------------------------------------

export interface LoadProfileTier {
    /** Human-readable tier name (e.g. "baseline", "peak", "stress"). */
    name: string;
    /** Number of concurrent virtual users. */
    concurrentUsers: number;
    /** Target requests per second across all users. */
    requestsPerSecond: number;
    /** Duration of the test phase in seconds. */
    durationSeconds: number;
}

export interface EndpointLoadProfile {
    /** Which endpoint category this profile targets. */
    endpoint: LoadTestEndpoint;
    /** The API path pattern exercised (e.g. "/query/feed"). */
    path: string;
    /** Ordered tiers from lightest to heaviest load. */
    tiers: LoadProfileTier[];
}

// ---------------------------------------------------------------------------
// Performance budget (latency & error rate targets)
// ---------------------------------------------------------------------------

export interface LatencyBudget {
    /** p50 latency ceiling in milliseconds. */
    p50Ms: number;
    /** p95 latency ceiling in milliseconds. */
    p95Ms: number;
    /** p99 latency ceiling in milliseconds. */
    p99Ms: number;
}

export interface PerformanceBudget {
    endpoint: LoadTestEndpoint;
    latency: LatencyBudget;
    /** Maximum acceptable error rate as a fraction (e.g. 0.005 = 0.5%). */
    maxErrorRate: number;
    /** Minimum throughput in requests per second the system must sustain. */
    minThroughputRps: number;
}

// ---------------------------------------------------------------------------
// Capacity envelope
// ---------------------------------------------------------------------------

export interface CapacityLimit {
    /** Maximum concurrent users before latency degrades past budget. */
    maxConcurrentUsers: number;
    /** Maximum sustained requests per second. */
    maxRps: number;
    /** Maximum safe memory utilisation fraction (0-1). */
    maxMemorySaturation: number;
    /** Maximum safe CPU utilisation fraction (0-1). */
    maxCpuSaturation: number;
}

export interface BottleneckRecord {
    /** Which resource is the bottleneck. */
    resource: 'cpu' | 'memory' | 'database' | 'network' | 'event-loop';
    /** Load level at which the bottleneck was observed. */
    observedAtRps: number;
    /** Description of the symptom. */
    symptom: string;
    /** Recommended mitigation. */
    recommendation: string;
}

export interface CapacityEnvelope {
    service: PatchworkService;
    /** When this envelope was measured. */
    measuredAt: string;
    /** Per-endpoint capacity limits. */
    limits: Record<LoadTestEndpoint, CapacityLimit>;
    /** Identified bottlenecks. */
    bottlenecks: BottleneckRecord[];
    /** Scaling recommendations. */
    scalingRecommendations: string[];
}

// ---------------------------------------------------------------------------
// Load test result types
// ---------------------------------------------------------------------------

export interface LatencyHistogram {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    sampleCount: number;
}

export interface LoadTestResult {
    endpoint: LoadTestEndpoint;
    tier: string;
    latency: LatencyHistogram;
    totalRequests: number;
    successCount: number;
    errorCount: number;
    /** Actual throughput achieved in rps. */
    actualRps: number;
    /** Duration of the test run in seconds. */
    durationSeconds: number;
    /** Whether the result meets the performance budget. */
    withinBudget: boolean;
}

// ---------------------------------------------------------------------------
// Default load profiles for each endpoint
// ---------------------------------------------------------------------------

export const DEFAULT_LOAD_PROFILES: readonly EndpointLoadProfile[] = [
    {
        endpoint: 'feed',
        path: '/query/feed',
        tiers: [
            { name: 'baseline', concurrentUsers: 10, requestsPerSecond: 20, durationSeconds: 60 },
            { name: 'peak', concurrentUsers: 50, requestsPerSecond: 100, durationSeconds: 120 },
            { name: 'stress', concurrentUsers: 200, requestsPerSecond: 400, durationSeconds: 60 },
        ],
    },
    {
        endpoint: 'map',
        path: '/query/map',
        tiers: [
            { name: 'baseline', concurrentUsers: 10, requestsPerSecond: 15, durationSeconds: 60 },
            { name: 'peak', concurrentUsers: 50, requestsPerSecond: 80, durationSeconds: 120 },
            { name: 'stress', concurrentUsers: 150, requestsPerSecond: 300, durationSeconds: 60 },
        ],
    },
    {
        endpoint: 'chat',
        path: '/chat/initiate',
        tiers: [
            { name: 'baseline', concurrentUsers: 5, requestsPerSecond: 10, durationSeconds: 60 },
            { name: 'peak', concurrentUsers: 30, requestsPerSecond: 60, durationSeconds: 120 },
            { name: 'stress', concurrentUsers: 100, requestsPerSecond: 200, durationSeconds: 60 },
        ],
    },
    {
        endpoint: 'moderation',
        path: '/chat/safety/evaluate',
        tiers: [
            { name: 'baseline', concurrentUsers: 3, requestsPerSecond: 5, durationSeconds: 60 },
            { name: 'peak', concurrentUsers: 15, requestsPerSecond: 30, durationSeconds: 120 },
            { name: 'stress', concurrentUsers: 50, requestsPerSecond: 100, durationSeconds: 60 },
        ],
    },
    {
        endpoint: 'directory',
        path: '/query/directory',
        tiers: [
            { name: 'baseline', concurrentUsers: 5, requestsPerSecond: 10, durationSeconds: 60 },
            { name: 'peak', concurrentUsers: 25, requestsPerSecond: 50, durationSeconds: 120 },
            { name: 'stress', concurrentUsers: 80, requestsPerSecond: 160, durationSeconds: 60 },
        ],
    },
    {
        endpoint: 'health',
        path: '/health',
        tiers: [
            { name: 'baseline', concurrentUsers: 2, requestsPerSecond: 5, durationSeconds: 30 },
            { name: 'peak', concurrentUsers: 10, requestsPerSecond: 20, durationSeconds: 60 },
            { name: 'stress', concurrentUsers: 30, requestsPerSecond: 60, durationSeconds: 30 },
        ],
    },
] as const;

// ---------------------------------------------------------------------------
// Default performance budgets
// ---------------------------------------------------------------------------

export const DEFAULT_PERFORMANCE_BUDGETS: readonly PerformanceBudget[] = [
    {
        endpoint: 'feed',
        latency: { p50Ms: 100, p95Ms: 300, p99Ms: 800 },
        maxErrorRate: 0.005,
        minThroughputRps: 80,
    },
    {
        endpoint: 'map',
        latency: { p50Ms: 150, p95Ms: 400, p99Ms: 1000 },
        maxErrorRate: 0.005,
        minThroughputRps: 60,
    },
    {
        endpoint: 'chat',
        latency: { p50Ms: 80, p95Ms: 250, p99Ms: 600 },
        maxErrorRate: 0.002,
        minThroughputRps: 40,
    },
    {
        endpoint: 'moderation',
        latency: { p50Ms: 200, p95Ms: 500, p99Ms: 1200 },
        maxErrorRate: 0.01,
        minThroughputRps: 20,
    },
    {
        endpoint: 'directory',
        latency: { p50Ms: 120, p95Ms: 350, p99Ms: 900 },
        maxErrorRate: 0.005,
        minThroughputRps: 40,
    },
    {
        endpoint: 'health',
        latency: { p50Ms: 10, p95Ms: 30, p99Ms: 80 },
        maxErrorRate: 0.0,
        minThroughputRps: 50,
    },
] as const;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Compute a latency histogram from an array of latency samples (in ms).
 * Returns sorted percentiles.
 */
export const computeLatencyHistogram = (
    samples: readonly number[],
): LatencyHistogram => {
    if (samples.length === 0) {
        return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, sampleCount: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const percentile = (p: number): number => {
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)]!;
    };

    return {
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        mean: parseFloat((sum / sorted.length).toFixed(2)),
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        sampleCount: sorted.length,
    };
};

/**
 * Evaluate whether a load test result meets its performance budget.
 */
export const evaluateBudget = (
    result: { latency: LatencyHistogram; errorCount: number; totalRequests: number; actualRps: number },
    budget: PerformanceBudget,
): { withinBudget: boolean; violations: string[] } => {
    const violations: string[] = [];

    if (result.latency.p50 > budget.latency.p50Ms) {
        violations.push(
            `p50 latency ${result.latency.p50}ms exceeds budget ${budget.latency.p50Ms}ms`,
        );
    }
    if (result.latency.p95 > budget.latency.p95Ms) {
        violations.push(
            `p95 latency ${result.latency.p95}ms exceeds budget ${budget.latency.p95Ms}ms`,
        );
    }
    if (result.latency.p99 > budget.latency.p99Ms) {
        violations.push(
            `p99 latency ${result.latency.p99}ms exceeds budget ${budget.latency.p99Ms}ms`,
        );
    }

    const errorRate =
        result.totalRequests > 0
            ? result.errorCount / result.totalRequests
            : 0;
    if (errorRate > budget.maxErrorRate) {
        violations.push(
            `error rate ${(errorRate * 100).toFixed(2)}% exceeds budget ${(budget.maxErrorRate * 100).toFixed(2)}%`,
        );
    }

    if (result.actualRps < budget.minThroughputRps) {
        violations.push(
            `throughput ${result.actualRps} rps below minimum ${budget.minThroughputRps} rps`,
        );
    }

    return { withinBudget: violations.length === 0, violations };
};

/**
 * Look up the performance budget for a given endpoint.
 */
export const getBudgetForEndpoint = (
    endpoint: LoadTestEndpoint,
    budgets: readonly PerformanceBudget[] = DEFAULT_PERFORMANCE_BUDGETS,
): PerformanceBudget | undefined => {
    return budgets.find(b => b.endpoint === endpoint);
};

/**
 * Look up the load profile for a given endpoint.
 */
export const getProfileForEndpoint = (
    endpoint: LoadTestEndpoint,
    profiles: readonly EndpointLoadProfile[] = DEFAULT_LOAD_PROFILES,
): EndpointLoadProfile | undefined => {
    return profiles.find(p => p.endpoint === endpoint);
};
