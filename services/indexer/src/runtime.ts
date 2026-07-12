import type { IndexerPipeline } from './pipeline.js';
import type { AtEventSource } from './stream/event-source.js';

export interface IndexerRuntimeOptions {
    pipeline: IndexerPipeline;
    source: AtEventSource;
}

export class IndexerRuntime {
    private started = false;
    private stopped = false;

    constructor(private readonly options: IndexerRuntimeOptions) {}

    async start(): Promise<void> {
        if (this.started) throw new Error('Indexer runtime is already started.');
        this.started = true;
        const cursor = await this.options.pipeline.loadCheckpoint();
        await this.options.source.start(cursor, async event => {
            const result = await this.options.pipeline.ingestAndCheckpoint([event]);
            if (
                result.normalizedCount + result.quarantinedCount !== 1 ||
                result.failureCount !== result.quarantinedCount
            ) {
                throw new Error('Live AT event was rejected by the ingestion pipeline.');
            }
        });
    }

    async stop(): Promise<void> {
        if (!this.started || this.stopped) return;
        this.stopped = true;
        await this.options.source.stop();
        await this.options.pipeline.saveCheckpoint();
    }
}
