import { describe, expect, it } from 'vitest';
import {
    DATA_RESIDENCY_POLICIES,
    FAILOVER_EVENT_TYPES,
    FAILOVER_MODES,
    POLICY_OVERRIDE_SCOPES,
    REGIONS,
    ROUTING_STRATEGIES,
    TENANT_STATUSES,
    failoverConfigSchema,
    isValidRegion,
    multiRegionContractStubs,
    policyOverrideSchema,
    regionEndpointSchema,
    routingPolicySchema,
    tenantSchema,
    type FailoverEvent,
    type RegionHealthStatus,
    type RegionRoutingDecision,
    type TenantBoundaryValidation,
    type CrossRegionRequest,
} from './multi-region.js';

describe('Multi-region contracts', () => {
    // -------------------------------------------------------------------
    // Region definitions
    // -------------------------------------------------------------------

    describe('region definitions', () => {
        it('defines all expected regions', () => {
            expect(REGIONS).toEqual([
                'us-east',
                'us-west',
                'eu-west',
                'eu-central',
                'ap-southeast',
                'ap-northeast',
            ]);
        });

        it('isValidRegion returns true for valid regions', () => {
            for (const region of REGIONS) {
                expect(isValidRegion(region)).toBe(true);
            }
        });

        it('isValidRegion returns false for invalid regions', () => {
            expect(isValidRegion('mars-central')).toBe(false);
            expect(isValidRegion('')).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Enum constants
    // -------------------------------------------------------------------

    describe('enum constants', () => {
        it('DATA_RESIDENCY_POLICIES has correct values', () => {
            expect(DATA_RESIDENCY_POLICIES).toEqual([
                'region-locked',
                'region-preferred',
                'global',
            ]);
        });

        it('TENANT_STATUSES has correct values', () => {
            expect(TENANT_STATUSES).toEqual([
                'active',
                'suspended',
                'migrating',
                'deprovisioned',
            ]);
        });

        it('FAILOVER_MODES has correct values', () => {
            expect(FAILOVER_MODES).toEqual([
                'automatic',
                'manual',
                'disabled',
            ]);
        });

        it('ROUTING_STRATEGIES has correct values', () => {
            expect(ROUTING_STRATEGIES).toEqual([
                'primary-only',
                'nearest-region',
                'weighted-round-robin',
                'failover-chain',
            ]);
        });

        it('FAILOVER_EVENT_TYPES has correct values', () => {
            expect(FAILOVER_EVENT_TYPES).toContain('failover_initiated');
            expect(FAILOVER_EVENT_TYPES).toContain('failover_completed');
            expect(FAILOVER_EVENT_TYPES).toContain('health_check_failed');
        });

        it('POLICY_OVERRIDE_SCOPES has correct values', () => {
            expect(POLICY_OVERRIDE_SCOPES).toContain('rate-limit');
            expect(POLICY_OVERRIDE_SCOPES).toContain('compliance');
            expect(POLICY_OVERRIDE_SCOPES).toContain('feature-flag');
        });
    });

    // -------------------------------------------------------------------
    // Tenant schema validation
    // -------------------------------------------------------------------

    describe('tenantSchema', () => {
        it('validates the contract stub', () => {
            const result = tenantSchema.safeParse(multiRegionContractStubs.tenant);
            expect(result.success).toBe(true);
        });

        it('rejects a tenant with empty tenantId', () => {
            const result = tenantSchema.safeParse({
                ...multiRegionContractStubs.tenant,
                tenantId: '',
            });
            expect(result.success).toBe(false);
        });

        it('rejects a tenant with invalid region', () => {
            const result = tenantSchema.safeParse({
                ...multiRegionContractStubs.tenant,
                primaryRegion: 'mars-1',
            });
            expect(result.success).toBe(false);
        });

        it('rejects a tenant with invalid orgDid', () => {
            const result = tenantSchema.safeParse({
                ...multiRegionContractStubs.tenant,
                orgDid: 'not-a-did',
            });
            expect(result.success).toBe(false);
        });

        it('rejects a tenant with empty allowedRegions', () => {
            const result = tenantSchema.safeParse({
                ...multiRegionContractStubs.tenant,
                allowedRegions: [],
            });
            expect(result.success).toBe(false);
        });

        it('accepts all valid tenant statuses', () => {
            for (const status of TENANT_STATUSES) {
                const result = tenantSchema.safeParse({
                    ...multiRegionContractStubs.tenant,
                    status,
                });
                expect(result.success).toBe(true);
            }
        });
    });

    // -------------------------------------------------------------------
    // Region endpoint schema
    // -------------------------------------------------------------------

    describe('regionEndpointSchema', () => {
        it('validates the contract stub endpoint', () => {
            const endpoint = multiRegionContractStubs.routingPolicy.endpoints[0]!;
            const result = regionEndpointSchema.safeParse(endpoint);
            expect(result.success).toBe(true);
        });

        it('rejects endpoint with invalid URL', () => {
            const result = regionEndpointSchema.safeParse({
                region: 'us-east',
                apiUrl: 'not-a-url',
                healthUrl: 'https://example.com/health',
                weight: 100,
                isActive: true,
            });
            expect(result.success).toBe(false);
        });

        it('rejects endpoint with weight out of range', () => {
            const result = regionEndpointSchema.safeParse({
                region: 'us-east',
                apiUrl: 'https://example.com',
                healthUrl: 'https://example.com/health',
                weight: 150,
                isActive: true,
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Routing policy schema
    // -------------------------------------------------------------------

    describe('routingPolicySchema', () => {
        it('validates the contract stub', () => {
            const result = routingPolicySchema.safeParse(
                multiRegionContractStubs.routingPolicy,
            );
            expect(result.success).toBe(true);
        });

        it('rejects policy with invalid strategy', () => {
            const result = routingPolicySchema.safeParse({
                ...multiRegionContractStubs.routingPolicy,
                strategy: 'random',
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Failover config schema
    // -------------------------------------------------------------------

    describe('failoverConfigSchema', () => {
        it('validates the contract stub', () => {
            const result = failoverConfigSchema.safeParse(
                multiRegionContractStubs.failoverConfig,
            );
            expect(result.success).toBe(true);
        });

        it('rejects config with healthCheckIntervalMs too low', () => {
            const result = failoverConfigSchema.safeParse({
                ...multiRegionContractStubs.failoverConfig,
                healthCheckIntervalMs: 100,
            });
            expect(result.success).toBe(false);
        });

        it('rejects config with empty failoverChain', () => {
            const result = failoverConfigSchema.safeParse({
                ...multiRegionContractStubs.failoverConfig,
                failoverChain: [],
            });
            expect(result.success).toBe(false);
        });

        it('rejects config with unhealthyThreshold out of range', () => {
            const result = failoverConfigSchema.safeParse({
                ...multiRegionContractStubs.failoverConfig,
                unhealthyThreshold: 20,
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Policy override schema
    // -------------------------------------------------------------------

    describe('policyOverrideSchema', () => {
        it('validates the contract stub', () => {
            const result = policyOverrideSchema.safeParse(
                multiRegionContractStubs.policyOverride,
            );
            expect(result.success).toBe(true);
        });

        it('rejects override with invalid scope', () => {
            const result = policyOverrideSchema.safeParse({
                ...multiRegionContractStubs.policyOverride,
                scope: 'unknown-scope',
            });
            expect(result.success).toBe(false);
        });

        it('rejects override with reason exceeding max length', () => {
            const result = policyOverrideSchema.safeParse({
                ...multiRegionContractStubs.policyOverride,
                reason: 'x'.repeat(501),
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Interface type checks (structural)
    // -------------------------------------------------------------------

    describe('interface types', () => {
        it('RegionRoutingDecision satisfies expected shape', () => {
            const decision: RegionRoutingDecision = {
                tenantId: 'tenant-001',
                selectedRegion: 'us-east',
                endpoint: multiRegionContractStubs.routingPolicy.endpoints[0]!,
                reason: 'primary',
                failoverAttempt: 0,
            };
            expect(decision.tenantId).toBe('tenant-001');
            expect(decision.reason).toBe('primary');
        });

        it('FailoverEvent satisfies expected shape', () => {
            const event: FailoverEvent = {
                eventId: 'evt-001',
                tenantId: 'tenant-001',
                eventType: 'failover_initiated',
                fromRegion: 'us-east',
                toRegion: 'us-west',
                reason: 'Primary region health check failed',
                timestamp: new Date().toISOString(),
            };
            expect(event.eventType).toBe('failover_initiated');
            expect(event.fromRegion).toBe('us-east');
        });

        it('RegionHealthStatus satisfies expected shape', () => {
            const health: RegionHealthStatus = {
                region: 'us-east',
                isHealthy: true,
                consecutiveFailures: 0,
                lastCheckAt: new Date().toISOString(),
                latencyMs: 45,
            };
            expect(health.isHealthy).toBe(true);
            expect(health.latencyMs).toBe(45);
        });

        it('TenantBoundaryValidation satisfies expected shape', () => {
            const ok: TenantBoundaryValidation = {
                valid: true,
                code: 'OK',
                message: 'Tenant boundary check passed.',
            };
            expect(ok.valid).toBe(true);

            const rejected: TenantBoundaryValidation = {
                valid: false,
                code: 'REGION_NOT_ALLOWED',
                message: 'Request region not in tenant allowed regions.',
            };
            expect(rejected.valid).toBe(false);
            expect(rejected.code).toBe('REGION_NOT_ALLOWED');
        });

        it('CrossRegionRequest satisfies expected shape', () => {
            const request: CrossRegionRequest = {
                tenantId: 'tenant-001',
                sourceRegion: 'us-east',
                targetRegion: 'us-west',
                requestId: 'req-001',
                payload: { action: 'sync' },
                timestamp: new Date().toISOString(),
            };
            expect(request.sourceRegion).toBe('us-east');
            expect(request.targetRegion).toBe('us-west');
        });
    });

    // -------------------------------------------------------------------
    // Contract stubs
    // -------------------------------------------------------------------

    describe('multiRegionContractStubs', () => {
        it('tenant stub has valid orgDid', () => {
            expect(multiRegionContractStubs.tenant.orgDid).toMatch(/^did:/);
        });

        it('routing policy stub has at least one endpoint', () => {
            expect(multiRegionContractStubs.routingPolicy.endpoints.length).toBeGreaterThan(0);
        });

        it('failover config stub has non-empty failover chain', () => {
            expect(multiRegionContractStubs.failoverConfig.failoverChain.length).toBeGreaterThan(0);
        });

        it('policy override stub references a valid region', () => {
            expect(isValidRegion(multiRegionContractStubs.policyOverride.region)).toBe(true);
        });
    });
});
