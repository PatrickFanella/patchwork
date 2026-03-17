import type {
    DataResidencyPolicy,
    FailoverConfig,
    FailoverEvent,
    FailoverMode,
    PolicyOverride,
    PolicyOverrideScope,
    Region,
    RegionEndpoint,
    RegionHealthStatus,
    RegionRoutingDecision,
    RoutingPolicy,
    RoutingStrategy,
    Tenant,
    TenantBoundaryValidation,
    TenantStatus,
} from '@patchwork/shared';

/**
 * Valid region identifiers. Kept in sync with packages/shared/src/multi-region.ts REGIONS.
 */
const VALID_REGIONS: readonly string[] = [
    'us-east',
    'us-west',
    'eu-west',
    'eu-central',
    'ap-southeast',
    'ap-northeast',
];

// ---------------------------------------------------------------------------
// Result type (mirrors OrgPortalRouteResult pattern)
// ---------------------------------------------------------------------------

export interface TenantServiceResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// TenantService
// ---------------------------------------------------------------------------

/**
 * In-memory multi-region tenant service that manages tenant boundaries,
 * region-aware routing, data residency validation, failover logic, and
 * policy override resolution.
 */
export class TenantService {
    private readonly tenants = new Map<string, Tenant>();
    private readonly routingPolicies = new Map<string, RoutingPolicy>();
    private readonly failoverConfigs = new Map<string, FailoverConfig>();
    private readonly failoverEvents: FailoverEvent[] = [];
    private readonly policyOverrides = new Map<string, PolicyOverride[]>();
    private readonly regionHealth = new Map<string, RegionHealthStatus>();

    // -------------------------------------------------------------------
    // Tenant CRUD
    // -------------------------------------------------------------------

