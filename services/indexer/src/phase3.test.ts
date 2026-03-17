import { describe, expect, it } from 'vitest';
import {
    buildPhase3FixtureFirehoseEvents,
    recordNsid,
} from '@patchwork/shared';
import { IndexerPipeline } from './pipeline.js';

describe('indexer phase 3 pipeline', () => {
    it('ingests fixture stream and updates index stats', () => {
        const pipeline = new IndexerPipeline();

        const result = pipeline.ingest(buildPhase3FixtureFirehoseEvents());

        expect(result.failureCount).toBe(0);
        expect(result.normalizedCount).toBe(5);
        expect(result.checkpointSeq).toBe(5);
        expect(pipeline.getStats()).toMatchObject({
            aidRecords: 2,
            directoryRecords: 2,
        });
    });

    it('supports deterministic replay for fixture streams', () => {
        const pipeline = new IndexerPipeline();
        const fixtures = buildPhase3FixtureFirehoseEvents();

        const first = pipeline.ingest(fixtures);
        const replayed = pipeline.replay(fixtures);

        expect(replayed.metrics).toEqual(first.metrics);
        expect(replayed.failureCount).toEqual(first.failureCount);
        expect(replayed.normalizedCount).toEqual(first.normalizedCount);
    });

    it('surfaces malformed and partial event failures through ingestion metrics', () => {
        const pipeline = new IndexerPipeline();

        const result = pipeline.ingest([
            {
                seq: 1,
                action: 'create',
                collection: recordNsid.aidPost,
            },
            {
                seq: 2,
                action: 'create',
                uri: 'at://did:example:alice/app.patchwork.aid.post/post-z',
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
            },
        ]);

        expect(result.failureCount).toBe(2);
        expect(result.metrics.failed).toBe(2);
        expect(result.metrics.malformed).toBe(1);
        expect(result.metrics.partial).toBe(1);
    });
});
