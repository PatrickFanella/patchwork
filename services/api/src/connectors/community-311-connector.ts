import type {
    ConnectorContract,
    ConnectorHealthCheck,
    SyncFlowRecord,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// 311 service request types
// ---------------------------------------------------------------------------

export interface ServiceRequest311 {
    serviceRequestId: string;
    category: 'water' | 'sanitation' | 'roads' | 'parks' | 'housing' | 'utilities' | 'other';
    description: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    reportedBy?: string;
    status: 'open' | 'acknowledged' | 'in-progress' | 'completed' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'emergency';
    externalTicketId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Community311Config {
    endpoint: string;
    apiKey?: string;
    jurisdictionId?: string;
    timeoutMs?: number;
    supportedCategories?: string[];
}

// ---------------------------------------------------------------------------
// Community311Connector
// ---------------------------------------------------------------------------

/**
 * Production connector for 311 municipal services integration.
 * Supports bidirectional sync with municipal 311 systems:
 * - Inbound: pull service requests from 311 system into Patchwork
 *   (e.g., identifying community needs)
 * - Outbound: push community-identified needs to 311 system
 *   for municipal follow-up
 *
 * This implementation uses an in-memory store for development/testing.
 * In production, the endpoint configuration would connect to the actual
 * municipal Open311/CRM API.
 */
export class Community311Connector implements ConnectorContract {
    readonly connectorId = 'community-311-v1';

    private config: Community311Config = { endpoint: '' };
    private initialized = false;
    private readonly requestStore: ServiceRequest311[] = [];

    /** Simulated external system health state (for testing). */
    private externalHealthy = true;
    /** Simulated inbound service requests (for testing). */
    private simulatedInbound: ServiceRequest311[] = [];

    async initialize(rawConfig: Record<string, unknown>): Promise<void> {
        const endpoint = rawConfig['endpoint'];
        if (typeof endpoint !== 'string' || !endpoint) {
            throw new Error('Community311Connector requires a valid endpoint URL.');
        }

        this.config = {
            endpoint,
            apiKey: typeof rawConfig['apiKey'] === 'string' ? rawConfig['apiKey'] : undefined,
            jurisdictionId: typeof rawConfig['jurisdictionId'] === 'string' ? rawConfig['jurisdictionId'] : undefined,
            timeoutMs: typeof rawConfig['timeoutMs'] === 'number' ? rawConfig['timeoutMs'] : 30_000,
            supportedCategories: Array.isArray(rawConfig['supportedCategories']) ? rawConfig['supportedCategories'] as string[] : undefined,
        };

        this.initialized = true;
    }

    async syncInbound(): Promise<SyncFlowRecord> {
        this.requireInitialized();

        const now = new Date().toISOString();
        const syncId = `311-sync-in-${Date.now()}`;

        if (!this.externalHealthy) {
            throw new Error('311 municipal system is unavailable.');
        }

        // Pull simulated requests from the "external system"
        const newRequests = this.simulatedInbound.splice(0);
        let processed = 0;
        let failed = 0;

        for (const request of newRequests) {
            try {
                // Apply category filter if configured
                if (
                    this.config.supportedCategories &&
                    !this.config.supportedCategories.includes(request.category)
                ) {
                    continue; // Skip unsupported categories
                }
                this.requestStore.push(request);
                processed++;
            } catch {
                failed++;
            }
        }

        return {
            syncId,
            instanceId: '',
            connectorId: this.connectorId,
            direction: 'inbound',
            status: 'completed',
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
        const syncId = `311-sync-out-${Date.now()}`;

        if (!this.externalHealthy) {
            throw new Error('311 municipal system is unavailable.');
        }

        // In production, this would POST to the Open311 API
        const partial = payload as Partial<ServiceRequest311>;
        const request: ServiceRequest311 = {
            serviceRequestId: partial.serviceRequestId ?? `sr-${Date.now()}`,
            category: partial.category ?? 'other',
            description: partial.description ?? '',
            address: partial.address,
            latitude: partial.latitude,
            longitude: partial.longitude,
            reportedBy: partial.reportedBy,
            status: 'open',
            priority: partial.priority ?? 'medium',
            externalTicketId: `311-${Date.now()}`,
            createdAt: now,
            updatedAt: now,
        };

        this.requestStore.push(request);

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
            metadata: { externalTicketId: request.externalTicketId },
        };
    }

    async healthCheck(): Promise<ConnectorHealthCheck> {
        this.requireInitialized();

        const start = Date.now();

        // In production, this would ping the 311 system health endpoint
        const isHealthy = this.externalHealthy;
        const latencyMs = Date.now() - start;

        return {
            connectorId: this.connectorId,
            instanceId: '',
            isHealthy,
            latencyMs,
            message: isHealthy ? '311 municipal API reachable.' : '311 municipal API unreachable.',
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

    /** Add simulated inbound service requests (for testing). */
    addSimulatedInbound(requests: ServiceRequest311[]): void {
        this.simulatedInbound.push(...requests);
    }

    /** Get all stored service requests (for testing). */
    getRequests(): ServiceRequest311[] {
        return [...this.requestStore];
    }

    /** Check if the connector is initialized (for testing). */
    isInitialized(): boolean {
        return this.initialized;
    }

    private requireInitialized(): void {
        if (!this.initialized) {
            throw new Error('Community311Connector is not initialized. Call initialize() first.');
        }
    }
}

export const createCommunity311Connector = (): Community311Connector => {
    return new Community311Connector();
};
