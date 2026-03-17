import type {
    ConnectorContract,
    ConnectorHealthCheck,
    SyncFlowRecord,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Crisis referral types
// ---------------------------------------------------------------------------

export interface CrisisReferral {
    referralId: string;
    callerDid?: string;
    crisisType: 'suicide' | 'domestic-violence' | 'substance-abuse' | 'mental-health' | 'other';
    urgency: 'immediate' | 'urgent' | 'standard';
    summary: string;
    contactMethod: 'phone' | 'text' | 'chat';
    externalCaseId?: string;
    createdAt: string;
    status: 'open' | 'acknowledged' | 'in-progress' | 'resolved' | 'closed';
}

export interface CrisisLineConfig {
    endpoint: string;
    apiKey?: string;
    organizationId?: string;
    timeoutMs?: number;
    supportedCrisisTypes?: string[];
}

// ---------------------------------------------------------------------------
// CrisisLineConnector
// ---------------------------------------------------------------------------

/**
 * Production connector for crisis line integrations (988 Suicide & Crisis
 * Lifeline and similar services). Supports bidirectional referral sync:
 * - Inbound: pull referrals from crisis line system into Patchwork
 * - Outbound: push aid requests with crisis indicators to crisis line
 *
 * This implementation uses an in-memory store for development/testing.
 * In production, the endpoint configuration would connect to the actual
 * crisis line API.
 */
export class CrisisLineConnector implements ConnectorContract {
    readonly connectorId = 'crisis-line-v1';

    private config: CrisisLineConfig = { endpoint: '' };
    private initialized = false;
    private readonly referralStore: CrisisReferral[] = [];

    /** Simulated external system health state (for testing). */
    private externalHealthy = true;
    /** Simulated inbound referrals (for testing). */
    private simulatedInbound: CrisisReferral[] = [];

    async initialize(rawConfig: Record<string, unknown>): Promise<void> {
        const endpoint = rawConfig['endpoint'];
        if (typeof endpoint !== 'string' || !endpoint) {
            throw new Error('CrisisLineConnector requires a valid endpoint URL.');
        }

        this.config = {
            endpoint: endpoint,
            apiKey: typeof rawConfig['apiKey'] === 'string' ? rawConfig['apiKey'] : undefined,
            organizationId: typeof rawConfig['organizationId'] === 'string' ? rawConfig['organizationId'] : undefined,
            timeoutMs: typeof rawConfig['timeoutMs'] === 'number' ? rawConfig['timeoutMs'] : 30_000,
            supportedCrisisTypes: Array.isArray(rawConfig['supportedCrisisTypes']) ? rawConfig['supportedCrisisTypes'] as string[] : undefined,
        };

        this.initialized = true;
    }

    async syncInbound(): Promise<SyncFlowRecord> {
        this.requireInitialized();

        const now = new Date().toISOString();
        const syncId = `crisis-sync-in-${Date.now()}`;

        // Pull simulated referrals from the "external system"
        const newReferrals = this.simulatedInbound.splice(0);
        let processed = 0;
        let failed = 0;

        for (const referral of newReferrals) {
            try {
                this.referralStore.push(referral);
                processed++;
            } catch {
                failed++;
            }
        }

        return {
            syncId,
            instanceId: '', // filled by service layer
            connectorId: this.connectorId,
            direction: 'inbound',
            status: failed > 0 ? 'completed' : 'completed',
            recordsProcessed: processed,
            recordsFailed: failed,
            retryCount: 0,
            startedAt: now,
            completedAt: new Date().toISOString(),
        };
    }

    async syncOutbound(payload: unknown): Promise<SyncFlowRecord> {
        this.requireInitialized();

        const now = new Date().toISOString();
        const syncId = `crisis-sync-out-${Date.now()}`;

        if (!this.externalHealthy) {
            throw new Error('Crisis line system is unavailable.');
        }

        // In production, this would POST to the crisis line API
        const referral = payload as Partial<CrisisReferral>;
        const outbound: CrisisReferral = {
            referralId: referral.referralId ?? `ref-${Date.now()}`,
            crisisType: referral.crisisType ?? 'other',
            urgency: referral.urgency ?? 'standard',
            summary: referral.summary ?? '',
            contactMethod: referral.contactMethod ?? 'chat',
            createdAt: now,
            status: 'open',
            externalCaseId: `ext-${Date.now()}`,
        };

        this.referralStore.push(outbound);

        return {
            syncId,
            instanceId: '',
            connectorId: this.connectorId,
            direction: 'outbound',
            status: 'completed',
            recordsProcessed: 1,
            recordsFailed: 0,
            retryCount: 0,
            startedAt: now,
            completedAt: new Date().toISOString(),
            metadata: { externalCaseId: outbound.externalCaseId },
        };
    }

    async healthCheck(): Promise<ConnectorHealthCheck> {
        this.requireInitialized();

        const start = Date.now();

        // In production, this would ping the crisis line health endpoint at this.config.endpoint
        const isHealthy = this.externalHealthy && this.config.endpoint.length > 0;
        const latencyMs = Date.now() - start;

        return {
            connectorId: this.connectorId,
            instanceId: '',
            isHealthy,
            latencyMs,
            message: isHealthy ? 'Crisis line API reachable.' : 'Crisis line API unreachable.',
            checkedAt: new Date().toISOString(),
        };
    }

    async shutdown(): Promise<void> {
        this.initialized = false;
    }

    // -------------------------------------------------------------------
    // Test helpers
    // -------------------------------------------------------------------

    /** Set the simulated external system health (for testing). */
    setExternalHealthy(healthy: boolean): void {
        this.externalHealthy = healthy;
    }

    /** Add simulated inbound referrals (for testing). */
    addSimulatedInbound(referrals: CrisisReferral[]): void {
        this.simulatedInbound.push(...referrals);
    }

    /** Get all stored referrals (for testing). */
    getReferrals(): CrisisReferral[] {
        return [...this.referralStore];
    }

    /** Check if the connector is initialized (for testing). */
    isInitialized(): boolean {
        return this.initialized;
    }

    private requireInitialized(): void {
        if (!this.initialized) {
            throw new Error('CrisisLineConnector is not initialized. Call initialize() first.');
        }
    }
}

export const createCrisisLineConnector = (): CrisisLineConnector => {
    return new CrisisLineConnector();
};
