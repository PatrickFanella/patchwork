import {
    DEFAULT_PERFORMANCE_BUDGETS,
    evaluateBudget,
    type LoadTestEndpoint,
} from '../packages/shared/src/load-testing.js';
import { runHttpLoadProbe } from '../packages/shared/src/http-load-probe.js';

const ALPHA_READ_ROUTES = [
    { endpoint: 'health', path: '/health', targetRps: 50 },
    { endpoint: 'map', path: '/query/map', targetRps: 60 },
    { endpoint: 'feed', path: '/query/feed', targetRps: 80 },
    { endpoint: 'directory', path: '/query/directory', targetRps: 40 },
] as const satisfies readonly { endpoint: LoadTestEndpoint; path: string }[];

const readInteger = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
    return value;
};

const main = async (): Promise<void> => {
    const baseUrl = process.env.PATCHWORK_CAPACITY_BASE_URL;
    if (!baseUrl) {
        throw new Error('PATCHWORK_CAPACITY_BASE_URL is required.');
    }

    const durationMs =
        readInteger('PATCHWORK_CAPACITY_DURATION_SECONDS', 10) * 1_000;
    const concurrency = readInteger('PATCHWORK_CAPACITY_CONCURRENCY', 4);
    const requestTimeoutMs = readInteger(
        'PATCHWORK_CAPACITY_REQUEST_TIMEOUT_MS',
        5_000,
    );
    const forwardedForPoolSize = readInteger(
        'PATCHWORK_CAPACITY_FORWARDED_FOR_POOL_SIZE',
        0,
    );
    const enforceBudgets =
        process.env.PATCHWORK_CAPACITY_ENFORCE_BUDGETS === '1';

    const results = [];
    let failed = false;
    for (const route of ALPHA_READ_ROUTES) {
        const measured = await runHttpLoadProbe({
            baseUrl,
            path: route.path,
            durationMs,
            concurrency,
            requestTimeoutMs,
            forwardedForPoolSize,
            targetRps: route.targetRps,
            ...(route.endpoint === 'map' || route.endpoint === 'feed' ?
                {
                    searchParams: {
                        latitude: '0',
                        longitude: '0',
                        radiusKm: '25',
                    },
                }
            :   {}),
        });
        const budget = DEFAULT_PERFORMANCE_BUDGETS.find(
            candidate => candidate.endpoint === route.endpoint,
        );
        const evaluation =
            budget ?
                evaluateBudget(
                    {
                        latency: measured.latency,
                        errorCount: measured.errorCount,
                        totalRequests: measured.totalRequests,
                        actualRps: measured.actualRps,
                    },
                    budget,
                )
            :   undefined;
        if (
            measured.errorCount > 0 ||
            (enforceBudgets && !evaluation?.withinBudget)
        ) {
            failed = true;
        }
        results.push({
            endpoint: route.endpoint,
            targetRps: route.targetRps,
            ...measured,
            budget: evaluation,
        });
    }

    process.stdout.write(
        `${JSON.stringify(
            {
                evidenceKind: 'http-runtime-probe',
                measuredAt: new Date().toISOString(),
                environment:
                    process.env.PATCHWORK_CAPACITY_ENVIRONMENT ?? 'unspecified',
                durationPerRouteMs: durationMs,
                concurrency,
                forwardedForPoolSize,
                budgetsEnforced: enforceBudgets,
                results,
            },
            null,
            2,
        )}\n`,
    );

    if (failed) process.exitCode = 1;
};

void main();
