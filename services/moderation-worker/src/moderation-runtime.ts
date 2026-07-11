import type { Pool } from 'pg';
import { Pool as PostgresPool } from 'pg';
import { InMemoryAuditStore } from './audit-store.js';
import { DurableModerationWorkerService } from './durable-moderation-service.js';
import { ModerationMetrics } from './metrics.js';
import { createFixtureModerationWorkerService } from './moderation-service.js';
import { PostgresModerationAuditStore } from './postgres-audit-store.js';
import { PostgresModerationQueueStore } from './postgres-queue-store.js';
import { InMemoryQueueStore } from './queue-store.js';

export type ModerationRuntime =
    | {
          mode: 'postgres';
          queue: PostgresModerationQueueStore;
          service: DurableModerationWorkerService;
          close(): Promise<void>;
      }
    | {
          mode: 'fixture';
          queue: InMemoryQueueStore;
          service: ReturnType<typeof createFixtureModerationWorkerService>;
          close(): Promise<void>;
      };

export interface CreateModerationRuntimeOptions {
    nodeEnv: 'development' | 'test' | 'production';
    databaseUrl?: string;
    pool?: Pool;
    metrics?: ModerationMetrics;
}

export const createModerationRuntime = async (
    options: CreateModerationRuntimeOptions,
): Promise<ModerationRuntime> => {
    if (!options.databaseUrl && !options.pool) {
        if (options.nodeEnv === 'production') {
            throw new Error(
                'FATAL: DATABASE_URL is required by the moderation worker.',
            );
        }
        const queue = new InMemoryQueueStore();
        return {
            mode: 'fixture',
            queue,
            service: createFixtureModerationWorkerService({
                queueStore: queue,
                auditStore: new InMemoryAuditStore(),
                metrics: options.metrics,
            }),
            close: async () => undefined,
        };
    }

    const ownsPool = !options.pool;
    const pool = options.pool ?? new PostgresPool({ connectionString: options.databaseUrl });
    const queue = new PostgresModerationQueueStore(pool);
    await queue.assertReady();
    return {
        mode: 'postgres',
        queue,
        service: new DurableModerationWorkerService(
            queue,
            new PostgresModerationAuditStore(pool),
        ),
        close: async () => {
            if (ownsPool) await pool.end();
        },
    };
};
