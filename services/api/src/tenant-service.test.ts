import { describe, expect, it, beforeEach } from 'vitest';
import { TenantService, createTenantService } from './tenant-service.js';
import type {
    FailoverConfig,
    PolicyOverride,
    Region,
    RegionHealthStatus,
    RegionRoutingDecision,
    RoutingPolicy,
    Tenant,
} from '@patchwork/shared';

const TENANT_ID = 'tenant-001';
const ORG_DID = 'did:example:org-1';
const TENANT_NAME = 'Test Aid Network';

const createTestTenant = (service: TenantService, overrides?: Partial<{
    tenantId: string;
    primaryRegion: Region;
    allowedRegions: Region[];
    dataResidency: 'region-locked' | 'region-preferred' | 'global';
    failoverMode: 'automatic' | 'manual' | 'disabled';
}>): string => {
    const result = service.createTenant({
        tenantId: overrides?.tenantId ?? TENANT_ID,
        orgDid: ORG_DID,
        name: TENANT_NAME,
        primaryRegion: overrides?.primaryRegion ?? 'us-east',
        allowedRegions: overrides?.allowedRegions ?? ['us-east', 'us-west', 'eu-west'],
        dataResidency: overrides?.dataResidency ?? 'region-preferred',
        failoverMode: overrides?.failoverMode ?? 'automatic',
    });
    const body = result.body as { tenant: Tenant };
    return body.tenant.tenantId;
};

