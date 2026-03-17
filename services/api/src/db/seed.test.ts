import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';

vi.mock('./discovery-events.js', () => ({
    createPostgresPool: vi.fn(),
    appendDiscoveryEvents: vi.fn(),
    replaceDiscoveryEvents: vi.fn(),
    countDiscoveryEvents: vi.fn(),
}));

import { seedPostgresDiscoveryEvents } from './seed.js';
import {
    createPostgresPool,
    appendDiscoveryEvents,
    replaceDiscoveryEvents,
    countDiscoveryEvents,
} from './discovery-events.js';

// ---------------------------------------------------------------------------
// Env helpers – seedPostgresDiscoveryEvents reads config from process.env
// ---------------------------------------------------------------------------

const ENV_KEYS = ['ATPROTO_SERVICE_DID', 'API_DATA_SOURCE', 'API_DATABASE_URL'] as const;
type EnvKey = (typeof ENV_KEYS)[number];
const saved: Record<EnvKey, string | undefined> = {
    ATPROTO_SERVICE_DID: undefined,
    API_DATA_SOURCE: undefined,
    API_DATABASE_URL: undefined,
};

const POSTGRES_ENV: Record<EnvKey, string> = {
    ATPROTO_SERVICE_DID: 'did:example:test-service',
    API_DATA_SOURCE: 'postgres',
    API_DATABASE_URL: 'postgresql://localhost:5432/test',
};

const TOTAL_IN_DB = 9;

describe('seedPostgresDiscoveryEvents', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
            process.env[key] = POSTGRES_ENV[key];
        }

        const mockPool = { end: vi.fn() } as unknown as Pool;
        vi.mocked(createPostgresPool).mockReturnValue(mockPool);
        vi.mocked(appendDiscoveryEvents).mockResolvedValue(undefined);
        vi.mocked(replaceDiscoveryEvents).mockResolvedValue(undefined);
        vi.mocked(countDiscoveryEvents).mockResolvedValue(TOTAL_IN_DB);
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const previous = saved[key];
            if (previous === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous;
            }
        }
    });

    it('uses replace mode by default and returns a valid result shape', async () => {
        const result = await seedPostgresDiscoveryEvents({
            append: false,
            includePilotScenarios: false,
        });
        expect(replaceDiscoveryEvents).toHaveBeenCalled();
        expect(appendDiscoveryEvents).not.toHaveBeenCalled();
        expect(result.appendMode).toBe(false);
        expect(result.totalEventsInDatabase).toBe(TOTAL_IN_DB);
        expect(result.insertedEvents).toBeGreaterThan(0);
    });

    it('uses append mode when the append option is true', async () => {
        await seedPostgresDiscoveryEvents({ append: true, includePilotScenarios: false });
        expect(appendDiscoveryEvents).toHaveBeenCalled();
        expect(replaceDiscoveryEvents).not.toHaveBeenCalled();
    });

    it('seeds more events when includePilotScenarios is true', async () => {
        const withPilot = await seedPostgresDiscoveryEvents({
            append: false,
            includePilotScenarios: true,
        });
        const withoutPilot = await seedPostgresDiscoveryEvents({
            append: false,
            includePilotScenarios: false,
        });
        expect(withPilot.insertedEvents).toBeGreaterThan(withoutPilot.insertedEvents);
    });

    it('closes the pool after seeding completes', async () => {
        const mockPool = { end: vi.fn() } as unknown as Pool;
        vi.mocked(createPostgresPool).mockReturnValue(mockPool);
        await seedPostgresDiscoveryEvents({ append: false, includePilotScenarios: false });
        expect(mockPool.end).toHaveBeenCalled();
    });
});
