import { describe, expect, it } from 'vitest';
import {
    CONNECTOR_CATEGORIES,
    CONNECTOR_STATUSES,
    INTEGRATION_AUDIT_ACTIONS,
    MARKETPLACE_LISTING_STATUSES,
    RETRY_STRATEGIES,
    SYNC_DIRECTIONS,
    CONNECTOR_SYNC_STATUSES,
    connectorDefinitionSchema,
    connectorInstanceSchema,
    integrationAuditEntrySchema,
    integrationContractStubs,
    marketplaceListingSchema,
    retryPolicySchema,
    syncFlowRecordSchema,
    type ConnectorContract,
    type ConnectorHealthCheck,
} from './integrations.js';

describe('Integrations marketplace contracts', () => {
    // -------------------------------------------------------------------
    // Enum constants
    // -------------------------------------------------------------------

    describe('enum constants', () => {
        it('CONNECTOR_STATUSES has correct values', () => {
            expect(CONNECTOR_STATUSES).toEqual([
                'registered',
                'configured',
                'active',
                'paused',
                'error',
                'decommissioned',
            ]);
        });

        it('CONNECTOR_CATEGORIES has correct values', () => {
            expect(CONNECTOR_CATEGORIES).toContain('crisis-services');
            expect(CONNECTOR_CATEGORIES).toContain('municipal-311');
            expect(CONNECTOR_CATEGORIES).toContain('community-hub');
        });

        it('SYNC_DIRECTIONS has correct values', () => {
            expect(SYNC_DIRECTIONS).toEqual(['inbound', 'outbound', 'bidirectional']);
        });

        it('CONNECTOR_SYNC_STATUSES has correct values', () => {
            expect(CONNECTOR_SYNC_STATUSES).toContain('pending');
            expect(CONNECTOR_SYNC_STATUSES).toContain('completed');
            expect(CONNECTOR_SYNC_STATUSES).toContain('retrying');
        });

        it('RETRY_STRATEGIES has correct values', () => {
            expect(RETRY_STRATEGIES).toEqual([
                'fixed-delay',
                'exponential-backoff',
                'linear-backoff',
            ]);
        });

        it('INTEGRATION_AUDIT_ACTIONS has correct values', () => {
            expect(INTEGRATION_AUDIT_ACTIONS).toContain('connector_registered');
            expect(INTEGRATION_AUDIT_ACTIONS).toContain('sync_started');
            expect(INTEGRATION_AUDIT_ACTIONS).toContain('sync_completed');
            expect(INTEGRATION_AUDIT_ACTIONS).toContain('sync_retried');
            expect(INTEGRATION_AUDIT_ACTIONS).toContain('health_check_failed');
        });

        it('MARKETPLACE_LISTING_STATUSES has correct values', () => {
            expect(MARKETPLACE_LISTING_STATUSES).toEqual([
                'draft',
                'published',
                'deprecated',
                'removed',
            ]);
        });
    });

    // -------------------------------------------------------------------
    // Retry policy schema
    // -------------------------------------------------------------------

    describe('retryPolicySchema', () => {
        it('validates the contract stub retry policy', () => {
            const result = retryPolicySchema.safeParse(
                integrationContractStubs.connectorDefinition.retryPolicy,
            );
            expect(result.success).toBe(true);
        });

        it('rejects policy with negative maxRetries', () => {
            const result = retryPolicySchema.safeParse({
                strategy: 'fixed-delay',
                maxRetries: -1,
                initialDelayMs: 1000,
                maxDelayMs: 60000,
                backoffMultiplier: 2,
            });
            expect(result.success).toBe(false);
        });

        it('rejects policy with too-large maxRetries', () => {
            const result = retryPolicySchema.safeParse({
                strategy: 'fixed-delay',
                maxRetries: 20,
                initialDelayMs: 1000,
                maxDelayMs: 60000,
                backoffMultiplier: 2,
            });
            expect(result.success).toBe(false);
        });

        it('rejects policy with too-small initialDelayMs', () => {
            const result = retryPolicySchema.safeParse({
                strategy: 'exponential-backoff',
                maxRetries: 3,
                initialDelayMs: 10,
                maxDelayMs: 60000,
                backoffMultiplier: 2,
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Connector definition schema
    // -------------------------------------------------------------------

    describe('connectorDefinitionSchema', () => {
        it('validates the contract stub', () => {
            const result = connectorDefinitionSchema.safeParse(
                integrationContractStubs.connectorDefinition,
            );
            expect(result.success).toBe(true);
        });

        it('rejects definition with empty name', () => {
            const result = connectorDefinitionSchema.safeParse({
                ...integrationContractStubs.connectorDefinition,
                name: '',
            });
            expect(result.success).toBe(false);
        });

        it('rejects definition with invalid category', () => {
            const result = connectorDefinitionSchema.safeParse({
                ...integrationContractStubs.connectorDefinition,
                category: 'alien-services',
            });
            expect(result.success).toBe(false);
        });

        it('rejects definition with invalid status', () => {
            const result = connectorDefinitionSchema.safeParse({
                ...integrationContractStubs.connectorDefinition,
                status: 'broken',
            });
            expect(result.success).toBe(false);
        });

        it('accepts all valid connector statuses', () => {
            for (const status of CONNECTOR_STATUSES) {
                const result = connectorDefinitionSchema.safeParse({
                    ...integrationContractStubs.connectorDefinition,
                    status,
                });
                expect(result.success).toBe(true);
            }
        });

        it('accepts all valid sync directions', () => {
            for (const direction of SYNC_DIRECTIONS) {
                const result = connectorDefinitionSchema.safeParse({
                    ...integrationContractStubs.connectorDefinition,
                    syncDirection: direction,
                });
                expect(result.success).toBe(true);
            }
        });
    });

    // -------------------------------------------------------------------
    // Connector instance schema
    // -------------------------------------------------------------------

    describe('connectorInstanceSchema', () => {
        it('validates the contract stub', () => {
            const result = connectorInstanceSchema.safeParse(
                integrationContractStubs.connectorInstance,
            );
            expect(result.success).toBe(true);
        });

        it('rejects instance with invalid orgDid', () => {
            const result = connectorInstanceSchema.safeParse({
                ...integrationContractStubs.connectorInstance,
                orgDid: 'not-a-did',
            });
            expect(result.success).toBe(false);
        });

        it('rejects instance with empty instanceId', () => {
            const result = connectorInstanceSchema.safeParse({
                ...integrationContractStubs.connectorInstance,
                instanceId: '',
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Sync flow record schema
    // -------------------------------------------------------------------

    describe('syncFlowRecordSchema', () => {
        it('validates the contract stub', () => {
            const result = syncFlowRecordSchema.safeParse(
                integrationContractStubs.syncFlowRecord,
            );
            expect(result.success).toBe(true);
        });

        it('rejects record with negative recordsProcessed', () => {
            const result = syncFlowRecordSchema.safeParse({
                ...integrationContractStubs.syncFlowRecord,
                recordsProcessed: -1,
            });
            expect(result.success).toBe(false);
        });

        it('accepts all valid sync statuses', () => {
            for (const status of CONNECTOR_SYNC_STATUSES) {
                const result = syncFlowRecordSchema.safeParse({
                    ...integrationContractStubs.syncFlowRecord,
                    status,
                });
                expect(result.success).toBe(true);
            }
        });
    });

    // -------------------------------------------------------------------
    // Integration audit entry schema
    // -------------------------------------------------------------------

    describe('integrationAuditEntrySchema', () => {
        it('validates the contract stub', () => {
            const result = integrationAuditEntrySchema.safeParse(
                integrationContractStubs.auditEntry,
            );
            expect(result.success).toBe(true);
        });

        it('rejects entry with invalid action', () => {
            const result = integrationAuditEntrySchema.safeParse({
                ...integrationContractStubs.auditEntry,
                action: 'launched_rocket',
            });
            expect(result.success).toBe(false);
        });

        it('rejects entry with details exceeding max length', () => {
            const result = integrationAuditEntrySchema.safeParse({
                ...integrationContractStubs.auditEntry,
                details: 'x'.repeat(2001),
            });
            expect(result.success).toBe(false);
        });

        it('accepts all valid audit actions', () => {
            for (const action of INTEGRATION_AUDIT_ACTIONS) {
                const result = integrationAuditEntrySchema.safeParse({
                    ...integrationContractStubs.auditEntry,
                    action,
                });
                expect(result.success).toBe(true);
            }
        });
    });

    // -------------------------------------------------------------------
    // Marketplace listing schema
    // -------------------------------------------------------------------

    describe('marketplaceListingSchema', () => {
        it('validates the contract stub', () => {
            const result = marketplaceListingSchema.safeParse(
                integrationContractStubs.marketplaceListing,
            );
            expect(result.success).toBe(true);
        });

        it('rejects listing with invalid status', () => {
            const result = marketplaceListingSchema.safeParse({
                ...integrationContractStubs.marketplaceListing,
                status: 'hidden',
            });
            expect(result.success).toBe(false);
        });

        it('rejects listing with rating out of range', () => {
            const result = marketplaceListingSchema.safeParse({
                ...integrationContractStubs.marketplaceListing,
                rating: 6,
            });
            expect(result.success).toBe(false);
        });

        it('rejects listing with negative installCount', () => {
            const result = marketplaceListingSchema.safeParse({
                ...integrationContractStubs.marketplaceListing,
                installCount: -1,
            });
            expect(result.success).toBe(false);
        });

        it('rejects listing with too many tags', () => {
            const result = marketplaceListingSchema.safeParse({
                ...integrationContractStubs.marketplaceListing,
                tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // Interface type checks (structural)
    // -------------------------------------------------------------------

    describe('interface types', () => {
        it('ConnectorHealthCheck satisfies expected shape', () => {
            const check: ConnectorHealthCheck = {
                connectorId: 'crisis-line-v1',
                instanceId: 'inst-001',
                isHealthy: true,
                latencyMs: 120,
                checkedAt: new Date().toISOString(),
            };
            expect(check.isHealthy).toBe(true);
            expect(check.latencyMs).toBe(120);
        });

        it('ConnectorContract interface has expected methods', () => {
            // Type-level check: verify the interface shape compiles
            const mockConnector: ConnectorContract = {
                connectorId: 'test',
                initialize: async () => {},
                syncInbound: async () => integrationContractStubs.syncFlowRecord,
                syncOutbound: async () => integrationContractStubs.syncFlowRecord,
                healthCheck: async () => ({
                    connectorId: 'test',
                    instanceId: 'inst-001',
                    isHealthy: true,
                    latencyMs: 50,
                    checkedAt: new Date().toISOString(),
                }),
                shutdown: async () => {},
            };

            expect(mockConnector.connectorId).toBe('test');
            expect(typeof mockConnector.initialize).toBe('function');
            expect(typeof mockConnector.syncInbound).toBe('function');
            expect(typeof mockConnector.syncOutbound).toBe('function');
            expect(typeof mockConnector.healthCheck).toBe('function');
            expect(typeof mockConnector.shutdown).toBe('function');
        });
    });

    // -------------------------------------------------------------------
    // Contract stubs
    // -------------------------------------------------------------------

    describe('integrationContractStubs', () => {
        it('connector definition stub has valid connectorId', () => {
            expect(integrationContractStubs.connectorDefinition.connectorId).toBe('crisis-line-v1');
        });

        it('connector instance stub references the definition', () => {
            expect(integrationContractStubs.connectorInstance.connectorId).toBe(
                integrationContractStubs.connectorDefinition.connectorId,
            );
        });

        it('sync flow record stub references the instance', () => {
            expect(integrationContractStubs.syncFlowRecord.instanceId).toBe(
                integrationContractStubs.connectorInstance.instanceId,
            );
        });

        it('audit entry stub references the connector', () => {
            expect(integrationContractStubs.auditEntry.connectorId).toBe(
                integrationContractStubs.connectorDefinition.connectorId,
            );
        });

        it('marketplace listing stub references the connector', () => {
            expect(integrationContractStubs.marketplaceListing.connectorId).toBe(
                integrationContractStubs.connectorDefinition.connectorId,
            );
        });

        it('marketplace listing stub has valid rating', () => {
            expect(integrationContractStubs.marketplaceListing.rating).toBeGreaterThanOrEqual(0);
            expect(integrationContractStubs.marketplaceListing.rating).toBeLessThanOrEqual(5);
        });
    });
});
