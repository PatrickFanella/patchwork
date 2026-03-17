import type {
    ConnectorContract,
    ConnectorDefinition,
    ConnectorHealthCheck,
    ConnectorInstance,
    ConnectorStatus,
    IntegrationAuditAction,
    IntegrationAuditEntry,
    MarketplaceListing,
    MarketplaceListingStatus,
    ConnectorRetryPolicy,
    SyncFlowRecord,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Result type (mirrors OrgPortalRouteResult pattern)
// ---------------------------------------------------------------------------

export interface ConnectorServiceResult {
    statusCode: number;
    body: unknown;
}

// ---------------------------------------------------------------------------
// ConnectorService
// ---------------------------------------------------------------------------

/**
 * In-memory connector service that manages connector lifecycle,
 * inbound/outbound sync, retry/backoff, audit logging, and health checks.
 */
export class ConnectorService {
    private readonly definitions = new Map<string, ConnectorDefinition>();
    private readonly instances = new Map<string, ConnectorInstance>();
    private readonly syncRecords: SyncFlowRecord[] = [];
    private readonly auditTrail: IntegrationAuditEntry[] = [];
    private readonly listings = new Map<string, MarketplaceListing>();
    private readonly connectorImpls = new Map<string, ConnectorContract>();

    // -------------------------------------------------------------------
    // Connector registry (definitions)
    // -------------------------------------------------------------------

    registerConnector(definition: ConnectorDefinition): ConnectorServiceResult {
        if (!definition.connectorId || !definition.name) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: connectorId, name.' } },
            };
        }

        if (this.definitions.has(definition.connectorId)) {
            return {
                statusCode: 409,
                body: { error: { code: 'CONNECTOR_EXISTS', message: 'Connector already registered.' } },
            };
        }

        this.definitions.set(definition.connectorId, { ...definition, status: 'registered' });
        this.appendAudit(
            'connector_registered',
            definition.connectorId,
            undefined,
            'system',
            definition.connectorId,
            `Connector "${definition.name}" registered.`,
        );

        return { statusCode: 201, body: { connector: this.definitions.get(definition.connectorId) } };
    }

    getConnectorDefinition(connectorId: string): ConnectorServiceResult {
        const def = this.definitions.get(connectorId);
        if (!def) {
            return {
                statusCode: 404,
                body: { error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector not found.' } },
            };
        }

        return { statusCode: 200, body: { connector: def } };
    }

    listConnectors(category?: string): ConnectorServiceResult {
        let connectors = Array.from(this.definitions.values());
        if (category) {
            connectors = connectors.filter(c => c.category === category);
        }
        return { statusCode: 200, body: { connectors } };
    }

    updateConnectorStatus(
        connectorId: string,
        status: ConnectorStatus,
    ): ConnectorServiceResult {
        const def = this.definitions.get(connectorId);
        if (!def) {
            return {
                statusCode: 404,
                body: { error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector not found.' } },
            };
        }

        const previousStatus = def.status;
        def.status = status;
        def.updatedAt = new Date().toISOString();

        const actionMap: Record<string, IntegrationAuditAction> = {
            active: 'connector_activated',
            paused: 'connector_paused',
            decommissioned: 'connector_decommissioned',
            configured: 'connector_configured',
        };

        const action = actionMap[status];
        if (action) {
            this.appendAudit(
                action,
                connectorId,
                undefined,
                'system',
                connectorId,
                `Status changed from ${previousStatus} to ${status}.`,
            );
        }

        return { statusCode: 200, body: { connector: def } };
    }

    // -------------------------------------------------------------------
    // Connector instances
    // -------------------------------------------------------------------

    createInstance(instance: ConnectorInstance): ConnectorServiceResult {
        if (!instance.instanceId || !instance.connectorId || !instance.tenantId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: instanceId, connectorId, tenantId.' } },
            };
        }

        const def = this.definitions.get(instance.connectorId);
        if (!def) {
            return {
                statusCode: 404,
                body: { error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector definition not found.' } },
            };
        }

        if (this.instances.has(instance.instanceId)) {
            return {
                statusCode: 409,
                body: { error: { code: 'INSTANCE_EXISTS', message: 'Instance already exists.' } },
            };
        }

        this.instances.set(instance.instanceId, { ...instance, status: 'configured' });
        this.appendAudit(
            'connector_configured',
            instance.connectorId,
            instance.instanceId,
            'system',
            instance.instanceId,
            `Instance configured for tenant ${instance.tenantId}.`,
        );

        return { statusCode: 201, body: { instance: this.instances.get(instance.instanceId) } };
    }

    getInstance(instanceId: string): ConnectorServiceResult {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        return { statusCode: 200, body: { instance: inst } };
    }

    listInstances(tenantId?: string): ConnectorServiceResult {
        let instances = Array.from(this.instances.values());
        if (tenantId) {
            instances = instances.filter(i => i.tenantId === tenantId);
        }
        return { statusCode: 200, body: { instances } };
    }

    activateInstance(instanceId: string): ConnectorServiceResult {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        inst.status = 'active';
        inst.updatedAt = new Date().toISOString();

        this.appendAudit(
            'connector_activated',
            inst.connectorId,
            instanceId,
            'system',
            instanceId,
            'Instance activated.',
        );

        return { statusCode: 200, body: { instance: inst } };
    }

    pauseInstance(instanceId: string): ConnectorServiceResult {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        inst.status = 'paused';
        inst.updatedAt = new Date().toISOString();

        this.appendAudit(
            'connector_paused',
            inst.connectorId,
            instanceId,
            'system',
            instanceId,
            'Instance paused.',
        );

        return { statusCode: 200, body: { instance: inst } };
    }

    updateInstanceConfig(
        instanceId: string,
        config: Record<string, unknown>,
    ): ConnectorServiceResult {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        inst.config = { ...inst.config, ...config };
        inst.updatedAt = new Date().toISOString();

        this.appendAudit(
            'config_updated',
            inst.connectorId,
            instanceId,
            'system',
            instanceId,
            'Instance configuration updated.',
        );

        return { statusCode: 200, body: { instance: inst } };
    }

    // -------------------------------------------------------------------
    // Sync execution with retry/backoff
    // -------------------------------------------------------------------

    async executeSyncInbound(instanceId: string): Promise<ConnectorServiceResult> {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        if (inst.status !== 'active') {
            return {
                statusCode: 400,
                body: { error: { code: 'INSTANCE_NOT_ACTIVE', message: 'Instance must be active to sync.' } },
            };
        }

        const def = this.definitions.get(inst.connectorId);
        if (!def) {
            return {
                statusCode: 500,
                body: { error: { code: 'DEFINITION_MISSING', message: 'Connector definition missing.' } },
            };
        }

        const syncId = `sync-${Date.now()}`;
        const syncRecord: SyncFlowRecord = {
            syncId,
            instanceId,
            connectorId: inst.connectorId,
            direction: 'inbound',
            status: 'in_progress',
            recordsProcessed: 0,
            recordsFailed: 0,
            retryCount: 0,
            startedAt: new Date().toISOString(),
        };

        this.appendAudit(
            'sync_started',
            inst.connectorId,
            instanceId,
            'system',
            syncId,
            'Inbound sync started.',
        );

        const impl = this.connectorImpls.get(instanceId);
        if (impl) {
            const result = await this.executeWithRetry(
                () => impl.syncInbound(),
                def.retryPolicy,
                syncRecord,
            );
            return { statusCode: 200, body: { sync: result } };
        }

        // No implementation registered; record a simulated sync completion
        syncRecord.status = 'completed';
        syncRecord.completedAt = new Date().toISOString();
        this.syncRecords.push(syncRecord);
        inst.lastSyncAt = syncRecord.completedAt;

        this.appendAudit(
            'sync_completed',
            inst.connectorId,
            instanceId,
            'system',
            syncId,
            `Inbound sync completed: ${syncRecord.recordsProcessed} records.`,
        );

        return { statusCode: 200, body: { sync: syncRecord } };
    }

    async executeSyncOutbound(
        instanceId: string,
        payload: unknown,
    ): Promise<ConnectorServiceResult> {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        if (inst.status !== 'active') {
            return {
                statusCode: 400,
                body: { error: { code: 'INSTANCE_NOT_ACTIVE', message: 'Instance must be active to sync.' } },
            };
        }

        const def = this.definitions.get(inst.connectorId);
        if (!def) {
            return {
                statusCode: 500,
                body: { error: { code: 'DEFINITION_MISSING', message: 'Connector definition missing.' } },
            };
        }

        const syncId = `sync-${Date.now()}`;
        const syncRecord: SyncFlowRecord = {
            syncId,
            instanceId,
            connectorId: inst.connectorId,
            direction: 'outbound',
            status: 'in_progress',
            recordsProcessed: 0,
            recordsFailed: 0,
            retryCount: 0,
            startedAt: new Date().toISOString(),
        };

        this.appendAudit(
            'sync_started',
            inst.connectorId,
            instanceId,
            'system',
            syncId,
            'Outbound sync started.',
        );

        const impl = this.connectorImpls.get(instanceId);
        if (impl) {
            const result = await this.executeWithRetry(
                () => impl.syncOutbound(payload),
                def.retryPolicy,
                syncRecord,
            );
            return { statusCode: 200, body: { sync: result } };
        }

        // No implementation registered; record a simulated sync completion
        syncRecord.status = 'completed';
        syncRecord.recordsProcessed = 1;
        syncRecord.completedAt = new Date().toISOString();
        this.syncRecords.push(syncRecord);
        inst.lastSyncAt = syncRecord.completedAt;

        this.appendAudit(
            'sync_completed',
            inst.connectorId,
            instanceId,
            'system',
            syncId,
            `Outbound sync completed: ${syncRecord.recordsProcessed} records.`,
        );

        return { statusCode: 200, body: { sync: syncRecord } };
    }

    private async executeWithRetry(
        fn: () => Promise<SyncFlowRecord>,
        retryPolicy: ConnectorRetryPolicy,
        syncRecord: SyncFlowRecord,
    ): Promise<SyncFlowRecord> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
            try {
                const result = await fn();
                syncRecord.status = result.status;
                syncRecord.recordsProcessed = result.recordsProcessed;
                syncRecord.recordsFailed = result.recordsFailed;
                syncRecord.completedAt = new Date().toISOString();
                syncRecord.retryCount = attempt;
                this.syncRecords.push(syncRecord);

                if (result.status === 'completed') {
                    this.appendAudit(
                        'sync_completed',
                        syncRecord.connectorId,
                        syncRecord.instanceId,
                        'system',
                        syncRecord.syncId,
                        `Sync completed after ${attempt} retries.`,
                    );
                }

                return syncRecord;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                syncRecord.retryCount = attempt + 1;

                if (attempt < retryPolicy.maxRetries) {
                    syncRecord.status = 'retrying';
                    this.appendAudit(
                        'sync_retried',
                        syncRecord.connectorId,
                        syncRecord.instanceId,
                        'system',
                        syncRecord.syncId,
                        `Retry attempt ${attempt + 1}: ${lastError.message}`,
                    );

                    const delay = this.calculateDelay(retryPolicy, attempt);
                    await this.sleep(delay);
                }
            }
        }

        // All retries exhausted
        syncRecord.status = 'failed';
        syncRecord.errorMessage = lastError?.message ?? 'Unknown error';
        syncRecord.completedAt = new Date().toISOString();
        this.syncRecords.push(syncRecord);

        this.appendAudit(
            'sync_failed',
            syncRecord.connectorId,
            syncRecord.instanceId,
            'system',
            syncRecord.syncId,
            `Sync failed after ${syncRecord.retryCount} retries: ${syncRecord.errorMessage}`,
        );

        // Mark instance as errored
        const inst = this.instances.get(syncRecord.instanceId);
        if (inst) {
            inst.isHealthy = false;
        }

        return syncRecord;
    }

    /** Calculate retry delay based on strategy. */
    calculateDelay(policy: ConnectorRetryPolicy, attempt: number): number {
        switch (policy.strategy) {
            case 'fixed-delay':
                return Math.min(policy.initialDelayMs, policy.maxDelayMs);

            case 'exponential-backoff': {
                const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt);
                return Math.min(delay, policy.maxDelayMs);
            }

            case 'linear-backoff': {
                const delay = policy.initialDelayMs * (attempt + 1);
                return Math.min(delay, policy.maxDelayMs);
            }

            default:
                return policy.initialDelayMs;
        }
    }

    /** Overridable sleep for testing. */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // -------------------------------------------------------------------
    // Health checks
    // -------------------------------------------------------------------

    async checkInstanceHealth(instanceId: string): Promise<ConnectorServiceResult> {
        const inst = this.instances.get(instanceId);
        if (!inst) {
            return {
                statusCode: 404,
                body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found.' } },
            };
        }

        const impl = this.connectorImpls.get(instanceId);
        const now = new Date().toISOString();

        if (impl) {
            try {
                const check = await impl.healthCheck();
                inst.isHealthy = check.isHealthy;
                inst.lastHealthCheckAt = now;

                this.appendAudit(
                    check.isHealthy ? 'health_check_passed' : 'health_check_failed',
                    inst.connectorId,
                    instanceId,
                    'system',
                    instanceId,
                    check.isHealthy ? 'Health check passed.' : `Health check failed: ${check.message ?? 'unknown'}`,
                );

                return { statusCode: 200, body: { health: check } };
            } catch (error) {
                inst.isHealthy = false;
                inst.lastHealthCheckAt = now;

                const message = error instanceof Error ? error.message : 'Health check failed';
                this.appendAudit(
                    'health_check_failed',
                    inst.connectorId,
                    instanceId,
                    'system',
                    instanceId,
                    `Health check error: ${message}`,
                );

                const failedCheck: ConnectorHealthCheck = {
                    connectorId: inst.connectorId,
                    instanceId,
                    isHealthy: false,
                    latencyMs: 0,
                    message,
                    checkedAt: now,
                };

                return { statusCode: 200, body: { health: failedCheck } };
            }
        }

        // No implementation: simulate a healthy check
        inst.lastHealthCheckAt = now;
        const check: ConnectorHealthCheck = {
            connectorId: inst.connectorId,
            instanceId,
            isHealthy: inst.isHealthy,
            latencyMs: 0,
            checkedAt: now,
        };

        this.appendAudit(
            'health_check_passed',
            inst.connectorId,
            instanceId,
            'system',
            instanceId,
            'Simulated health check passed.',
        );

        return { statusCode: 200, body: { health: check } };
    }

    // -------------------------------------------------------------------
    // Connector implementation registration
    // -------------------------------------------------------------------

    registerImplementation(instanceId: string, impl: ConnectorContract): void {
        this.connectorImpls.set(instanceId, impl);
    }

    // -------------------------------------------------------------------
    // Sync history
    // -------------------------------------------------------------------

    getSyncHistory(instanceId: string): ConnectorServiceResult {
        const records = this.syncRecords.filter(r => r.instanceId === instanceId);
        return { statusCode: 200, body: { syncs: records } };
    }

    getSyncRecord(syncId: string): ConnectorServiceResult {
        const record = this.syncRecords.find(r => r.syncId === syncId);
        if (!record) {
            return {
                statusCode: 404,
                body: { error: { code: 'SYNC_NOT_FOUND', message: 'Sync record not found.' } },
            };
        }

        return { statusCode: 200, body: { sync: record } };
    }

    // -------------------------------------------------------------------
    // Audit trail
    // -------------------------------------------------------------------

    getAuditTrail(connectorId?: string, instanceId?: string): ConnectorServiceResult {
        let entries = [...this.auditTrail];
        if (connectorId) {
            entries = entries.filter(e => e.connectorId === connectorId);
        }
        if (instanceId) {
            entries = entries.filter(e => e.instanceId === instanceId);
        }
        return { statusCode: 200, body: { entries } };
    }

    private appendAudit(
        action: IntegrationAuditAction,
        connectorId: string,
        instanceId: string | undefined,
        actor: string,
        target: string,
        details: string,
        metadata?: Record<string, unknown>,
    ): void {
        const entry: IntegrationAuditEntry = {
            auditId: `audit-${Date.now()}-${this.auditTrail.length}`,
            action,
            connectorId,
            instanceId,
            actor,
            target,
            timestamp: new Date().toISOString(),
            details,
            metadata,
        };
        this.auditTrail.push(entry);
    }

    // -------------------------------------------------------------------
    // Marketplace listings
    // -------------------------------------------------------------------

    createMarketplaceListing(listing: MarketplaceListing): ConnectorServiceResult {
        if (!listing.listingId || !listing.connectorId) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: listingId, connectorId.' } },
            };
        }

        const def = this.definitions.get(listing.connectorId);
        if (!def) {
            return {
                statusCode: 404,
                body: { error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector definition not found.' } },
            };
        }

        this.listings.set(listing.listingId, listing);
        return { statusCode: 201, body: { listing } };
    }

    getMarketplaceListing(listingId: string): ConnectorServiceResult {
        const listing = this.listings.get(listingId);
        if (!listing) {
            return {
                statusCode: 404,
                body: { error: { code: 'LISTING_NOT_FOUND', message: 'Marketplace listing not found.' } },
            };
        }

        return { statusCode: 200, body: { listing } };
    }

    listMarketplaceListings(status?: MarketplaceListingStatus): ConnectorServiceResult {
        let listings = Array.from(this.listings.values());
        if (status) {
            listings = listings.filter(l => l.status === status);
        }
        return { statusCode: 200, body: { listings } };
    }

    updateListingStatus(
        listingId: string,
        status: MarketplaceListingStatus,
    ): ConnectorServiceResult {
        const listing = this.listings.get(listingId);
        if (!listing) {
            return {
                statusCode: 404,
                body: { error: { code: 'LISTING_NOT_FOUND', message: 'Marketplace listing not found.' } },
            };
        }

        listing.status = status;
        if (status === 'published' && !listing.publishedAt) {
            listing.publishedAt = new Date().toISOString();
        }

        return { statusCode: 200, body: { listing } };
    }
}

export const createConnectorService = (): ConnectorService => {
    return new ConnectorService();
};
