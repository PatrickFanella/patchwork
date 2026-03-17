import { describe, expect, it } from 'vitest';
import {
    CONTRACT_VERSION,
    PHASE8_VALID_AID_POST,
    PHASE8_VALID_DIRECTORY_RESOURCE,
    PUBLIC_MIN_PRECISION_KM,
    buildPhase8FixtureFirehoseEvents,
    recordNsid,
    safeValidateRecordPayload,
} from '@patchwork/shared';
import { IndexerPipeline } from './pipeline.js';

describe('P8.1 indexer contract test matrix', () => {
    describe('ingestion correctness', () => {
        it('ingests phase 8 fixture events with zero failures', () => {
            const pipeline = new IndexerPipeline();
            const result = pipeline.ingest(buildPhase8FixtureFirehoseEvents());

            expect(result.failureCount).toBe(0);
            expect(result.normalizedCount).toBe(3);
            expect(result.checkpointSeq).toBe(3);
        });

        it('updates index stats accurately after phase 8 ingestion', () => {
            const pipeline = new IndexerPipeline();
            pipeline.ingest(buildPhase8FixtureFirehoseEvents());

            const stats = pipeline.getStats();
            expect(stats.aidRecords).toBe(1);
            expect(stats.directoryRecords).toBe(1);
        });

        it('reproduces identical metrics on deterministic replay', () => {
            const pipeline = new IndexerPipeline();
            const fixtures = buildPhase8FixtureFirehoseEvents();

            const first = pipeline.ingest(fixtures);
            const replayed = pipeline.replay(fixtures);

            expect(replayed.normalizedCount).toBe(first.normalizedCount);
            expect(replayed.failureCount).toBe(first.failureCount);
            expect(replayed.metrics).toEqual(first.metrics);
        });
    });

    describe('schema validation in ingestion pipeline', () => {
        it('phase 8 aid post fixture passes schema validation before ingestion', () => {
            const result = safeValidateRecordPayload(
                recordNsid.aidPost,
                PHASE8_VALID_AID_POST,
            );
            expect(result.success).toBe(true);
        });

        it('phase 8 directory resource fixture passes schema validation before ingestion', () => {
            const result = safeValidateRecordPayload(
                recordNsid.directoryResource,
                PHASE8_VALID_DIRECTORY_RESOURCE,
            );
            expect(result.success).toBe(true);
        });

        it('rejects events with invalid record payloads via ingestion metrics', () => {
            const pipeline = new IndexerPipeline();
            const result = pipeline.ingest([
                {
                    seq: 99,
                    action: 'create',
                    uri: 'at://did:example:p8/app.patchwork.aid.post/bad',
                    collection: recordNsid.aidPost,
                    authorDid: 'did:example:p8',
                    record: { $type: recordNsid.aidPost },
                },
            ]);
            expect(result.failureCount).toBe(1);
        });
    });

    describe('query contract compliance', () => {
        it('query map results conform to the minimum geo precision requirement', () => {
            const pipeline = new IndexerPipeline();
            pipeline.ingest(buildPhase8FixtureFirehoseEvents());

            const results = pipeline.queryMap({
                latitude: 40.7128,
                longitude: -74.006,
                radiusKm: 50,
                nowIso: '2026-02-27T00:10:00.000Z',
            });

            expect(results.items.length).toBeGreaterThan(0);
            for (const r of results.items) {
                expect(r.approximateGeo.precisionKm).toBeGreaterThanOrEqual(
                    PUBLIC_MIN_PRECISION_KM,
                );
            }
        });
    });

    describe('contract version', () => {
        it('CONTRACT_VERSION matches the expected phase tag', () => {
            expect(CONTRACT_VERSION).toBe('0.9.0-phase9');
        });
    });
});
