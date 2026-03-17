/**
 * Capacity measurement, bottleneck detection, and safe operating envelope
 * calculation for the Patchwork API service.
 *
 * This module aggregates load test results, detects resource bottlenecks,
 * and computes the safe operating envelope that defines the system's
 * validated capacity limits.
 */

import type {
    LoadTestEndpoint,
    LoadTestResult,
    CapacityEnvelope,
    CapacityLimit,
    BottleneckRecord,
    PerformanceBudget,
} from '../../../packages/shared/src/load-testing.js';

// ---------------------------------------------------------------------------
// Resource snapshot (collected during load tests)
// ---------------------------------------------------------------------------

export interface ResourceSnapshot {
    /** Timestamp when this snapshot was taken. */
    timestamp: string;
    /** Heap memory used as a fraction of heap total (0-1). */
    memorySaturation: number;
    /** Event loop delay in milliseconds. */
    eventLoopDelayMs: number;
    /** Active request count at the time of snapshot. */
    activeRequests: number;
    /** Requests per second at the time of snapshot. */
    currentRps: number;
}

// ---------------------------------------------------------------------------
// Bottleneck detection thresholds
// ---------------------------------------------------------------------------

export const BOTTLENECK_THRESHOLDS = {
    /** Memory saturation above which we flag a memory bottleneck. */
    memorySaturation: 0.85,
    /** Event loop delay (ms) above which we flag an event-loop bottleneck. */
    eventLoopDelayMs: 100,
    /** p99 latency (ms) above which we consider it degraded. */
    latencyDegradedMs: 1000,
} as const;

// ---------------------------------------------------------------------------
// Bottleneck detector
// ---------------------------------------------------------------------------

/**
 * Analyse resource snapshots collected during a load test to identify
 * bottlenecks and produce recommendations.
 */
export const detectBottlenecks = (
    snapshots: readonly ResourceSnapshot[],
    results: readonly LoadTestResult[],
): BottleneckRecord[] => {
    const bottlenecks: BottleneckRecord[] = [];

    // Memory bottleneck
    const maxMemory = Math.max(0, ...snapshots.map(s => s.memorySaturation));
    if (maxMemory > BOTTLENECK_THRESHOLDS.memorySaturation) {
        const triggerSnapshot = snapshots.find(
            s => s.memorySaturation > BOTTLENECK_THRESHOLDS.memorySaturation,
        );
        bottlenecks.push({
            resource: 'memory',
            observedAtRps: triggerSnapshot?.currentRps ?? 0,
            symptom: `Heap saturation reached ${(maxMemory * 100).toFixed(1)}%`,
            recommendation:
                'Increase heap limit (--max-old-space-size) or add horizontal replicas.',
        });
    }

    // Event loop bottleneck
    const maxDelay = Math.max(0, ...snapshots.map(s => s.eventLoopDelayMs));
    if (maxDelay > BOTTLENECK_THRESHOLDS.eventLoopDelayMs) {
        const triggerSnapshot = snapshots.find(
            s => s.eventLoopDelayMs > BOTTLENECK_THRESHOLDS.eventLoopDelayMs,
        );
        bottlenecks.push({
            resource: 'event-loop',
            observedAtRps: triggerSnapshot?.currentRps ?? 0,
            symptom: `Event loop delay reached ${maxDelay.toFixed(0)}ms`,
            recommendation:
                'Offload CPU-heavy work to worker threads or reduce synchronous processing.',
        });
    }

    // Latency degradation (from test results)
    for (const result of results) {
        if (result.latency.p99 > BOTTLENECK_THRESHOLDS.latencyDegradedMs) {
            bottlenecks.push({
                resource: 'cpu',
                observedAtRps: result.actualRps,
                symptom: `${result.endpoint} p99 latency ${result.latency.p99}ms at ${result.actualRps} rps (tier: ${result.tier})`,
                recommendation:
                    'Profile endpoint handler for CPU-bound operations; consider caching.',
            });
        }
    }

    return bottlenecks;
};

// ---------------------------------------------------------------------------
// Capacity limit computation
// ---------------------------------------------------------------------------

/**
 * Compute the safe capacity limit for a single endpoint based on its
 * load test results and resource snapshots.
 */
