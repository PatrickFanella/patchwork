import { describe, expect, it, beforeEach } from 'vitest';
import { ConnectorService, createConnectorService } from './connector-service.js';
import type {
    ConnectorDefinition,
    ConnectorHealthCheck,
    ConnectorInstance,
    IntegrationAuditEntry,
    MarketplaceListing,
    SyncFlowRecord,
} from '@patchwork/shared';

const now = () => new Date().toISOString();

const CRISIS_CONNECTOR: ConnectorDefinition = {
    connectorId: 'crisis-line-v1',
    name: 'Crisis Line Connector',
    description: 'Integrates with crisis hotlines.',
    category: 'crisis-services',
    version: '1.0.0',
    author: 'Patchwork Core Team',
    status: 'registered',
    syncDirection: 'bidirectional',
    requiredScopes: ['read:crisis_data', 'write:referrals'],
    retryPolicy: {
        strategy: 'exponential-backoff',
        maxRetries: 3,
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        backoffMultiplier: 2,
    },
    createdAt: now(),
    updatedAt: now(),
};

const CRISIS_INSTANCE: ConnectorInstance = {
    instanceId: 'inst-crisis-001',
    connectorId: 'crisis-line-v1',
    tenantId: 'tenant-001',
    orgDid: 'did:example:org-1',
    status: 'configured',
    config: { endpoint: 'https://crisis.example.com/api' },
    isHealthy: true,
    createdAt: now(),
    updatedAt: now(),
};

const setupConnectorWithInstance = (service: ConnectorService): void => {
    service.registerConnector(CRISIS_CONNECTOR);
    service.createInstance(CRISIS_INSTANCE);
    service.activateInstance(CRISIS_INSTANCE.instanceId);
};

