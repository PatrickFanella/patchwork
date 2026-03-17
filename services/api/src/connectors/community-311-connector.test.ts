import { describe, expect, it, beforeEach } from 'vitest';
import {
    Community311Connector,
    createCommunity311Connector,
    type ServiceRequest311,
} from './community-311-connector.js';

const VALID_CONFIG = {
    endpoint: 'https://311.city.example.com/api',
    apiKey: 'city-api-key-456',
    jurisdictionId: 'city-001',
    timeoutMs: 10_000,
};

describe('Community311Connector', () => {
    let connector: Community311Connector;

    beforeEach(() => {
        connector = createCommunity311Connector();
    });

    // -------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------

    describe('initialize', () => {
        it('initializes with valid config', async () => {
            await connector.initialize(VALID_CONFIG);
            expect(connector.isInitialized()).toBe(true);
        });

        it('rejects initialization without endpoint', async () => {
            await expect(connector.initialize({})).rejects.toThrow(
                'Community311Connector requires a valid endpoint URL.',
            );
        });

        it('rejects initialization with empty endpoint', async () => {
            await expect(connector.initialize({ endpoint: '' })).rejects.toThrow(
                'Community311Connector requires a valid endpoint URL.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Inbound sync
    // -------------------------------------------------------------------

    describe('syncInbound', () => {
        it('processes simulated inbound service requests', async () => {
            await connector.initialize(VALID_CONFIG);

            const requests: ServiceRequest311[] = [
                {
                    serviceRequestId: 'sr-001',
                    category: 'water',
                    description: 'Water main break on Elm Street.',
                    address: '123 Elm Street',
                    latitude: 40.7128,
                    longitude: -74.006,
                    status: 'open',
                    priority: 'high',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    serviceRequestId: 'sr-002',
                    category: 'sanitation',
                    description: 'Missed garbage collection.',
                    address: '456 Oak Avenue',
                    status: 'open',
                    priority: 'low',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            connector.addSimulatedInbound(requests);

            const result = await connector.syncInbound();
            expect(result.direction).toBe('inbound');
            expect(result.status).toBe('completed');
            expect(result.recordsProcessed).toBe(2);
            expect(result.recordsFailed).toBe(0);

            expect(connector.getRequests()).toHaveLength(2);
        });

        it('returns zero records when no inbound data', async () => {
            await connector.initialize(VALID_CONFIG);
            const result = await connector.syncInbound();
            expect(result.recordsProcessed).toBe(0);
        });

        it('filters by supported categories when configured', async () => {
            await connector.initialize({
                ...VALID_CONFIG,
                supportedCategories: ['water', 'sanitation'],
            });

            connector.addSimulatedInbound([
                {
                    serviceRequestId: 'sr-water',
                    category: 'water',
                    description: 'Water issue.',
                    status: 'open',
                    priority: 'medium',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    serviceRequestId: 'sr-parks',
                    category: 'parks',
                    description: 'Park issue (should be filtered).',
                    status: 'open',
                    priority: 'low',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ]);

            const result = await connector.syncInbound();
            expect(result.recordsProcessed).toBe(1);
            expect(connector.getRequests()).toHaveLength(1);
            expect(connector.getRequests()[0]!.category).toBe('water');
        });

        it('throws when external system is unhealthy', async () => {
            await connector.initialize(VALID_CONFIG);
            connector.setExternalHealthy(false);

            await expect(connector.syncInbound()).rejects.toThrow(
                '311 municipal system is unavailable.',
            );
        });

        it('throws if not initialized', async () => {
            await expect(connector.syncInbound()).rejects.toThrow(
                'Community311Connector is not initialized.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Outbound sync
    // -------------------------------------------------------------------

    describe('syncOutbound', () => {
        it('sends a service request outbound', async () => {
            await connector.initialize(VALID_CONFIG);

            const payload: Partial<ServiceRequest311> = {
                category: 'housing',
                description: 'Community-identified need for emergency shelter.',
                address: '789 Pine Street',
                priority: 'high',
                reportedBy: 'did:example:community-member',
            };

            const result = await connector.syncOutbound(payload);
            expect(result.direction).toBe('outbound');
            expect(result.status).toBe('completed');
            expect(result.recordsProcessed).toBe(1);
            expect(result.metadata?.externalTicketId).toBeDefined();

            const requests = connector.getRequests();
            expect(requests).toHaveLength(1);
            expect(requests[0]!.category).toBe('housing');
            expect(requests[0]!.priority).toBe('high');
            expect(requests[0]!.status).toBe('open');
        });

        it('throws when external system is unhealthy', async () => {
            await connector.initialize(VALID_CONFIG);
            connector.setExternalHealthy(false);

            await expect(
                connector.syncOutbound({ category: 'other' }),
            ).rejects.toThrow('311 municipal system is unavailable.');
        });

        it('throws if not initialized', async () => {
            await expect(connector.syncOutbound({})).rejects.toThrow(
                'Community311Connector is not initialized.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Health check
    // -------------------------------------------------------------------

    describe('healthCheck', () => {
        it('returns healthy when external system is up', async () => {
            await connector.initialize(VALID_CONFIG);
            const result = await connector.healthCheck();
            expect(result.isHealthy).toBe(true);
            expect(result.connectorId).toBe('community-311-v1');
            expect(result.message).toBe('311 municipal API reachable.');
        });

        it('returns unhealthy when external system is down', async () => {
            await connector.initialize(VALID_CONFIG);
            connector.setExternalHealthy(false);

            const result = await connector.healthCheck();
            expect(result.isHealthy).toBe(false);
            expect(result.message).toBe('311 municipal API unreachable.');
        });

        it('throws if not initialized', async () => {
            await expect(connector.healthCheck()).rejects.toThrow(
                'Community311Connector is not initialized.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Shutdown
    // -------------------------------------------------------------------

    describe('shutdown', () => {
        it('marks connector as not initialized after shutdown', async () => {
            await connector.initialize(VALID_CONFIG);
            expect(connector.isInitialized()).toBe(true);

            await connector.shutdown();
            expect(connector.isInitialized()).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Full lifecycle
    // -------------------------------------------------------------------

    describe('full lifecycle', () => {
        it('initializes, syncs inbound, syncs outbound, checks health, shuts down', async () => {
            // 1. Initialize
            await connector.initialize(VALID_CONFIG);

            // 2. Add inbound requests and sync
            connector.addSimulatedInbound([
                {
                    serviceRequestId: 'sr-100',
                    category: 'roads',
                    description: 'Pothole on Main Street causing traffic issues.',
                    address: '100 Main Street',
                    latitude: 40.75,
                    longitude: -73.99,
                    status: 'open',
                    priority: 'medium',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    serviceRequestId: 'sr-101',
                    category: 'utilities',
                    description: 'Street light outage at intersection.',
                    address: '200 Broadway',
                    status: 'open',
                    priority: 'low',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ]);

            const inbound = await connector.syncInbound();
            expect(inbound.recordsProcessed).toBe(2);

            // 3. Outbound request
            const outbound = await connector.syncOutbound({
                category: 'housing',
                description: 'Community-identified emergency housing need.',
                priority: 'emergency',
                address: '300 Shelter Ave',
            });
            expect(outbound.recordsProcessed).toBe(1);

            // 4. Health check
            const health = await connector.healthCheck();
            expect(health.isHealthy).toBe(true);

            // 5. Verify store has all requests
            expect(connector.getRequests()).toHaveLength(3);

            // 6. Shutdown
            await connector.shutdown();
            expect(connector.isInitialized()).toBe(false);
        });
    });
});
