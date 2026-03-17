import {
    DiscoveryIndexStore,
    FirehoseConsumer,
    buildPhase3FixtureFirehoseEvents,
    type AidQueryInput,
    type CheckpointStore,
    type DirectoryQueryInput,
} from '@patchwork/shared';
import { InMemoryCheckpointStore } from './checkpoint.js';
import { MetricsCollector, type IngestionRuntimeMetrics } from './metrics.js';

export interface IndexerPipelineIngestResult {
    normalizedCount: number;
    failureCount: number;
    checkpointSeq: number;
    metrics: ReturnType<FirehoseConsumer['getMetrics']>;
    failures: ReturnType<FirehoseConsumer['ingest']>['failures'];
}

export interface IndexerPipelineOptions {
    /**
     * Checkpoint store for persisting firehose cursor position.
     * Defaults to InMemoryCheckpointStore if not provided.
     */
    checkpointStore?: CheckpointStore;

    /**
     * How often to save checkpoints (in number of processed events).
     * Defaults to 100. Set to 1 for tests to checkpoint after every batch.
     */
    checkpointInterval?: number;
}

export class IndexerPipeline {
    private consumer = new FirehoseConsumer();
    private store = new DiscoveryIndexStore();
    private readonly checkpointStore: CheckpointStore;
    private readonly checkpointInterval: number;
    private readonly metricsCollector = new MetricsCollector();
    private eventsSinceCheckpoint = 0;

    constructor(options?: IndexerPipelineOptions) {
        this.checkpointStore =
            options?.checkpointStore ?? new InMemoryCheckpointStore();
        this.checkpointInterval = options?.checkpointInterval ?? 100;
    }

    /**
     * Load the last checkpoint and return the cursor to resume from.
     * Returns null if no checkpoint exists (start from the beginning).
     */
    async loadCheckpoint(): Promise<number | null> {
        const checkpoint = await this.checkpointStore.load();
        return checkpoint?.cursor ?? null;
    }

    ingest(rawEvents: readonly unknown[]): IndexerPipelineIngestResult {
        const ingested = this.consumer.ingest(rawEvents);
        this.store.applyEvents(ingested.normalizedEvents);

        this.metricsCollector.recordEvents(ingested.normalizedEvents.length);
        this.metricsCollector.recordErrors(ingested.failures.length);
        this.eventsSinceCheckpoint += ingested.normalizedEvents.length;

        return {
            normalizedCount: ingested.normalizedEvents.length,
            failureCount: ingested.failures.length,
            checkpointSeq: ingested.checkpointSeq,
            metrics: ingested.metrics,
            failures: ingested.failures,
        };
    }

    /**
     * Ingest a batch and persist a checkpoint if the interval threshold is met.
     * This is the primary method for production ingestion loops.
     */
    async ingestAndCheckpoint(
        rawEvents: readonly unknown[],
    ): Promise<IndexerPipelineIngestResult> {
        const result = this.ingest(rawEvents);

        if (
            result.checkpointSeq >= 0 &&
            this.eventsSinceCheckpoint >= this.checkpointInterval
        ) {
            await this.checkpointStore.save(result.checkpointSeq);
            this.eventsSinceCheckpoint = 0;
        }

        return result;
    }

    /**
     * Force a checkpoint save regardless of the interval.
     */
    async saveCheckpoint(): Promise<void> {
        const seq = this.consumer.getCheckpointSeq();
        if (seq >= 0) {
            await this.checkpointStore.save(seq);
            this.eventsSinceCheckpoint = 0;
        }
    }

    replay(rawEvents: readonly unknown[]): IndexerPipelineIngestResult {
        this.consumer = new FirehoseConsumer();
        this.store = new DiscoveryIndexStore();
        this.eventsSinceCheckpoint = 0;

        return this.ingest(rawEvents);
    }

    /**
     * Replay events from a specific cursor position.
     * Filters rawEvents to only those with seq > cursor.
     */
    replayFromCursor(
        rawEvents: readonly unknown[],
        cursor: number,
    ): IndexerPipelineIngestResult {
        const filtered = rawEvents.filter((event: unknown) => {
            if (
                typeof event === 'object' &&
                event !== null &&
                'seq' in event &&
                typeof (event as Record<string, unknown>).seq === 'number'
            ) {
                return (event as Record<string, unknown>).seq as number > cursor;
            }
            return true;
        });

        return this.ingest(filtered);
    }

    queryMap(input: AidQueryInput) {
        return this.store.queryMap(input);
    }

    queryFeed(input: AidQueryInput) {
        return this.store.queryFeed(input);
    }

    queryDirectory(input: DirectoryQueryInput) {
        return this.store.queryDirectory(input);
    }

    getStats() {
        return this.store.getStats();
    }

    getMetrics() {
        return this.consumer.getMetrics();
    }

    getCheckpointSeq() {
        return this.consumer.getCheckpointSeq();
    }

    getLogs() {
        return this.consumer.getLogs();
    }

    getCheckpointStore(): CheckpointStore {
        return this.checkpointStore;
    }

    /**
     * Get a full runtime metrics snapshot including checkpoint health.
     */
    async getRuntimeMetrics(): Promise<IngestionRuntimeMetrics> {
        const checkpointHealth = await this.checkpointStore.health();
        return this.metricsCollector.snapshot(checkpointHealth);
    }
}

export const createFixtureIndexerPipeline = (): IndexerPipeline => {
    const pipeline = new IndexerPipeline();
    pipeline.ingest(buildPhase3FixtureFirehoseEvents());
    return pipeline;
};