describe('TenantService', () => {
    let service: TenantService;

    beforeEach(() => {
        service = createTenantService();
    });

    // -------------------------------------------------------------------
    // Tenant CRUD
    // -------------------------------------------------------------------

    describe('createTenant', () => {
        it('creates a tenant with default routing policy', () => {
            const result = service.createTenant({
                tenantId: TENANT_ID,
                orgDid: ORG_DID,
                name: TENANT_NAME,
                primaryRegion: 'us-east',
                allowedRegions: ['us-east', 'us-west'],
                dataResidency: 'region-preferred',
                failoverMode: 'automatic',
            });

            expect(result.statusCode).toBe(201);
            const body = result.body as { tenant: Tenant };
            expect(body.tenant.tenantId).toBe(TENANT_ID);
            expect(body.tenant.status).toBe('active');
            expect(body.tenant.primaryRegion).toBe('us-east');
        });

        it('rejects creation with missing fields', () => {
            const result = service.createTenant({
                tenantId: '',
                orgDid: ORG_DID,
                name: TENANT_NAME,
                primaryRegion: 'us-east',
                allowedRegions: ['us-east'],
                dataResidency: 'global',
                failoverMode: 'disabled',
            });
            expect(result.statusCode).toBe(400);
        });

        it('rejects duplicate tenant', () => {
            createTestTenant(service);
            const result = service.createTenant({
                tenantId: TENANT_ID,
                orgDid: ORG_DID,
                name: TENANT_NAME,
                primaryRegion: 'us-east',
                allowedRegions: ['us-east'],
                dataResidency: 'global',
                failoverMode: 'disabled',
            });
            expect(result.statusCode).toBe(409);
        });

        it('automatically creates routing policy for new tenant', () => {
            createTestTenant(service);
            const result = service.getRoutingPolicy(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { policy: RoutingPolicy };
            expect(body.policy.primaryRegion).toBe('us-east');
            expect(body.policy.endpoints.length).toBeGreaterThan(0);
        });
    });

    describe('getTenant', () => {
        it('returns the tenant', () => {
            createTestTenant(service);
            const result = service.getTenant(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { tenant: Tenant };
            expect(body.tenant.name).toBe(TENANT_NAME);
        });

        it('returns 404 for unknown tenant', () => {
            const result = service.getTenant('no-such-tenant');
            expect(result.statusCode).toBe(404);
        });

        it('returns 400 for empty tenantId', () => {
            const result = service.getTenant('');
            expect(result.statusCode).toBe(400);
        });
    });

    describe('updateTenantStatus', () => {
        it('updates tenant status', () => {
            createTestTenant(service);
            const result = service.updateTenantStatus(TENANT_ID, 'suspended');
            expect(result.statusCode).toBe(200);
            const body = result.body as { tenant: Tenant };
            expect(body.tenant.status).toBe('suspended');
        });

        it('returns 404 for unknown tenant', () => {
            const result = service.updateTenantStatus('nope', 'active');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Tenant boundary enforcement
    // -------------------------------------------------------------------

    describe('validateTenantBoundary', () => {
        it('passes for valid tenant and allowed region', () => {
            createTestTenant(service);
            const result = service.validateTenantBoundary(TENANT_ID, 'us-east');
            expect(result.valid).toBe(true);
            expect(result.code).toBe('OK');
        });

        it('fails for unknown tenant', () => {
            const result = service.validateTenantBoundary('nope', 'us-east');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TENANT_NOT_FOUND');
        });

        it('fails for suspended tenant', () => {
            createTestTenant(service);
            service.updateTenantStatus(TENANT_ID, 'suspended');
            const result = service.validateTenantBoundary(TENANT_ID, 'us-east');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TENANT_SUSPENDED');
        });

        it('fails for migrating tenant', () => {
            createTestTenant(service);
            service.updateTenantStatus(TENANT_ID, 'migrating');
            const result = service.validateTenantBoundary(TENANT_ID, 'us-east');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TENANT_MIGRATING');
        });

        it('fails for disallowed region', () => {
            createTestTenant(service, { allowedRegions: ['us-east'] });
            const result = service.validateTenantBoundary(TENANT_ID, 'ap-southeast');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('REGION_NOT_ALLOWED');
        });
    });

    // -------------------------------------------------------------------
    // Data residency validation
    // -------------------------------------------------------------------

    describe('validateDataResidency', () => {
        it('global policy allows any region', () => {
            createTestTenant(service, { dataResidency: 'global' });
            const result = service.validateDataResidency(TENANT_ID, 'ap-northeast');
            expect(result.valid).toBe(true);
        });

        it('region-locked rejects non-primary region', () => {
            createTestTenant(service, {
                dataResidency: 'region-locked',
                primaryRegion: 'us-east',
            });
            const result = service.validateDataResidency(TENANT_ID, 'us-west');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('DATA_RESIDENCY_VIOLATION');
        });

        it('region-locked accepts primary region', () => {
            createTestTenant(service, {
                dataResidency: 'region-locked',
                primaryRegion: 'us-east',
            });
            const result = service.validateDataResidency(TENANT_ID, 'us-east');
            expect(result.valid).toBe(true);
        });

        it('region-preferred rejects region outside allowed list', () => {
            createTestTenant(service, {
                dataResidency: 'region-preferred',
                allowedRegions: ['us-east', 'us-west'],
            });
            const result = service.validateDataResidency(TENANT_ID, 'ap-southeast');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('DATA_RESIDENCY_VIOLATION');
        });

        it('region-preferred accepts allowed region', () => {
            createTestTenant(service, {
                dataResidency: 'region-preferred',
                allowedRegions: ['us-east', 'us-west'],
            });
            const result = service.validateDataResidency(TENANT_ID, 'us-west');
            expect(result.valid).toBe(true);
        });

        it('returns TENANT_NOT_FOUND for unknown tenant', () => {
            const result = service.validateDataResidency('nope', 'us-east');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TENANT_NOT_FOUND');
        });
    });

    // -------------------------------------------------------------------
    // Region-aware routing
    // -------------------------------------------------------------------

    describe('resolveRoute', () => {
        it('routes to primary region by default', () => {
            createTestTenant(service);
            const result = service.resolveRoute(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { routing: RegionRoutingDecision };
            expect(body.routing.selectedRegion).toBe('us-east');
            expect(body.routing.reason).toBe('primary');
        });

        it('returns 404 for unknown tenant', () => {
            const result = service.resolveRoute('nope');
            expect(result.statusCode).toBe(404);
        });

        it('uses nearest-region strategy when configured', () => {
            createTestTenant(service);
            service.updateRoutingStrategy(TENANT_ID, 'nearest-region');

            const result = service.resolveRoute(TENANT_ID, 'us-west');
            expect(result.statusCode).toBe(200);
            const body = result.body as { routing: RegionRoutingDecision };
            expect(body.routing.selectedRegion).toBe('us-west');
            expect(body.routing.reason).toBe('nearest');
        });

        it('falls back when nearest region is unhealthy', () => {
            createTestTenant(service);
            service.updateRoutingStrategy(TENANT_ID, 'nearest-region');
            service.updateRegionHealth(TENANT_ID, 'us-west', false, 0, 'down');

            const result = service.resolveRoute(TENANT_ID, 'us-west');
            expect(result.statusCode).toBe(200);
            const body = result.body as { routing: RegionRoutingDecision };
            expect(body.routing.selectedRegion).not.toBe('us-west');
            expect(body.routing.reason).toBe('fallback');
        });

        it('uses weighted strategy to select highest-weight endpoint', () => {
            createTestTenant(service);
            service.updateRoutingStrategy(TENANT_ID, 'weighted-round-robin');

            const result = service.resolveRoute(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { routing: RegionRoutingDecision };
            expect(body.routing.selectedRegion).toBe('us-east'); // weight 100
            expect(body.routing.reason).toBe('weighted');
        });

        it('failover-chain falls to secondary when primary is down', () => {
            createTestTenant(service);
            // Default strategy for automatic failover is failover-chain
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0, 'down');

            const result = service.resolveRoute(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { routing: RegionRoutingDecision };
            expect(body.routing.selectedRegion).toBe('us-west');
            expect(body.routing.reason).toBe('failover');
            expect(body.routing.failoverAttempt).toBe(1);
        });

        it('returns 503 when all regions are unhealthy', () => {
            createTestTenant(service, { allowedRegions: ['us-east', 'us-west'] });
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);
            service.updateRegionHealth(TENANT_ID, 'us-west', false, 0);

            const result = service.resolveRoute(TENANT_ID);
            expect(result.statusCode).toBe(503);
        });
    });

    // -------------------------------------------------------------------
    // Failover management
    // -------------------------------------------------------------------

    describe('failover management', () => {
        it('records health check updates', () => {
            createTestTenant(service);
            const result = service.updateRegionHealth(TENANT_ID, 'us-east', true, 45);
            expect(result.statusCode).toBe(200);
            const body = result.body as { health: RegionHealthStatus };
            expect(body.health.isHealthy).toBe(true);
            expect(body.health.latencyMs).toBe(45);
        });

        it('tracks consecutive failures', () => {
            createTestTenant(service);
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0, 'timeout');
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0, 'timeout');

            const result = service.getRegionHealth(TENANT_ID, 'us-east');
            expect(result.statusCode).toBe(200);
            const body = result.body as { health: RegionHealthStatus };
            expect(body.health.consecutiveFailures).toBe(2);
        });

        it('resets consecutive failures on healthy check', () => {
            createTestTenant(service);
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);
            service.updateRegionHealth(TENANT_ID, 'us-east', true, 30);

            const result = service.getRegionHealth(TENANT_ID, 'us-east');
            const body = result.body as { health: RegionHealthStatus };
            expect(body.health.consecutiveFailures).toBe(0);
        });

        it('automatic failover triggers after threshold', () => {
            createTestTenant(service);
            service.setFailoverConfig({
                tenantId: TENANT_ID,
                mode: 'automatic',
                healthCheckIntervalMs: 30_000,
                unhealthyThreshold: 3,
                healthyThreshold: 2,
                failoverChain: ['us-west', 'eu-west'],
                maxFailoverAttempts: 3,
            });

            // Trigger threshold (3 consecutive failures)
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);

            const eventsResult = service.getFailoverEvents(TENANT_ID);
            const eventsBody = eventsResult.body as { events: Array<{ eventType: string }> };
            const initiated = eventsBody.events.filter(e => e.eventType === 'failover_initiated');
            expect(initiated.length).toBeGreaterThan(0);
        });

        it('getAllRegionHealth returns health for all tenant regions', () => {
            createTestTenant(service);
            const result = service.getAllRegionHealth(TENANT_ID);
            expect(result.statusCode).toBe(200);
            const body = result.body as { health: RegionHealthStatus[] };
            expect(body.health.length).toBe(3); // us-east, us-west, eu-west
        });

        it('returns 404 for unknown tenant health', () => {
            const result = service.getRegionHealth('nope', 'us-east');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Failover configuration
    // -------------------------------------------------------------------

    describe('failover configuration', () => {
        it('sets and retrieves failover config', () => {
            createTestTenant(service);
            const config: FailoverConfig = {
                tenantId: TENANT_ID,
                mode: 'automatic',
                healthCheckIntervalMs: 30_000,
                unhealthyThreshold: 3,
                healthyThreshold: 2,
                failoverChain: ['us-west'],
                maxFailoverAttempts: 3,
            };

            const setResult = service.setFailoverConfig(config);
            expect(setResult.statusCode).toBe(200);

            const getResult = service.getFailoverConfig(TENANT_ID);
            expect(getResult.statusCode).toBe(200);
            const body = getResult.body as { config: FailoverConfig };
            expect(body.config.mode).toBe('automatic');
        });

        it('returns 404 for unknown tenant config', () => {
            const result = service.getFailoverConfig('nope');
            expect(result.statusCode).toBe(404);
        });

        it('returns 404 when setting config for unknown tenant', () => {
            const result = service.setFailoverConfig({
                tenantId: 'nope',
                mode: 'automatic',
                healthCheckIntervalMs: 30_000,
                unhealthyThreshold: 3,
                healthyThreshold: 2,
                failoverChain: ['us-west'],
                maxFailoverAttempts: 3,
            });
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Policy overrides
    // -------------------------------------------------------------------

    describe('policy overrides', () => {
        it('adds and resolves a policy override', () => {
            createTestTenant(service);
            const override: PolicyOverride = {
                overrideId: 'override-001',
                tenantId: TENANT_ID,
                region: 'eu-west',
                scope: 'compliance',
                key: 'data-retention-days',
                value: 90,
                reason: 'GDPR compliance',
                createdAt: new Date().toISOString(),
            };

            const addResult = service.addPolicyOverride(override);
            expect(addResult.statusCode).toBe(200);

            const resolveResult = service.resolvePolicyOverrides(TENANT_ID, 'eu-west');
            expect(resolveResult.statusCode).toBe(200);
            const body = resolveResult.body as { overrides: PolicyOverride[] };
            expect(body.overrides).toHaveLength(1);
            expect(body.overrides[0]!.key).toBe('data-retention-days');
        });

        it('filters overrides by scope', () => {
            createTestTenant(service);
            service.addPolicyOverride({
                overrideId: 'o-1',
                tenantId: TENANT_ID,
                region: 'eu-west',
                scope: 'compliance',
                key: 'retention',
                value: 90,
                reason: 'GDPR',
                createdAt: new Date().toISOString(),
            });
            service.addPolicyOverride({
                overrideId: 'o-2',
                tenantId: TENANT_ID,
                region: 'eu-west',
                scope: 'rate-limit',
                key: 'max-rps',
                value: 100,
                reason: 'Regional rate limit',
                createdAt: new Date().toISOString(),
            });

            const result = service.resolvePolicyOverrides(TENANT_ID, 'eu-west', 'compliance');
            const body = result.body as { overrides: PolicyOverride[] };
            expect(body.overrides).toHaveLength(1);
            expect(body.overrides[0]!.scope).toBe('compliance');
        });

        it('excludes expired overrides', () => {
            createTestTenant(service);
            service.addPolicyOverride({
                overrideId: 'o-expired',
                tenantId: TENANT_ID,
                region: 'eu-west',
                scope: 'feature-flag',
                key: 'beta-feature',
                value: true,
                reason: 'Beta test (expired)',
                createdAt: '2020-01-01T00:00:00.000Z',
                expiresAt: '2020-12-31T00:00:00.000Z',
            });

            const result = service.resolvePolicyOverrides(TENANT_ID, 'eu-west');
            const body = result.body as { overrides: PolicyOverride[] };
            expect(body.overrides).toHaveLength(0);
        });

        it('removes a policy override', () => {
            createTestTenant(service);
            service.addPolicyOverride({
                overrideId: 'o-remove',
                tenantId: TENANT_ID,
                region: 'us-east',
                scope: 'moderation',
                key: 'auto-flag',
                value: true,
                reason: 'Testing',
                createdAt: new Date().toISOString(),
            });

            const removeResult = service.removePolicyOverride(TENANT_ID, 'o-remove');
            expect(removeResult.statusCode).toBe(200);

            const resolveResult = service.resolvePolicyOverrides(TENANT_ID, 'us-east');
            const body = resolveResult.body as { overrides: PolicyOverride[] };
            expect(body.overrides).toHaveLength(0);
        });

        it('returns 404 when removing nonexistent override', () => {
            createTestTenant(service);
            const result = service.removePolicyOverride(TENANT_ID, 'nope');
            expect(result.statusCode).toBe(404);
        });

        it('rejects override for disallowed region', () => {
            createTestTenant(service, { allowedRegions: ['us-east'] });
            const result = service.addPolicyOverride({
                overrideId: 'o-bad',
                tenantId: TENANT_ID,
                region: 'ap-southeast',
                scope: 'compliance',
                key: 'test',
                value: true,
                reason: 'Testing',
                createdAt: new Date().toISOString(),
            });
            expect(result.statusCode).toBe(400);
        });

        it('returns 404 for override on unknown tenant', () => {
            const result = service.addPolicyOverride({
                overrideId: 'o-1',
                tenantId: 'nope',
                region: 'us-east',
                scope: 'compliance',
                key: 'test',
                value: true,
                reason: 'Testing',
                createdAt: new Date().toISOString(),
            });
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Routing policy management
    // -------------------------------------------------------------------

    describe('routing policy', () => {
        it('updates routing strategy', () => {
            createTestTenant(service);
            const result = service.updateRoutingStrategy(TENANT_ID, 'nearest-region');
            expect(result.statusCode).toBe(200);
            const body = result.body as { policy: RoutingPolicy };
            expect(body.policy.strategy).toBe('nearest-region');
        });

        it('returns 404 for unknown tenant policy', () => {
            const result = service.getRoutingPolicy('nope');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Full lifecycle
    // -------------------------------------------------------------------

    describe('full tenant lifecycle', () => {
        it('creates tenant, validates boundaries, routes, fails over, overrides policy', () => {
            // 1. Create tenant
            createTestTenant(service, {
                allowedRegions: ['us-east', 'us-west', 'eu-west'],
                failoverMode: 'automatic',
            });

            // 2. Validate boundary passes for allowed region
            const boundaryOk = service.validateTenantBoundary(TENANT_ID, 'us-east');
            expect(boundaryOk.valid).toBe(true);

            // 3. Validate boundary fails for disallowed region
            const boundaryBad = service.validateTenantBoundary(TENANT_ID, 'ap-northeast');
            expect(boundaryBad.valid).toBe(false);

            // 4. Route to primary
            const routeResult = service.resolveRoute(TENANT_ID);
            expect(routeResult.statusCode).toBe(200);
            const routeBody = routeResult.body as { routing: RegionRoutingDecision };
            expect(routeBody.routing.selectedRegion).toBe('us-east');

            // 5. Simulate primary going down
            service.updateRegionHealth(TENANT_ID, 'us-east', false, 0);

            // 6. Route should failover
            const failoverRoute = service.resolveRoute(TENANT_ID);
            expect(failoverRoute.statusCode).toBe(200);
            const failoverBody = failoverRoute.body as { routing: RegionRoutingDecision };
            expect(failoverBody.routing.selectedRegion).toBe('us-west');

            // 7. Add policy override for EU region
            service.addPolicyOverride({
                overrideId: 'gdpr-1',
                tenantId: TENANT_ID,
                region: 'eu-west',
                scope: 'compliance',
                key: 'data-retention-days',
                value: 30,
                reason: 'GDPR compliance',
                createdAt: new Date().toISOString(),
            });

            // 8. Resolve overrides
            const overrides = service.resolvePolicyOverrides(TENANT_ID, 'eu-west', 'compliance');
            const overrideBody = overrides.body as { overrides: PolicyOverride[] };
            expect(overrideBody.overrides).toHaveLength(1);

            // 9. Validate data residency
            const residencyOk = service.validateDataResidency(TENANT_ID, 'us-west');
            expect(residencyOk.valid).toBe(true);

            // 10. Suspend tenant
            service.updateTenantStatus(TENANT_ID, 'suspended');
            const boundaryAfterSuspend = service.validateTenantBoundary(TENANT_ID, 'us-east');
            expect(boundaryAfterSuspend.valid).toBe(false);
            expect(boundaryAfterSuspend.code).toBe('TENANT_SUSPENDED');
        });
    });
});