export const computeEndpointCapacity = (
    results: readonly LoadTestResult[],
    snapshots: readonly ResourceSnapshot[],
    _budget: PerformanceBudget,
): CapacityLimit => {
    // Find the highest tier that is still within budget
    const passingResults = results.filter(r => r.withinBudget);

    const maxConcurrentUsers =
        passingResults.length > 0
            ? Math.max(...passingResults.map(r => {
                // Estimate concurrent users from rps and average latency
                const avgLatencySec = r.latency.mean / 1000;
                return Math.ceil(r.actualRps * avgLatencySec) || r.actualRps;
            }))
            : 0;

    const maxRps =
        passingResults.length > 0
            ? Math.max(...passingResults.map(r => r.actualRps))
            : 0;

    const maxMemorySaturation =
        snapshots.length > 0
            ? Math.min(
                BOTTLENECK_THRESHOLDS.memorySaturation,
                Math.max(...snapshots.map(s => s.memorySaturation)),
            )
            : BOTTLENECK_THRESHOLDS.memorySaturation;

    return {
        maxConcurrentUsers,
        maxRps,
        maxMemorySaturation,
        maxCpuSaturation: 0.80, // standard safe ceiling
    };
};

// ---------------------------------------------------------------------------
// Scaling recommendations
// ---------------------------------------------------------------------------

/**
 * Generate scaling recommendations based on bottleneck analysis.
 */
export const generateScalingRecommendations = (
    bottlenecks: readonly BottleneckRecord[],
    results: readonly LoadTestResult[],
): string[] => {
    const recommendations: string[] = [];

    const hasMemoryBottleneck = bottlenecks.some(b => b.resource === 'memory');
    const hasEventLoopBottleneck = bottlenecks.some(b => b.resource === 'event-loop');
    const hasCpuBottleneck = bottlenecks.some(b => b.resource === 'cpu');

    if (hasMemoryBottleneck) {
        recommendations.push(
            'SCALE-MEM: Increase Node.js heap size or add horizontal replicas behind load balancer.',
        );
    }

    if (hasEventLoopBottleneck) {
        recommendations.push(
            'SCALE-CPU: Offload compute-intensive work to worker threads; consider clustering.',
        );
    }

    if (hasCpuBottleneck) {
        recommendations.push(
            'SCALE-LATENCY: Add response caching for read-heavy endpoints (feed, map, directory).',
        );
    }

    // Check for endpoints that failed stress tier
    const stressFailures = results.filter(
        r => r.tier === 'stress' && !r.withinBudget,
    );
    if (stressFailures.length > 0) {
        const endpoints = stressFailures.map(r => r.endpoint).join(', ');
        recommendations.push(
            `SCALE-HORIZONTAL: Endpoints [${endpoints}] failed stress tier; add replicas for horizontal scaling.`,
        );
    }

    // General recommendation if everything passed
    if (bottlenecks.length === 0 && stressFailures.length === 0) {
        recommendations.push(
            'CAPACITY-OK: All endpoints within budget at peak load. Monitor for organic growth beyond stress thresholds.',
        );
    }

    return recommendations;
};

// ---------------------------------------------------------------------------
// Envelope builder
// ---------------------------------------------------------------------------

/**
 * Build a complete capacity envelope from load test results and resource
 * snapshots.
 */
export const buildCapacityEnvelope = (
    resultsByEndpoint: Record<LoadTestEndpoint, LoadTestResult[]>,
    snapshots: readonly ResourceSnapshot[],
    budgets: readonly PerformanceBudget[],
): CapacityEnvelope => {
    const allResults = Object.values(resultsByEndpoint).flat();
    const bottlenecks = detectBottlenecks(snapshots, allResults);

    const limits: Record<string, CapacityLimit> = {};

    for (const [endpoint, results] of Object.entries(resultsByEndpoint)) {
        const budget = budgets.find(b => b.endpoint === endpoint);
        if (budget) {
            limits[endpoint] = computeEndpointCapacity(results, snapshots, budget);
        }
    }

    const scalingRecommendations = generateScalingRecommendations(
        bottlenecks,
        allResults,
    );

    return {
        service: 'api',
        measuredAt: new Date().toISOString(),
        limits: limits as Record<LoadTestEndpoint, CapacityLimit>,
        bottlenecks,
        scalingRecommendations,
    };
};
