import type { Pool } from 'pg';
import { Pool as PostgresPool } from 'pg';
import { InMemoryAuditStore } from './audit-store.js';
import { DurableModerationWorkerService } from './durable-moderation-service.js';
import { ModerationMetrics } from './metrics.js';
import { createFixtureModerationWorkerService } from './moderation-service.js';
import { PostgresModerationAuditStore } from './postgres-audit-store.js';
import { PostgresModerationQueueStore } from './postgres-queue-store.js';
import { InMemoryQueueStore } from './queue-store.js';
import { PostgresModerationRetentionService } from './postgres-retention-service.js';
import { startModerationRetentionScheduler } from './retention-scheduler.js';

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
    retentionIntervalMs?: number;
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
    const runtimeMetrics = options.metrics ?? new ModerationMetrics();
    const retention = new PostgresModerationRetentionService(pool);
    const retentionScheduler = startModerationRetentionScheduler({
        intervalMs: options.retentionIntervalMs ?? 3_600_000,
        enforce: async () => {
            const result = await retention.enforce();
            runtimeMetrics.recordRetentionSuccess();
            console.log(
                JSON.stringify({
                    level: 'info',
                    event: 'moderation_retention_completed',
                    ...result,
                }),
            );
        },
        onError: () => {
            runtimeMetrics.recordRetentionFailure();
            console.error(
                JSON.stringify({
                    level: 'error',
                    event: 'moderation_retention_failed',
                }),
            );
        },
    });
    return {
        mode: 'postgres',
        queue,
        service: new DurableModerationWorkerService(
            queue,
            new PostgresModerationAuditStore(pool),
        ),
        close: async () => {
            retentionScheduler.stop();
            if (ownsPool) await pool.end();
        },
    };
};
