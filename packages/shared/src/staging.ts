/**
 * Staging environment parity contracts (#108).
 *
 * Defines the staging environment configuration, parity checks, and
 * promotion gate types so all services share a consistent model for
 * staging-to-production promotion.
 */

import type { PatchworkService } from './sli.js';

// ---------------------------------------------------------------------------
// Environment types
// ---------------------------------------------------------------------------

/** Canonical deployment environment names. */
export type DeploymentEnvironment = 'development' | 'staging' | 'production';

/** All valid environment values. */
export const DEPLOYMENT_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
    'development',
    'staging',
    'production',
] as const;

// ---------------------------------------------------------------------------
// Staging service topology
// ---------------------------------------------------------------------------

/** Mirrors production service topology so staging has full parity. */
export interface StagingServiceConfig {
    /** Which service this config applies to. */
    service: PatchworkService;
    /** Docker image reference (registry/repo:tag). */
    image: string;
    /** Container port the service listens on. */
    port: number;
    /** Replica count (staging should match production). */
    replicas: number;
    /** Environment variables (keys only -- values come from secrets). */
    envKeys: readonly string[];
}

/** Default staging topology -- mirrors production 1:1. */
export const STAGING_SERVICE_CONFIGS: readonly StagingServiceConfig[] = [
    {
        service: 'api',
        image: 'patchwork-api',
        port: 4000,
        replicas: 1,
        envKeys: [
            'NODE_ENV',
            'LOG_LEVEL',
            'ATPROTO_SERVICE_DID',
            'ATPROTO_PDS_URL',
            'API_HOST',
            'API_PORT',
            'API_PUBLIC_ORIGIN',
            'API_DATA_SOURCE',
            'API_DATABASE_URL',
        ],
    },
    {
        service: 'indexer',
        image: 'patchwork-spool',
        port: 4100,
        replicas: 1,
        envKeys: [
            'NODE_ENV',
            'LOG_LEVEL',
            'ATPROTO_SERVICE_DID',
            'ATPROTO_PDS_URL',
            'INDEXER_PORT',
            'INDEXER_FIREHOSE_URL',
        ],
    },
    {
        service: 'moderation-worker',
        image: 'patchwork-thimble',
        port: 4200,
        replicas: 1,
        envKeys: [
            'NODE_ENV',
            'LOG_LEVEL',
            'ATPROTO_SERVICE_DID',
            'ATPROTO_PDS_URL',
            'MODERATION_PORT',
            'MODERATION_WORKER_CONCURRENCY',
        ],
    },
] as const;

// ---------------------------------------------------------------------------
// Parity check
// ---------------------------------------------------------------------------

export type ParityCategory =
    | 'service-count'
    | 'network-topology'
    | 'env-vars'
    | 'resource-limits'
    | 'health-checks'
    | 'database-schema';

export type ParityStatus = 'pass' | 'fail' | 'warn';

export interface ParityCheckResult {
    category: ParityCategory;
    status: ParityStatus;
    message: string;
}

/**
 * Run a structural parity check between staging and production configs.
 * Returns an array of results. Promotion should be blocked if any result
 * has status === 'fail'.
 */
export const checkStagingParity = (
    staging: readonly StagingServiceConfig[],
    production: readonly StagingServiceConfig[],
): ParityCheckResult[] => {
    const results: ParityCheckResult[] = [];

    // Service count parity
    if (staging.length !== production.length) {
        results.push({
            category: 'service-count',
            status: 'fail',
            message: `Staging has ${staging.length} services, production has ${production.length}.`,
        });
    } else {
        results.push({
            category: 'service-count',
            status: 'pass',
            message: `Both environments have ${staging.length} services.`,
        });
    }

    // Per-service env var parity
    for (const prodService of production) {
        const stagingService = staging.find(
            s => s.service === prodService.service,
        );
        if (!stagingService) {
            results.push({
                category: 'env-vars',
                status: 'fail',
                message: `Service "${prodService.service}" missing from staging.`,
            });
            continue;
        }

        const missingKeys = prodService.envKeys.filter(
            k => !stagingService.envKeys.includes(k),
        );
        if (missingKeys.length > 0) {
            results.push({
                category: 'env-vars',
                status: 'fail',
                message: `Service "${prodService.service}" staging missing env keys: ${missingKeys.join(', ')}.`,
            });
        } else {
            results.push({
                category: 'env-vars',
                status: 'pass',
                message: `Service "${prodService.service}" env keys match.`,
            });
        }
    }

    return results;
};

/**
 * Returns true if all parity checks pass (no 'fail' results).
 */
export const isStagingParityValid = (
    results: readonly ParityCheckResult[],
): boolean => results.every(r => r.status !== 'fail');

// ---------------------------------------------------------------------------
// Smoke check gate
// ---------------------------------------------------------------------------

export type SmokeCheckStatus = 'pass' | 'fail' | 'skip';

export interface SmokeCheckResult {
    /** Service that was checked. */
    service: PatchworkService;
    /** Which endpoint was probed. */
    endpoint: string;
    /** Outcome of the smoke check. */
    status: SmokeCheckStatus;
    /** HTTP status code if applicable. */
    httpStatus?: number;
    /** Latency in milliseconds. */
    latencyMs?: number;
    /** Human-readable detail. */
    message: string;
}

export interface PromotionGateResult {
    /** Whether the promotion gate allows proceeding. */
    allowed: boolean;
    /** Timestamp of the gate evaluation. */
    evaluatedAt: string;
    /** Parity check results. */
    parityChecks: readonly ParityCheckResult[];
    /** Smoke check results. */
    smokeChecks: readonly SmokeCheckResult[];
    /** Summary reason if blocked. */
    blockReason?: string;
}

/**
 * Evaluate whether a staging deployment is eligible for promotion to production.
 * Blocks if any parity check fails or any smoke check fails.
 */
export const evaluatePromotionGate = (
    parityChecks: readonly ParityCheckResult[],
    smokeChecks: readonly SmokeCheckResult[],
): PromotionGateResult => {
    const parityValid = isStagingParityValid(parityChecks);
    const smokeValid = smokeChecks.every(s => s.status !== 'fail');

    const reasons: string[] = [];
    if (!parityValid) reasons.push('staging parity check failed');
    if (!smokeValid) reasons.push('smoke check failed');

    return {
        allowed: parityValid && smokeValid,
        evaluatedAt: new Date().toISOString(),
        parityChecks,
        smokeChecks,
        blockReason: reasons.length > 0 ? reasons.join('; ') : undefined,
    };
};

// ---------------------------------------------------------------------------
// Staging ownership
// ---------------------------------------------------------------------------

export interface StagingOwnership {
    /** Team responsible for staging environment health. */
    ownerTeam: string;
    /** Primary on-call for staging issues. */
    primaryContact: string;
    /** Escalation contact. */
    escalationContact: string;
    /** Deployment pipeline that auto-deploys to staging. */
    deploymentPipeline: string;
}

export const DEFAULT_STAGING_OWNERSHIP: StagingOwnership = {
    ownerTeam: 'INFRA',
    primaryContact: 'infra-oncall@patchwork.community',
    escalationContact: 'eng-lead@patchwork.community',
    deploymentPipeline: 'ci.yml → deploy-staging job',
};
