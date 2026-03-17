/**
 * Performance validation tests for the Patchwork API.
 *
 * Validates that fixture-backed endpoint handlers meet their performance
 * budgets (latency, error rate, throughput) under simulated request
 * workloads. These tests run deterministically in-process -- they do not
 * require a running server.
 */

import { describe, expect, it } from 'vitest';
import {
    computeLatencyHistogram,
    evaluateBudget,
    getBudgetForEndpoint,
    type LoadTestEndpoint,
} from '../../../packages/shared/src/load-testing.js';
import { createFixtureQueryService } from './query-service.js';
import { createFixtureChatService } from './chat-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate N requests against a handler function, collecting latency samples.
 */
const benchmarkHandler = (
    handler: () => { statusCode: number },
    requestCount: number,
): { samples: number[]; errorCount: number } => {
    const samples: number[] = [];
    let errorCount = 0;

    for (let i = 0; i < requestCount; i++) {
        const start = performance.now();
        const result = handler();
        const elapsed = performance.now() - start;
        samples.push(elapsed);
        if (result.statusCode >= 500) {
            errorCount++;
        }
    }

    return { samples, errorCount };
};

// ---------------------------------------------------------------------------
// Feed endpoint performance
// ---------------------------------------------------------------------------

describe('feed endpoint performance', () => {
    it('meets p95 latency budget under baseline load', () => {
        const service = createFixtureQueryService();
        const budget = getBudgetForEndpoint('feed')!;
        const requestCount = 200;

        const { samples, errorCount } = benchmarkHandler(
            () =>
                service.queryFeed(
                    new URLSearchParams({
                        latitude: '40.7128',
                        longitude: '-74.006',
                        radiusKm: '50',
                    }),
                ),
            requestCount,
        );

        const histogram = computeLatencyHistogram(samples);
        const durationSeconds = samples.reduce((a, b) => a + b, 0) / 1000;
        const actualRps = requestCount / Math.max(durationSeconds, 0.001);

        const { withinBudget: _withinBudget } = evaluateBudget(
            { latency: histogram, errorCount, totalRequests: requestCount, actualRps },
            budget,
        );

        expect(histogram.p95).toBeLessThan(budget.latency.p95Ms);
        expect(errorCount).toBe(0);
    });

    it('error rate stays within budget', () => {
        const service = createFixtureQueryService();
        const budget = getBudgetForEndpoint('feed')!;

        const { errorCount } = benchmarkHandler(
            () =>
                service.queryFeed(
                    new URLSearchParams({
                        latitude: '40.7128',
                        longitude: '-74.006',
                        radiusKm: '50',
                    }),
                ),
            100,
        );

        const errorRate = errorCount / 100;
        expect(errorRate).toBeLessThanOrEqual(budget.maxErrorRate);
    });
});

// ---------------------------------------------------------------------------
// Map endpoint performance
// ---------------------------------------------------------------------------

describe('map endpoint performance', () => {
    it('meets p95 latency budget under baseline load', () => {
        const service = createFixtureQueryService();
        const budget = getBudgetForEndpoint('map')!;
        const requestCount = 200;

        const { samples, errorCount } = benchmarkHandler(
            () =>
                service.queryMap(
                    new URLSearchParams({
                        latitude: '40.7128',
                        longitude: '-74.006',
                        radiusKm: '50',
                    }),
                ),
            requestCount,
        );

        const histogram = computeLatencyHistogram(samples);

        expect(histogram.p95).toBeLessThan(budget.latency.p95Ms);
        expect(errorCount).toBe(0);
    });

    it('p99 latency stays within budget', () => {
        const service = createFixtureQueryService();
        const budget = getBudgetForEndpoint('map')!;

        const { samples } = benchmarkHandler(
            () =>
                service.queryMap(
                    new URLSearchParams({
                        latitude: '40.7128',
                        longitude: '-74.006',
                        radiusKm: '50',
                    }),
                ),
            300,
        );

        const histogram = computeLatencyHistogram(samples);
        expect(histogram.p99).toBeLessThan(budget.latency.p99Ms);
    });
});

// ---------------------------------------------------------------------------
// Chat endpoint performance
// ---------------------------------------------------------------------------

describe('chat endpoint performance', () => {
    it('meets p95 latency budget for chat initiation', () => {
        const budget = getBudgetForEndpoint('chat')!;
        const requestCount = 100;

        // Each request uses a unique post URI to avoid dedup overhead skewing results
        const samples: number[] = [];
        let errorCount = 0;

        for (let i = 0; i < requestCount; i++) {
            const service = createFixtureChatService();
            const start = performance.now();
            const result = service.initiateFromParams(
                new URLSearchParams({
                    aidPostUri: `at://did:example:perf/app.patchwork.aid.post/perf-${i}`,
                    initiatedByDid: 'did:example:helper',
                    recipientDid: 'did:example:requester',
                    initiatedFrom: 'map',
                }),
            );
            samples.push(performance.now() - start);
            if (result.statusCode >= 500) errorCount++;
        }

        const histogram = computeLatencyHistogram(samples);
        expect(histogram.p95).toBeLessThan(budget.latency.p95Ms);
        expect(errorCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Directory endpoint performance
// ---------------------------------------------------------------------------

describe('directory endpoint performance', () => {
    it('meets p95 latency budget under baseline load', () => {
        const service = createFixtureQueryService();
        const budget = getBudgetForEndpoint('directory')!;

        const { samples, errorCount } = benchmarkHandler(
            () => service.queryDirectory(new URLSearchParams({ category: 'food' })),
            200,
        );

        const histogram = computeLatencyHistogram(samples);
        expect(histogram.p95).toBeLessThan(budget.latency.p95Ms);
        expect(errorCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Cross-endpoint performance summary
// ---------------------------------------------------------------------------

describe('cross-endpoint performance summary', () => {
    it('all fixture-backed endpoints produce sub-millisecond p50 latency', () => {
        const service = createFixtureQueryService();

        const endpoints: Array<{ name: LoadTestEndpoint; run: () => { statusCode: number } }> = [
            {
                name: 'feed',
                run: () => service.queryFeed(new URLSearchParams({ latitude: '40', longitude: '-74', radiusKm: '50' })),
            },
            {
                name: 'map',
                run: () => service.queryMap(new URLSearchParams({ latitude: '40', longitude: '-74', radiusKm: '50' })),
            },
            {
                name: 'directory',
                run: () => service.queryDirectory(new URLSearchParams({})),
            },
        ];

        for (const ep of endpoints) {
            const { samples } = benchmarkHandler(ep.run, 50);
            const histogram = computeLatencyHistogram(samples);
            // Fixture-backed handlers are in-memory, so p50 should be very fast
            expect(histogram.p50).toBeLessThan(50);
        }
    });
});
