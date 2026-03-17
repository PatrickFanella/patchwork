import { describe, expect, it } from 'vitest';
import {
    DEPLOYMENT_ENVIRONMENTS,
    STAGING_SERVICE_CONFIGS,
    checkStagingParity,
    isStagingParityValid,
    evaluatePromotionGate,
    DEFAULT_STAGING_OWNERSHIP,
    type StagingServiceConfig,
    type SmokeCheckResult,
} from './staging.js';

describe('DEPLOYMENT_ENVIRONMENTS', () => {
    it('includes development, staging, and production', () => {
        expect(DEPLOYMENT_ENVIRONMENTS).toEqual([
            'development',
            'staging',
            'production',
        ]);
    });
});

describe('STAGING_SERVICE_CONFIGS', () => {
    it('defines all three services', () => {
        const services = STAGING_SERVICE_CONFIGS.map(s => s.service).sort();
        expect(services).toEqual(['api', 'indexer', 'moderation-worker']);
    });

    it('every service has port, replicas, and env keys', () => {
        for (const config of STAGING_SERVICE_CONFIGS) {
            expect(config.port).toBeGreaterThan(0);
            expect(config.replicas).toBeGreaterThanOrEqual(1);
            expect(config.envKeys.length).toBeGreaterThan(0);
        }
    });

    it('all services include NODE_ENV and LOG_LEVEL', () => {
        for (const config of STAGING_SERVICE_CONFIGS) {
            expect(config.envKeys).toContain('NODE_ENV');
            expect(config.envKeys).toContain('LOG_LEVEL');
        }
    });
});

describe('checkStagingParity', () => {
    it('returns pass when staging matches production', () => {
        const results = checkStagingParity(
            STAGING_SERVICE_CONFIGS,
            STAGING_SERVICE_CONFIGS,
        );
        expect(results.every(r => r.status === 'pass')).toBe(true);
    });

    it('detects service count mismatch', () => {
        const staging = STAGING_SERVICE_CONFIGS.slice(0, 2);
        const results = checkStagingParity(staging, STAGING_SERVICE_CONFIGS);
        const countCheck = results.find(r => r.category === 'service-count');
        expect(countCheck?.status).toBe('fail');
    });

    it('detects missing service in staging', () => {
        const staging: StagingServiceConfig[] = [
            {
                service: 'api',
                image: 'patchwork-api',
                port: 4000,
                replicas: 1,
                envKeys: ['NODE_ENV'],
            },
        ];
        const production: StagingServiceConfig[] = [
            {
                service: 'api',
                image: 'patchwork-api',
                port: 4000,
                replicas: 1,
                envKeys: ['NODE_ENV'],
            },
            {
                service: 'indexer',
                image: 'patchwork-spool',
                port: 4100,
                replicas: 1,
                envKeys: ['NODE_ENV'],
            },
        ];
        const results = checkStagingParity(staging, production);
        const envCheck = results.find(
            r =>
                r.category === 'env-vars' &&
                r.message.includes('indexer'),
        );
        expect(envCheck?.status).toBe('fail');
    });

    it('detects missing env keys in staging service', () => {
        const staging: StagingServiceConfig[] = [
            {
                service: 'api',
                image: 'patchwork-api',
                port: 4000,
                replicas: 1,
                envKeys: ['NODE_ENV'],
            },
        ];
        const production: StagingServiceConfig[] = [
            {
                service: 'api',
                image: 'patchwork-api',
                port: 4000,
                replicas: 1,
                envKeys: ['NODE_ENV', 'API_DATABASE_URL'],
            },
        ];
        const results = checkStagingParity(staging, production);
        const envCheck = results.find(
            r =>
                r.category === 'env-vars' &&
                r.message.includes('API_DATABASE_URL'),
        );
        expect(envCheck?.status).toBe('fail');
    });
});

describe('isStagingParityValid', () => {
    it('returns true when all checks pass', () => {
        expect(
            isStagingParityValid([
                { category: 'service-count', status: 'pass', message: 'ok' },
                { category: 'env-vars', status: 'pass', message: 'ok' },
            ]),
        ).toBe(true);
    });

    it('returns false when any check fails', () => {
        expect(
            isStagingParityValid([
                { category: 'service-count', status: 'pass', message: 'ok' },
                { category: 'env-vars', status: 'fail', message: 'missing keys' },
            ]),
        ).toBe(false);
    });

    it('returns true when checks have warnings but no failures', () => {
        expect(
            isStagingParityValid([
                { category: 'service-count', status: 'pass', message: 'ok' },
                { category: 'resource-limits', status: 'warn', message: 'no limits set' },
            ]),
        ).toBe(true);
    });
});

describe('evaluatePromotionGate', () => {
    const passingParity = [
        { category: 'service-count' as const, status: 'pass' as const, message: 'ok' },
    ];
    const failingParity = [
        { category: 'service-count' as const, status: 'fail' as const, message: 'mismatch' },
    ];

    const passingSmoke: SmokeCheckResult[] = [
        {
            service: 'api',
            endpoint: '/health',
            status: 'pass',
            httpStatus: 200,
            latencyMs: 50,
            message: 'healthy',
        },
    ];
    const failingSmoke: SmokeCheckResult[] = [
        {
            service: 'api',
            endpoint: '/health',
            status: 'fail',
            httpStatus: 503,
            latencyMs: 5000,
            message: 'not ready',
        },
    ];

    it('allows promotion when parity and smoke checks pass', () => {
        const result = evaluatePromotionGate(passingParity, passingSmoke);
        expect(result.allowed).toBe(true);
        expect(result.blockReason).toBeUndefined();
    });

    it('blocks promotion when parity check fails', () => {
        const result = evaluatePromotionGate(failingParity, passingSmoke);
        expect(result.allowed).toBe(false);
        expect(result.blockReason).toContain('staging parity check failed');
    });

    it('blocks promotion when smoke check fails', () => {
        const result = evaluatePromotionGate(passingParity, failingSmoke);
        expect(result.allowed).toBe(false);
        expect(result.blockReason).toContain('smoke check failed');
    });

    it('blocks with both reasons when both fail', () => {
        const result = evaluatePromotionGate(failingParity, failingSmoke);
        expect(result.allowed).toBe(false);
        expect(result.blockReason).toContain('staging parity check failed');
        expect(result.blockReason).toContain('smoke check failed');
    });

    it('includes evaluatedAt timestamp', () => {
        const result = evaluatePromotionGate(passingParity, passingSmoke);
        expect(result.evaluatedAt).toBeTruthy();
        expect(() => new Date(result.evaluatedAt)).not.toThrow();
    });
});

describe('DEFAULT_STAGING_OWNERSHIP', () => {
    it('has all required ownership fields', () => {
        expect(DEFAULT_STAGING_OWNERSHIP.ownerTeam).toBe('INFRA');
        expect(DEFAULT_STAGING_OWNERSHIP.primaryContact).toBeTruthy();
        expect(DEFAULT_STAGING_OWNERSHIP.escalationContact).toBeTruthy();
        expect(DEFAULT_STAGING_OWNERSHIP.deploymentPipeline).toBeTruthy();
    });
});
