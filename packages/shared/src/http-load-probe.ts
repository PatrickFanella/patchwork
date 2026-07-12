import { performance } from 'node:perf_hooks';
import { computeLatencyHistogram, type LatencyHistogram } from './load-testing.js';

export interface HttpLoadProbeOptions {
    baseUrl: string;
    path: string;
    durationMs: number;
    concurrency: number;
    requestTimeoutMs: number;
    maxRequests?: number;
    forwardedForPoolSize?: number;
    targetRps?: number;
    searchParams?: Readonly<Record<string, string>>;
}

export interface HttpLoadProbeResult {
    path: string;
    durationMs: number;
    concurrency: number;
    totalRequests: number;
    successCount: number;
    errorCount: number;
    statusCounts: Record<string, number>;
    actualRps: number;
    latency: LatencyHistogram;
}

const assertIntegerInRange = (
    name: string,
    value: number,
    minimum: number,
    maximum: number,
): void => {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
    }
};

const validateTarget = (baseUrl: string, path: string): URL => {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
        throw new Error('baseUrl must use HTTP or HTTPS.');
    }
    if (base.username || base.password) {
        throw new Error('baseUrl must not contain credentials.');
    }
    if (base.search || base.hash) {
        throw new Error('baseUrl must not contain a query string or fragment.');
    }
    if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
        throw new Error('path must be absolute and must not contain query strings or fragments.');
    }
    return new URL(path, base);
};

export const runHttpLoadProbe = async (
    options: HttpLoadProbeOptions,
): Promise<HttpLoadProbeResult> => {
    assertIntegerInRange('durationMs', options.durationMs, 1, 3_600_000);
    assertIntegerInRange('concurrency', options.concurrency, 1, 1_000);
    assertIntegerInRange('requestTimeoutMs', options.requestTimeoutMs, 1, 300_000);
    const maxRequests = options.maxRequests ?? 100_000;
    assertIntegerInRange('maxRequests', maxRequests, 1, 1_000_000);
    const forwardedForPoolSize = options.forwardedForPoolSize ?? 0;
    assertIntegerInRange('forwardedForPoolSize', forwardedForPoolSize, 0, 254);
    const target = validateTarget(options.baseUrl, options.path);
    for (const [key, value] of Object.entries(options.searchParams ?? {})) {
        target.searchParams.set(key, value);
    }
    const targetRps = options.targetRps ?? 0;
    assertIntegerInRange('targetRps', targetRps, 0, 100_000);

    const startedAt = performance.now();
    const stopAt = startedAt + options.durationMs;
    const latencies: number[] = [];
    const statusCounts: Record<string, number> = {};
    let claimedRequests = 0;
    let successCount = 0;
    let errorCount = 0;

    const worker = async (): Promise<void> => {
        while (performance.now() < stopAt && claimedRequests < maxRequests) {
            const requestIndex = claimedRequests;
            claimedRequests += 1;
            if (targetRps > 0) {
                const scheduledAt = startedAt + (requestIndex * 1_000) / targetRps;
                if (scheduledAt >= stopAt) return;
                const waitMs = scheduledAt - performance.now();
                if (waitMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                }
            }
            const requestStartedAt = performance.now();
            try {
                const headers =
                    forwardedForPoolSize > 0 ?
                        {
                            'x-forwarded-for': `198.51.100.${
                                (requestIndex % forwardedForPoolSize) + 1
                            }`,
                        }
                    :   undefined;
                const response = await fetch(target, {
                    method: 'GET',
                    headers,
                    signal: AbortSignal.timeout(options.requestTimeoutMs),
                });
                const status = String(response.status);
                statusCounts[status] = (statusCounts[status] ?? 0) + 1;
                await response.arrayBuffer();
                if (response.ok) successCount += 1;
                else errorCount += 1;
            } catch {
                statusCounts.network_error = (statusCounts.network_error ?? 0) + 1;
                errorCount += 1;
            } finally {
                latencies.push(performance.now() - requestStartedAt);
            }
        }
    };

    await Promise.all(Array.from({ length: options.concurrency }, worker));
    const elapsedMs = performance.now() - startedAt;
    const totalRequests = successCount + errorCount;

    return {
        path: options.path,
        durationMs: Math.round(elapsedMs),
        concurrency: options.concurrency,
        totalRequests,
        successCount,
        errorCount,
        statusCounts,
        actualRps: Number((totalRequests / (elapsedMs / 1_000)).toFixed(2)),
        latency: computeLatencyHistogram(latencies),
    };
};
