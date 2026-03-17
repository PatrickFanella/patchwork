import { describe, expect, it, beforeEach } from 'vitest';
import {
    CrisisLineConnector,
    createCrisisLineConnector,
    type CrisisReferral,
} from './crisis-line-connector.js';

const VALID_CONFIG = {
    endpoint: 'https://crisis.example.com/api',
    apiKey: 'test-key-123',
    organizationId: 'org-988',
    timeoutMs: 5000,
};

describe('CrisisLineConnector', () => {
    let connector: CrisisLineConnector;

    beforeEach(() => {
        connector = createCrisisLineConnector();
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
                'CrisisLineConnector requires a valid endpoint URL.',
            );
        });

        it('rejects initialization with empty endpoint', async () => {
            await expect(connector.initialize({ endpoint: '' })).rejects.toThrow(
                'CrisisLineConnector requires a valid endpoint URL.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Inbound sync
    // -------------------------------------------------------------------

    describe('syncInbound', () => {
        it('processes simulated inbound referrals', async () => {
            await connector.initialize(VALID_CONFIG);

            const referrals: CrisisReferral[] = [
                {
                    referralId: 'ref-001',
                    crisisType: 'mental-health',
                    urgency: 'urgent',
                    summary: 'Individual requesting mental health support.',
                    contactMethod: 'chat',
                    createdAt: new Date().toISOString(),
                    status: 'open',
                },
                {
                    referralId: 'ref-002',
                    crisisType: 'substance-abuse',
                    urgency: 'standard',
                    summary: 'Referral for substance abuse support group.',
                    contactMethod: 'phone',
                    createdAt: new Date().toISOString(),
                    status: 'open',
                },
            ];

            connector.addSimulatedInbound(referrals);

            const result = await connector.syncInbound();
            expect(result.direction).toBe('inbound');
            expect(result.status).toBe('completed');
            expect(result.recordsProcessed).toBe(2);
            expect(result.recordsFailed).toBe(0);

            // Verify referrals are stored
            expect(connector.getReferrals()).toHaveLength(2);
        });

        it('returns zero records when no inbound data', async () => {
            await connector.initialize(VALID_CONFIG);
            const result = await connector.syncInbound();
            expect(result.recordsProcessed).toBe(0);
        });

        it('throws if not initialized', async () => {
            await expect(connector.syncInbound()).rejects.toThrow(
                'CrisisLineConnector is not initialized.',
            );
        });
    });

    // -------------------------------------------------------------------
    // Outbound sync
    // -------------------------------------------------------------------

    describe('syncOutbound', () => {
        it('sends a crisis referral outbound', async () => {
            await connector.initialize(VALID_CONFIG);

            const payload: Partial<CrisisReferral> = {
                crisisType: 'suicide',
                urgency: 'immediate',
                summary: 'Individual expressing suicidal ideation.',
                contactMethod: 'phone',
            };

            const result = await connector.syncOutbound(payload);
            expect(result.direction).toBe('outbound');
            expect(result.status).toBe('completed');
            expect(result.recordsProcessed).toBe(1);
            expect(result.metadata?.externalCaseId).toBeDefined();

            // Verify referral is stored
            const referrals = connector.getReferrals();
            expect(referrals).toHaveLength(1);
            expect(referrals[0]!.crisisType).toBe('suicide');
            expect(referrals[0]!.urgency).toBe('immediate');
        });

        it('throws when external system is unhealthy', async () => {
            await connector.initialize(VALID_CONFIG);
            connector.setExternalHealthy(false);

            await expect(
                connector.syncOutbound({ crisisType: 'other' }),
            ).rejects.toThrow('Crisis line system is unavailable.');
        });

        it('throws if not initialized', async () => {
            await expect(connector.syncOutbound({})).rejects.toThrow(
                'CrisisLineConnector is not initialized.',
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
            expect(result.connectorId).toBe('crisis-line-v1');
            expect(result.message).toBe('Crisis line API reachable.');
        });

        it('returns unhealthy when external system is down', async () => {
            await connector.initialize(VALID_CONFIG);
            connector.setExternalHealthy(false);

            const result = await connector.healthCheck();
            expect(result.isHealthy).toBe(false);
            expect(result.message).toBe('Crisis line API unreachable.');
        });

        it('throws if not initialized', async () => {
            await expect(connector.healthCheck()).rejects.toThrow(
                'CrisisLineConnector is not initialized.',
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

            // 2. Add inbound referrals and sync
            connector.addSimulatedInbound([
                {
                    referralId: 'ref-100',
                    crisisType: 'domestic-violence',
                    urgency: 'immediate',
                    summary: 'DV crisis referral from 988.',
                    contactMethod: 'phone',
                    createdAt: new Date().toISOString(),
                    status: 'open',
                },
            ]);
            const inbound = await connector.syncInbound();
            expect(inbound.recordsProcessed).toBe(1);

            // 3. Outbound referral
            const outbound = await connector.syncOutbound({
                crisisType: 'mental-health',
                urgency: 'urgent',
                summary: 'Outbound referral for mental health support.',
                contactMethod: 'chat',
            });
            expect(outbound.recordsProcessed).toBe(1);

            // 4. Health check
            const health = await connector.healthCheck();
            expect(health.isHealthy).toBe(true);

            // 5. Verify store has both referrals
            expect(connector.getReferrals()).toHaveLength(2);

            // 6. Shutdown
            await connector.shutdown();
            expect(connector.isInitialized()).toBe(false);
        });
    });
});