    createTenant(input: {
        tenantId: string;
        orgDid: string;
        name: string;
        primaryRegion: Region;
        allowedRegions: Region[];
        dataResidency: DataResidencyPolicy;
        failoverMode: FailoverMode;
        failoverTargetRegion?: Region;
    }): TenantServiceResult {
        if (!input.tenantId || !input.orgDid || !input.name) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: tenantId, orgDid, name.' } },
            };
        }

        if (!VALID_REGIONS.includes(input.primaryRegion)) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_REGION', message: `Invalid primary region: ${input.primaryRegion}` } },
            };
        }

        if (this.tenants.has(input.tenantId)) {
            return {
                statusCode: 409,
                body: { error: { code: 'TENANT_EXISTS', message: 'Tenant already exists.' } },
            };
        }

        const now = new Date().toISOString();
        const tenant: Tenant = {
            tenantId: input.tenantId,
            orgDid: input.orgDid,
            name: input.name,
            primaryRegion: input.primaryRegion,
            allowedRegions: input.allowedRegions.length > 0 ? input.allowedRegions : [input.primaryRegion],
            dataResidency: input.dataResidency,
            status: 'active',
            failoverMode: input.failoverMode,
            failoverTargetRegion: input.failoverTargetRegion,
            createdAt: now,
            updatedAt: now,
        };

        this.tenants.set(input.tenantId, tenant);

        // Initialize default routing policy
        const endpoints: RegionEndpoint[] = tenant.allowedRegions.map((region, index) => ({
            region,
            apiUrl: `https://${region}.api.patchwork.local`,
            healthUrl: `https://${region}.api.patchwork.local/health`,
            weight: region === tenant.primaryRegion ? 100 : 80 - index * 10,
            isActive: true,
        }));

        const routingPolicy: RoutingPolicy = {
            tenantId: input.tenantId,
            strategy: input.failoverMode === 'automatic' ? 'failover-chain' : 'primary-only',
            primaryRegion: input.primaryRegion,
            failoverChain: tenant.allowedRegions.filter(r => r !== input.primaryRegion),
            endpoints,
        };
        this.routingPolicies.set(input.tenantId, routingPolicy);

        // Initialize region health for all allowed regions
        for (const region of tenant.allowedRegions) {
            const key = `${input.tenantId}:${region}`;
            this.regionHealth.set(key, {
                region,
                isHealthy: true,
                consecutiveFailures: 0,
                lastCheckAt: now,
                latencyMs: 0,
            });
        }

        return { statusCode: 201, body: { tenant } };
    }

    getTenant(tenantId: string): TenantServiceResult {
        if (!tenantId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: tenantId.' } },
            };
        }

        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        return { statusCode: 200, body: { tenant } };
    }

    updateTenantStatus(tenantId: string, status: TenantStatus): TenantServiceResult {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        tenant.status = status;
        tenant.updatedAt = new Date().toISOString();

        return { statusCode: 200, body: { tenant } };
    }

    // -------------------------------------------------------------------
    // Tenant boundary enforcement
    // -------------------------------------------------------------------

    validateTenantBoundary(
        tenantId: string,
        requestRegion: Region,
    ): TenantBoundaryValidation {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                valid: false,
                code: 'TENANT_NOT_FOUND',
                message: 'Tenant not found.',
            };
        }

        if (tenant.status === 'suspended') {
            return {
                valid: false,
                code: 'TENANT_SUSPENDED',
                message: 'Tenant is suspended.',
            };
        }

        if (tenant.status === 'migrating') {
            return {
                valid: false,
                code: 'TENANT_MIGRATING',
                message: 'Tenant is currently migrating.',
            };
        }

        if (!tenant.allowedRegions.includes(requestRegion)) {
            return {
                valid: false,
                code: 'REGION_NOT_ALLOWED',
                message: `Region '${requestRegion}' is not in the tenant's allowed regions: [${tenant.allowedRegions.join(', ')}].`,
            };
        }

        return {
            valid: true,
            code: 'OK',
            message: 'Tenant boundary check passed.',
        };
    }

    // -------------------------------------------------------------------
    // Data residency validation
    // -------------------------------------------------------------------

    validateDataResidency(
        tenantId: string,
        targetRegion: Region,
    ): TenantBoundaryValidation {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                valid: false,
                code: 'TENANT_NOT_FOUND',
                message: 'Tenant not found.',
            };
        }

        if (tenant.dataResidency === 'global') {
            return {
                valid: true,
                code: 'OK',
                message: 'Global residency allows all regions.',
            };
        }

        if (tenant.dataResidency === 'region-locked') {
            if (targetRegion !== tenant.primaryRegion) {
                return {
                    valid: false,
                    code: 'DATA_RESIDENCY_VIOLATION',
                    message: `Data residency is region-locked to '${tenant.primaryRegion}'. Cannot store data in '${targetRegion}'.`,
                };
            }
        }

        if (tenant.dataResidency === 'region-preferred') {
            if (!tenant.allowedRegions.includes(targetRegion)) {
                return {
                    valid: false,
                    code: 'DATA_RESIDENCY_VIOLATION',
                    message: `Data residency prefers allowed regions. '${targetRegion}' is not in [${tenant.allowedRegions.join(', ')}].`,
                };
            }
        }

        return {
            valid: true,
            code: 'OK',
            message: 'Data residency check passed.',
        };
    }

    // -------------------------------------------------------------------
    // Region-aware routing
    // -------------------------------------------------------------------

    resolveRoute(
        tenantId: string,
        requestRegion?: Region,
    ): TenantServiceResult {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        const policy = this.routingPolicies.get(tenantId);
        if (!policy) {
            return {
                statusCode: 500,
                body: { error: { code: 'NO_ROUTING_POLICY', message: 'No routing policy configured.' } },
            };
        }

        const decision = this.resolveRoutingDecision(tenant, policy, requestRegion);
        if (!decision) {
            return {
                statusCode: 503,
                body: { error: { code: 'NO_HEALTHY_REGION', message: 'No healthy region available for routing.' } },
            };
        }

        return { statusCode: 200, body: { routing: decision } };
    }

    private resolveRoutingDecision(
        tenant: Tenant,
        policy: RoutingPolicy,
        requestRegion?: Region,
    ): RegionRoutingDecision | null {
        const activeEndpoints = policy.endpoints.filter(ep => ep.isActive);
        if (activeEndpoints.length === 0) return null;

        switch (policy.strategy) {
            case 'primary-only':
                return this.resolvePrimaryOnly(tenant, activeEndpoints);

            case 'nearest-region':
                return this.resolveNearestRegion(tenant, activeEndpoints, requestRegion);

            case 'weighted-round-robin':
                return this.resolveWeightedRoundRobin(tenant, activeEndpoints);

            case 'failover-chain':
                return this.resolveFailoverChain(tenant, policy, activeEndpoints);

            default:
                return this.resolvePrimaryOnly(tenant, activeEndpoints);
        }
    }

    private resolvePrimaryOnly(
        tenant: Tenant,
        endpoints: RegionEndpoint[],
    ): RegionRoutingDecision | null {
        const primary = endpoints.find(ep => ep.region === tenant.primaryRegion);
        if (!primary) return null;

        const healthKey = `${tenant.tenantId}:${primary.region}`;
        const health = this.regionHealth.get(healthKey);
        if (health && !health.isHealthy) return null;

        return {
            tenantId: tenant.tenantId,
            selectedRegion: primary.region,
            endpoint: primary,
            reason: 'primary',
            failoverAttempt: 0,
        };
    }

    private resolveNearestRegion(
        tenant: Tenant,
        endpoints: RegionEndpoint[],
        requestRegion?: Region,
    ): RegionRoutingDecision | null {
        if (requestRegion) {
            const exact = endpoints.find(ep => ep.region === requestRegion);
            if (exact) {
                const healthKey = `${tenant.tenantId}:${exact.region}`;
                const health = this.regionHealth.get(healthKey);
                if (!health || health.isHealthy) {
                    return {
                        tenantId: tenant.tenantId,
                        selectedRegion: exact.region,
                        endpoint: exact,
                        reason: 'nearest',
                        failoverAttempt: 0,
                    };
                }
            }
        }

        // Fall back to first healthy endpoint
        for (const ep of endpoints) {
            const healthKey = `${tenant.tenantId}:${ep.region}`;
            const health = this.regionHealth.get(healthKey);
            if (!health || health.isHealthy) {
                return {
                    tenantId: tenant.tenantId,
                    selectedRegion: ep.region,
                    endpoint: ep,
                    reason: 'fallback',
                    failoverAttempt: 0,
                };
            }
        }

        return null;
    }

    private resolveWeightedRoundRobin(
        tenant: Tenant,
        endpoints: RegionEndpoint[],
    ): RegionRoutingDecision | null {
        // Select endpoint with highest weight that is healthy
        const healthyEndpoints = endpoints.filter(ep => {
            const healthKey = `${tenant.tenantId}:${ep.region}`;
            const health = this.regionHealth.get(healthKey);
            return !health || health.isHealthy;
        });

        if (healthyEndpoints.length === 0) return null;

        const sorted = [...healthyEndpoints].sort((a, b) => b.weight - a.weight);
        const selected = sorted[0]!;

        return {
            tenantId: tenant.tenantId,
            selectedRegion: selected.region,
            endpoint: selected,
            reason: 'weighted',
            failoverAttempt: 0,
        };
    }

    private resolveFailoverChain(
        tenant: Tenant,
        policy: RoutingPolicy,
        endpoints: RegionEndpoint[],
    ): RegionRoutingDecision | null {
        // Try primary first
        const primary = endpoints.find(ep => ep.region === policy.primaryRegion);
        if (primary) {
            const healthKey = `${tenant.tenantId}:${primary.region}`;
            const health = this.regionHealth.get(healthKey);
            if (!health || health.isHealthy) {
                return {
                    tenantId: tenant.tenantId,
                    selectedRegion: primary.region,
                    endpoint: primary,
                    reason: 'primary',
                    failoverAttempt: 0,
                };
            }
        }

        // Walk failover chain
        for (let i = 0; i < policy.failoverChain.length; i++) {
            const failoverRegion = policy.failoverChain[i]!;
            const ep = endpoints.find(e => e.region === failoverRegion);
            if (ep) {
                const healthKey = `${tenant.tenantId}:${ep.region}`;
                const health = this.regionHealth.get(healthKey);
                if (!health || health.isHealthy) {
                    return {
                        tenantId: tenant.tenantId,
                        selectedRegion: ep.region,
                        endpoint: ep,
                        reason: 'failover',
                        failoverAttempt: i + 1,
                    };
                }
            }
        }

        return null;
    }

    // -------------------------------------------------------------------
    // Failover management
    // -------------------------------------------------------------------

    updateRegionHealth(
        tenantId: string,
        region: Region,
        isHealthy: boolean,
        latencyMs: number,
        message?: string,
    ): TenantServiceResult {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        const key = `${tenantId}:${region}`;
        const existing = this.regionHealth.get(key);
        const now = new Date().toISOString();

        const consecutiveFailures = isHealthy ? 0 : (existing?.consecutiveFailures ?? 0) + 1;

        const status: RegionHealthStatus = {
            region,
            isHealthy,
            consecutiveFailures,
            lastCheckAt: now,
            latencyMs,
            message,
        };
        this.regionHealth.set(key, status);

        // Check if this triggers automatic failover
        const config = this.failoverConfigs.get(tenantId);
        if (config && config.mode === 'automatic' && !isHealthy) {
            if (consecutiveFailures >= config.unhealthyThreshold) {
                this.initiateFailover(tenant, region, 'Health check threshold exceeded');
            }
        }

        // Check if this triggers automatic failback
        if (config && config.mode === 'automatic' && isHealthy && existing && !existing.isHealthy) {
            const recoveryCount = 1; // This check is the first successful one
            if (recoveryCount >= config.healthyThreshold) {
                this.recordFailoverEvent({
                    eventId: `evt-${Date.now()}`,
                    tenantId,
                    eventType: 'health_check_recovered',
                    fromRegion: region,
                    toRegion: region,
                    reason: 'Region health recovered',
                    timestamp: now,
                });
            }
        }

        return { statusCode: 200, body: { health: status } };
    }

    private initiateFailover(
        tenant: Tenant,
        failedRegion: Region,
        reason: string,
    ): void {
        const policy = this.routingPolicies.get(tenant.tenantId);
        if (!policy) return;

        const targetRegion = policy.failoverChain.find(r => {
            const key = `${tenant.tenantId}:${r}`;
            const health = this.regionHealth.get(key);
            return !health || health.isHealthy;
        });

        if (!targetRegion) return;

        const now = new Date().toISOString();

        this.recordFailoverEvent({
            eventId: `evt-${Date.now()}`,
            tenantId: tenant.tenantId,
            eventType: 'failover_initiated',
            fromRegion: failedRegion,
            toRegion: targetRegion,
            reason,
            timestamp: now,
        });

        // Mark the failed region endpoint as inactive
        const endpoint = policy.endpoints.find(ep => ep.region === failedRegion);
        if (endpoint) {
            endpoint.isActive = false;
        }

        this.recordFailoverEvent({
            eventId: `evt-${Date.now() + 1}`,
            tenantId: tenant.tenantId,
            eventType: 'failover_completed',
            fromRegion: failedRegion,
            toRegion: targetRegion,
            reason: `Failover from ${failedRegion} to ${targetRegion} completed`,
            timestamp: now,
        });
    }

    getFailoverEvents(tenantId: string): TenantServiceResult {
        const events = this.failoverEvents.filter(e => e.tenantId === tenantId);
        return { statusCode: 200, body: { events } };
    }

    private recordFailoverEvent(event: FailoverEvent): void {
        this.failoverEvents.push(event);
    }

    // -------------------------------------------------------------------
    // Failover configuration
    // -------------------------------------------------------------------

    setFailoverConfig(config: FailoverConfig): TenantServiceResult {
        const tenant = this.tenants.get(config.tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        this.failoverConfigs.set(config.tenantId, config);
        return { statusCode: 200, body: { config } };
    }

    getFailoverConfig(tenantId: string): TenantServiceResult {
        const config = this.failoverConfigs.get(tenantId);
        if (!config) {
            return {
                statusCode: 404,
                body: { error: { code: 'CONFIG_NOT_FOUND', message: 'Failover config not found.' } },
            };
        }

        return { statusCode: 200, body: { config } };
    }

    // -------------------------------------------------------------------
    // Policy overrides
    // -------------------------------------------------------------------

    addPolicyOverride(override: PolicyOverride): TenantServiceResult {
        const tenant = this.tenants.get(override.tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        if (!tenant.allowedRegions.includes(override.region)) {
            return {
                statusCode: 400,
                body: { error: { code: 'REGION_NOT_ALLOWED', message: `Region '${override.region}' is not allowed for this tenant.` } },
            };
        }

        const overrides = this.policyOverrides.get(override.tenantId) ?? [];
        // Replace existing override with same id
        const idx = overrides.findIndex(o => o.overrideId === override.overrideId);
        if (idx >= 0) {
            overrides[idx] = override;
        } else {
            overrides.push(override);
        }
        this.policyOverrides.set(override.tenantId, overrides);

        return { statusCode: 200, body: { override } };
    }

    resolvePolicyOverrides(
        tenantId: string,
        region: Region,
        scope?: PolicyOverrideScope,
    ): TenantServiceResult {
        const overrides = this.policyOverrides.get(tenantId) ?? [];
        const now = new Date().toISOString();

        const matching = overrides.filter(o => {
            if (o.region !== region) return false;
            if (scope && o.scope !== scope) return false;
            if (o.expiresAt && o.expiresAt < now) return false;
            return true;
        });

        return { statusCode: 200, body: { overrides: matching } };
    }

    removePolicyOverride(
        tenantId: string,
        overrideId: string,
    ): TenantServiceResult {
        const overrides = this.policyOverrides.get(tenantId) ?? [];
        const idx = overrides.findIndex(o => o.overrideId === overrideId);
        if (idx < 0) {
            return {
                statusCode: 404,
                body: { error: { code: 'OVERRIDE_NOT_FOUND', message: 'Policy override not found.' } },
            };
        }

        overrides.splice(idx, 1);
        this.policyOverrides.set(tenantId, overrides);

        return { statusCode: 200, body: { removed: overrideId } };
    }

    // -------------------------------------------------------------------
    // Routing policy management
    // -------------------------------------------------------------------

    updateRoutingStrategy(
        tenantId: string,
        strategy: RoutingStrategy,
    ): TenantServiceResult {
        const policy = this.routingPolicies.get(tenantId);
        if (!policy) {
            return {
                statusCode: 404,
                body: { error: { code: 'POLICY_NOT_FOUND', message: 'Routing policy not found.' } },
            };
        }

        policy.strategy = strategy;
        return { statusCode: 200, body: { policy } };
    }

    getRoutingPolicy(tenantId: string): TenantServiceResult {
        const policy = this.routingPolicies.get(tenantId);
        if (!policy) {
            return {
                statusCode: 404,
                body: { error: { code: 'POLICY_NOT_FOUND', message: 'Routing policy not found.' } },
            };
        }

        return { statusCode: 200, body: { policy } };
    }

    // -------------------------------------------------------------------
    // Region health queries
    // -------------------------------------------------------------------

    getRegionHealth(tenantId: string, region: Region): TenantServiceResult {
        const key = `${tenantId}:${region}`;
        const health = this.regionHealth.get(key);
        if (!health) {
            return {
                statusCode: 404,
                body: { error: { code: 'HEALTH_NOT_FOUND', message: 'Region health status not found.' } },
            };
        }

        return { statusCode: 200, body: { health } };
    }

    getAllRegionHealth(tenantId: string): TenantServiceResult {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return {
                statusCode: 404,
                body: { error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } },
            };
        }

        const healthStatuses: RegionHealthStatus[] = [];
        for (const region of tenant.allowedRegions) {
            const key = `${tenantId}:${region}`;
            const health = this.regionHealth.get(key);
            if (health) {
                healthStatuses.push(health);
            }
        }

        return { statusCode: 200, body: { health: healthStatuses } };
    }
}

export const createTenantService = (): TenantService => {
    return new TenantService();
};
