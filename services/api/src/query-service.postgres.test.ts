import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { FirehoseConsumer, buildPhase3FixtureFirehoseEvents } from '@patchwork/shared';

vi.mock('./db/discovery-events.js', () => ({
    createPostgresPool: vi.fn(),
    loadDiscoveryEvents: vi.fn(),
}));

import { createPostgresQueryService } from './query-service.js';
import {
    createPostgresPool,
    loadDiscoveryEvents,
} from './db/discovery-events.js';

const consumer = new FirehoseConsumer();
const { normalizedEvents } = consumer.ingest(buildPhase3FixtureFirehoseEvents());

describe('createPostgresQueryService', () => {
    let mockPool: Pool & { end: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPool = { end: vi.fn() } as unknown as Pool & { end: ReturnType<typeof vi.fn> };
        vi.mocked(createPostgresPool).mockReturnValue(mockPool);
        vi.mocked(loadDiscoveryEvents).mockResolvedValue(normalizedEvents);
    });

    it('returns a functional query service using the loaded events', async () => {
        const service = await createPostgresQueryService('postgresql://test');
        const result = service.queryMap(
            new URLSearchParams({ latitude: '40.7128', longitude: '-74.006', radiusKm: '25' }),
        );
        expect(result.statusCode).toBe(200);
    });

    it('creates a pool with the provided connection string', async () => {
        await createPostgresQueryService('postgresql://mydb');
        expect(createPostgresPool).toHaveBeenCalledWith('postgresql://mydb');
    });

    it('closes the pool after loading events', async () => {
        await createPostgresQueryService('postgresql://test');
        expect(mockPool.end).toHaveBeenCalled();
    });

    it('closes the pool even when loading events fails', async () => {
        vi.mocked(loadDiscoveryEvents).mockRejectedValue(new Error('db error'));
        await expect(createPostgresQueryService('postgresql://test')).rejects.toThrow('db error');
        expect(mockPool.end).toHaveBeenCalled();
    });
});