describe('ConnectorService', () => {
    let service: ConnectorService;

    beforeEach(() => {
        service = createConnectorService();
    });

    // -------------------------------------------------------------------
    // Connector registration
    // -------------------------------------------------------------------

    describe('registerConnector', () => {
        it('registers a new connector', () => {
            const result = service.registerConnector(CRISIS_CONNECTOR);
            expect(result.statusCode).toBe(201);
            const body = result.body as { connector: ConnectorDefinition };
            expect(body.connector.connectorId).toBe('crisis-line-v1');
            expect(body.connector.status).toBe('registered');
        });

        it('rejects duplicate registration', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.registerConnector(CRISIS_CONNECTOR);
            expect(result.statusCode).toBe(409);
        });

        it('rejects registration with missing fields', () => {
            const result = service.registerConnector({
                ...CRISIS_CONNECTOR,
                connectorId: '',
            });
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getConnectorDefinition', () => {
        it('returns the connector definition', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.getConnectorDefinition('crisis-line-v1');
            expect(result.statusCode).toBe(200);
            const body = result.body as { connector: ConnectorDefinition };
            expect(body.connector.name).toBe('Crisis Line Connector');
        });

        it('returns 404 for unknown connector', () => {
            const result = service.getConnectorDefinition('unknown');
            expect(result.statusCode).toBe(404);
        });
    });

    describe('listConnectors', () => {
        it('lists all connectors', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.listConnectors();
            expect(result.statusCode).toBe(200);
            const body = result.body as { connectors: ConnectorDefinition[] };
            expect(body.connectors).toHaveLength(1);
        });

        it('filters connectors by category', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.listConnectors('crisis-services');
            const body = result.body as { connectors: ConnectorDefinition[] };
            expect(body.connectors).toHaveLength(1);

            const empty = service.listConnectors('municipal-311');
            const emptyBody = empty.body as { connectors: ConnectorDefinition[] };
            expect(emptyBody.connectors).toHaveLength(0);
        });
    });

    describe('updateConnectorStatus', () => {
        it('updates connector status', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.updateConnectorStatus('crisis-line-v1', 'active');
            expect(result.statusCode).toBe(200);
            const body = result.body as { connector: ConnectorDefinition };
            expect(body.connector.status).toBe('active');
        });

        it('returns 404 for unknown connector', () => {
            const result = service.updateConnectorStatus('nope', 'active');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Connector instances
    // -------------------------------------------------------------------

    describe('createInstance', () => {
        it('creates an instance linked to a definition', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.createInstance(CRISIS_INSTANCE);
            expect(result.statusCode).toBe(201);
            const body = result.body as { instance: ConnectorInstance };
            expect(body.instance.status).toBe('configured');
        });

        it('rejects instance for unknown connector', () => {
            const result = service.createInstance(CRISIS_INSTANCE);
            expect(result.statusCode).toBe(404);
        });

        it('rejects duplicate instance', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.createInstance(CRISIS_INSTANCE);
            expect(result.statusCode).toBe(409);
        });

        it('rejects instance with missing fields', () => {
            const result = service.createInstance({
                ...CRISIS_INSTANCE,
                instanceId: '',
            });
            expect(result.statusCode).toBe(400);
        });
    });

    describe('getInstance', () => {
        it('returns the instance', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.getInstance('inst-crisis-001');
            expect(result.statusCode).toBe(200);
        });

        it('returns 404 for unknown instance', () => {
            const result = service.getInstance('nope');
            expect(result.statusCode).toBe(404);
        });
    });

    describe('listInstances', () => {
        it('lists all instances', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.listInstances();
            const body = result.body as { instances: ConnectorInstance[] };
            expect(body.instances).toHaveLength(1);
        });

        it('filters by tenantId', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.listInstances('tenant-001');
            const body = result.body as { instances: ConnectorInstance[] };
            expect(body.instances).toHaveLength(1);

            const empty = service.listInstances('tenant-999');
            const emptyBody = empty.body as { instances: ConnectorInstance[] };
            expect(emptyBody.instances).toHaveLength(0);
        });
    });

    describe('activateInstance', () => {
        it('activates a configured instance', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.activateInstance('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { instance: ConnectorInstance };
            expect(body.instance.status).toBe('active');
        });

        it('returns 404 for unknown instance', () => {
            const result = service.activateInstance('nope');
            expect(result.statusCode).toBe(404);
        });
    });

    describe('pauseInstance', () => {
        it('pauses an active instance', () => {
            setupConnectorWithInstance(service);
            const result = service.pauseInstance('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { instance: ConnectorInstance };
            expect(body.instance.status).toBe('paused');
        });
    });

    describe('updateInstanceConfig', () => {
        it('updates instance configuration', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            const result = service.updateInstanceConfig('inst-crisis-001', {
                endpoint: 'https://new-crisis.example.com/api',
                timeout: 5000,
            });
            expect(result.statusCode).toBe(200);
            const body = result.body as { instance: ConnectorInstance };
            expect(body.instance.config.endpoint).toBe('https://new-crisis.example.com/api');
            expect(body.instance.config.timeout).toBe(5000);
        });

        it('returns 404 for unknown instance', () => {
            const result = service.updateInstanceConfig('nope', {});
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Sync execution
    // -------------------------------------------------------------------

    describe('executeSyncInbound', () => {
        it('executes inbound sync (simulated)', async () => {
            setupConnectorWithInstance(service);
            const result = await service.executeSyncInbound('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { sync: SyncFlowRecord };
            expect(body.sync.direction).toBe('inbound');
            expect(body.sync.status).toBe('completed');
        });

        it('rejects sync for inactive instance', async () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            // Instance is configured but not active
            const result = await service.executeSyncInbound('inst-crisis-001');
            expect(result.statusCode).toBe(400);
        });

        it('returns 404 for unknown instance', async () => {
            const result = await service.executeSyncInbound('nope');
            expect(result.statusCode).toBe(404);
        });
    });

    describe('executeSyncOutbound', () => {
        it('executes outbound sync (simulated)', async () => {
            setupConnectorWithInstance(service);
            const result = await service.executeSyncOutbound('inst-crisis-001', {
                referralId: 'ref-001',
                type: 'crisis-referral',
            });
            expect(result.statusCode).toBe(200);
            const body = result.body as { sync: SyncFlowRecord };
            expect(body.sync.direction).toBe('outbound');
            expect(body.sync.status).toBe('completed');
        });
    });

    describe('executeWithRetry (via registered implementation)', () => {
        it('retries on failure and succeeds', async () => {
            setupConnectorWithInstance(service);

            let callCount = 0;
            service.registerImplementation('inst-crisis-001', {
                connectorId: 'crisis-line-v1',
                initialize: async () => {},
                syncInbound: async () => {
                    callCount++;
                    if (callCount < 3) {
                        throw new Error('Transient error');
                    }
                    return {
                        syncId: 'sync-retry-test',
                        instanceId: 'inst-crisis-001',
                        connectorId: 'crisis-line-v1',
                        direction: 'inbound' as const,
                        status: 'completed' as const,
                        recordsProcessed: 10,
                        recordsFailed: 0,
                        retryCount: 0,
                        startedAt: now(),
                        completedAt: now(),
                    };
                },
                syncOutbound: async () => ({} as SyncFlowRecord),
                healthCheck: async () => ({
                    connectorId: 'crisis-line-v1',
                    instanceId: 'inst-crisis-001',
                    isHealthy: true,
                    latencyMs: 50,
                    checkedAt: now(),
                }),
                shutdown: async () => {},
            });

            // Override sleep to avoid actual delays in tests
            (service as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async () => {};

            const result = await service.executeSyncInbound('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { sync: SyncFlowRecord };
            expect(body.sync.status).toBe('completed');
            expect(body.sync.retryCount).toBe(2);
            expect(callCount).toBe(3);
        });

        it('records failure after all retries exhausted', async () => {
            setupConnectorWithInstance(service);

            service.registerImplementation('inst-crisis-001', {
                connectorId: 'crisis-line-v1',
                initialize: async () => {},
                syncInbound: async () => {
                    throw new Error('Persistent error');
                },
                syncOutbound: async () => ({} as SyncFlowRecord),
                healthCheck: async () => ({
                    connectorId: 'crisis-line-v1',
                    instanceId: 'inst-crisis-001',
                    isHealthy: true,
                    latencyMs: 50,
                    checkedAt: now(),
                }),
                shutdown: async () => {},
            });

            (service as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async () => {};

            const result = await service.executeSyncInbound('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { sync: SyncFlowRecord };
            expect(body.sync.status).toBe('failed');
            expect(body.sync.errorMessage).toBe('Persistent error');
            expect(body.sync.retryCount).toBe(4); // initial + 3 retries
        });
    });

    // -------------------------------------------------------------------
    // Retry delay calculation
    // -------------------------------------------------------------------

    describe('calculateDelay', () => {
        it('fixed-delay returns initial delay', () => {
            const delay = service.calculateDelay(
                { strategy: 'fixed-delay', maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 60000, backoffMultiplier: 2 },
                2,
            );
            expect(delay).toBe(1000);
        });

        it('exponential-backoff increases delay exponentially', () => {
            const policy = { strategy: 'exponential-backoff' as const, maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 60000, backoffMultiplier: 2 };
            expect(service.calculateDelay(policy, 0)).toBe(1000);
            expect(service.calculateDelay(policy, 1)).toBe(2000);
            expect(service.calculateDelay(policy, 2)).toBe(4000);
            expect(service.calculateDelay(policy, 3)).toBe(8000);
        });

        it('exponential-backoff caps at maxDelayMs', () => {
            const delay = service.calculateDelay(
                { strategy: 'exponential-backoff', maxRetries: 10, initialDelayMs: 10000, maxDelayMs: 30000, backoffMultiplier: 3 },
                5,
            );
            expect(delay).toBe(30000);
        });

        it('linear-backoff increases delay linearly', () => {
            const policy = { strategy: 'linear-backoff' as const, maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 60000, backoffMultiplier: 2 };
            expect(service.calculateDelay(policy, 0)).toBe(1000);
            expect(service.calculateDelay(policy, 1)).toBe(2000);
            expect(service.calculateDelay(policy, 2)).toBe(3000);
        });
    });

    // -------------------------------------------------------------------
    // Health checks
    // -------------------------------------------------------------------

    describe('checkInstanceHealth', () => {
        it('returns health for a simulated instance', async () => {
            setupConnectorWithInstance(service);
            const result = await service.checkInstanceHealth('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { health: ConnectorHealthCheck };
            expect(body.health.isHealthy).toBe(true);
        });

        it('returns 404 for unknown instance', async () => {
            const result = await service.checkInstanceHealth('nope');
            expect(result.statusCode).toBe(404);
        });

        it('records health check failure from implementation', async () => {
            setupConnectorWithInstance(service);
            service.registerImplementation('inst-crisis-001', {
                connectorId: 'crisis-line-v1',
                initialize: async () => {},
                syncInbound: async () => ({} as SyncFlowRecord),
                syncOutbound: async () => ({} as SyncFlowRecord),
                healthCheck: async () => {
                    throw new Error('Connection refused');
                },
                shutdown: async () => {},
            });

            const result = await service.checkInstanceHealth('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { health: ConnectorHealthCheck };
            expect(body.health.isHealthy).toBe(false);
            expect(body.health.message).toBe('Connection refused');
        });
    });

    // -------------------------------------------------------------------
    // Sync history
    // -------------------------------------------------------------------

    describe('sync history', () => {
        it('returns sync history for an instance', async () => {
            setupConnectorWithInstance(service);
            await service.executeSyncInbound('inst-crisis-001');
            await service.executeSyncOutbound('inst-crisis-001', { data: 'test' });

            const result = service.getSyncHistory('inst-crisis-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { syncs: SyncFlowRecord[] };
            expect(body.syncs).toHaveLength(2);
        });

        it('returns 404 for unknown sync record', () => {
            const result = service.getSyncRecord('nope');
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Audit trail
    // -------------------------------------------------------------------

    describe('audit trail', () => {
        it('records audit entries for connector lifecycle', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createInstance(CRISIS_INSTANCE);
            service.activateInstance('inst-crisis-001');

            const result = service.getAuditTrail('crisis-line-v1');
            expect(result.statusCode).toBe(200);
            const body = result.body as { entries: IntegrationAuditEntry[] };
            expect(body.entries.length).toBeGreaterThanOrEqual(3);

            const actions = body.entries.map(e => e.action);
            expect(actions).toContain('connector_registered');
            expect(actions).toContain('connector_configured');
            expect(actions).toContain('connector_activated');
        });

        it('records sync audit entries', async () => {
            setupConnectorWithInstance(service);
            await service.executeSyncInbound('inst-crisis-001');

            const result = service.getAuditTrail('crisis-line-v1', 'inst-crisis-001');
            const body = result.body as { entries: IntegrationAuditEntry[] };
            const actions = body.entries.map(e => e.action);
            expect(actions).toContain('sync_started');
            expect(actions).toContain('sync_completed');
        });

        it('returns empty audit trail for unknown connector', () => {
            const result = service.getAuditTrail('unknown');
            const body = result.body as { entries: IntegrationAuditEntry[] };
            expect(body.entries).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------
    // Marketplace listings
    // -------------------------------------------------------------------

    describe('marketplace listings', () => {
        const LISTING: MarketplaceListing = {
            listingId: 'listing-001',
            connectorId: 'crisis-line-v1',
            status: 'draft',
            displayName: 'Crisis Line Connector',
            shortDescription: 'Connect to crisis hotlines.',
            fullDescription: 'Full crisis integration.',
            tags: ['crisis', 'mental-health'],
            installCount: 0,
            rating: 0,
        };

        it('creates a marketplace listing', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            const result = service.createMarketplaceListing(LISTING);
            expect(result.statusCode).toBe(201);
        });

        it('rejects listing for unknown connector', () => {
            const result = service.createMarketplaceListing(LISTING);
            expect(result.statusCode).toBe(404);
        });

        it('rejects listing with missing fields', () => {
            const result = service.createMarketplaceListing({
                ...LISTING,
                listingId: '',
            });
            expect(result.statusCode).toBe(400);
        });

        it('retrieves a marketplace listing', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createMarketplaceListing(LISTING);
            const result = service.getMarketplaceListing('listing-001');
            expect(result.statusCode).toBe(200);
            const body = result.body as { listing: MarketplaceListing };
            expect(body.listing.displayName).toBe('Crisis Line Connector');
        });

        it('returns 404 for unknown listing', () => {
            const result = service.getMarketplaceListing('nope');
            expect(result.statusCode).toBe(404);
        });

        it('lists marketplace listings', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createMarketplaceListing(LISTING);
            const result = service.listMarketplaceListings();
            const body = result.body as { listings: MarketplaceListing[] };
            expect(body.listings).toHaveLength(1);
        });

        it('filters by status', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createMarketplaceListing(LISTING);
            const published = service.listMarketplaceListings('published');
            const pubBody = published.body as { listings: MarketplaceListing[] };
            expect(pubBody.listings).toHaveLength(0);

            const drafts = service.listMarketplaceListings('draft');
            const draftBody = drafts.body as { listings: MarketplaceListing[] };
            expect(draftBody.listings).toHaveLength(1);
        });

        it('updates listing status and sets publishedAt', () => {
            service.registerConnector(CRISIS_CONNECTOR);
            service.createMarketplaceListing(LISTING);
            const result = service.updateListingStatus('listing-001', 'published');
            expect(result.statusCode).toBe(200);
            const body = result.body as { listing: MarketplaceListing };
            expect(body.listing.status).toBe('published');
            expect(body.listing.publishedAt).toBeDefined();
        });
    });

    // -------------------------------------------------------------------
    // Full lifecycle
    // -------------------------------------------------------------------

    describe('full connector lifecycle', () => {
        it('registers, instantiates, syncs, checks health, audits', async () => {
            // 1. Register connector
            service.registerConnector(CRISIS_CONNECTOR);

            // 2. Create instance
            service.createInstance(CRISIS_INSTANCE);

            // 3. Activate instance
            service.activateInstance('inst-crisis-001');

            // 4. Execute inbound sync
            const inbound = await service.executeSyncInbound('inst-crisis-001');
            expect(inbound.statusCode).toBe(200);

            // 5. Execute outbound sync
            const outbound = await service.executeSyncOutbound('inst-crisis-001', { type: 'referral' });
            expect(outbound.statusCode).toBe(200);

            // 6. Check health
            const health = await service.checkInstanceHealth('inst-crisis-001');
            expect(health.statusCode).toBe(200);

            // 7. Verify audit trail
            const audit = service.getAuditTrail('crisis-line-v1');
            const auditBody = audit.body as { entries: IntegrationAuditEntry[] };
            expect(auditBody.entries.length).toBeGreaterThanOrEqual(6);

            // 8. Verify sync history
            const history = service.getSyncHistory('inst-crisis-001');
            const historyBody = history.body as { syncs: SyncFlowRecord[] };
            expect(historyBody.syncs).toHaveLength(2);

            // 9. Create marketplace listing
            service.createMarketplaceListing({
                listingId: 'listing-001',
                connectorId: 'crisis-line-v1',
                status: 'published',
                displayName: 'Crisis Line',
                shortDescription: 'Crisis integration.',
                fullDescription: 'Full crisis integration.',
                tags: ['crisis'],
                installCount: 1,
                rating: 4.5,
                publishedAt: now(),
            });

            // 10. Pause instance
            service.pauseInstance('inst-crisis-001');
            const paused = service.getInstance('inst-crisis-001');
            const pausedBody = paused.body as { instance: ConnectorInstance };
            expect(pausedBody.instance.status).toBe('paused');
        });
    });
});
