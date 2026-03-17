import { describe, expect, it } from 'vitest';
import {
    FirehoseConsumer,
    buildPhase3FixtureFirehoseEvents,
    normalizeFirehoseEvent,
} from './firehose.js';
import { recordNsid } from '@patchwork/at-lexicons';

describe('P3.1 firehose consumer + normalization', () => {
    it('ingests fixture streams with deterministic normalized output', () => {
        const consumer = new FirehoseConsumer();
        const fixtures = buildPhase3FixtureFirehoseEvents();

        const result = consumer.ingest(fixtures);

        expect(result.metrics).toMatchObject({
            processed: fixtures.length,
            normalized: fixtures.length,
            failed: 0,
            malformed: 0,
            partial: 0,
        });
        expect(result.failures).toEqual([]);
        expect(result.normalizedEvents).toHaveLength(fixtures.length);
        expect(result.checkpointSeq).toBe(5);

        expect(result.normalizedEvents[0]).toMatchObject({
            seq: 1,
            action: 'create',
            collection: recordNsid.aidPost,
        });
    });

    it('replays deterministically across reprocessing runs', () => {
        const consumer = new FirehoseConsumer();
        const fixtures = buildPhase3FixtureFirehoseEvents();

        const first = consumer.ingest(fixtures);
        const replayed = consumer.replay(fixtures);

        expect(replayed.normalizedEvents).toEqual(first.normalizedEvents);
        expect(replayed.failures).toEqual(first.failures);
        expect(replayed.metrics).toEqual(first.metrics);
    });

    it('classifies malformed, partial, and validation-failed events', () => {
        const consumer = new FirehoseConsumer();
        const invalidBatch = [
            {
                seq: 'bad',
                action: 'create',
                uri: 'at://did:example:alice/app.patchwork.aid.post/oops',
                collection: recordNsid.aidPost,
            },
            {
                seq: 9,
                action: 'create',
                uri: 'at://did:example:alice/app.patchwork.aid.post/partial',
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
            },
            {
                seq: 10,
                action: 'create',
                uri: 'at://did:example:alice/app.patchwork.aid.post/invalid',
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
                record: {
                    $type: recordNsid.aidPost,
                    version: '1.0.0',
                    title: 'Needs supplies',
                    description: 'Invalid urgency payload for test',
                    category: 'food',
                    urgency: 'urgent',
                    status: 'open',
                    location: {
                        latitude: 40.7,
                        longitude: -74,
                        precisionKm: 3,
                    },
                    createdAt: '2026-02-26T12:00:00.000Z',
                },
            },
        ];

        const result = consumer.ingest(invalidBatch);

        expect(result.metrics).toMatchObject({
            processed: 3,
            normalized: 0,
            failed: 3,
            malformed: 1,
            partial: 1,
        });

        const codes = result.failures.map(entry => entry.code).sort();
        expect(codes).toEqual([
            'MALFORMED_EVENT',
            'PARTIAL_EVENT',
            'VALIDATION_FAILED',
        ]);
    });

    it('normalizes AT URI author DID when authorDid field is omitted', () => {
        const normalized = normalizeFirehoseEvent({
            seq: 44,
            action: 'delete',
            uri: 'at://did:example:alice/app.patchwork.aid.post/post-z',
            collection: recordNsid.aidPost,
        });

        expect(normalized.success).toBe(true);
        if (normalized.success) {
            expect(normalized.event.authorDid).toBe('did:example:alice');
        }
    });

    it('normalizes directory operational metadata for indexing/search', () => {
        const normalized = normalizeFirehoseEvent({
            seq: 51,
            action: 'create',
            uri: 'at://did:example:org/app.patchwork.directory.resource/resource-z',
            collection: recordNsid.directoryResource,
            authorDid: 'did:example:org',
            record: {
                $type: recordNsid.directoryResource,
                version: '1.1.0',
                name: 'Rapid Clinic',
                category: 'clinic',
                serviceArea: 'North zone',
                contact: {
                    phone: '+1-555-0101',
                },
                verificationStatus: 'partner-verified',
                location: {
                    latitude: 40.719,
                    longitude: -74.001,
                    precisionKm: 1.2,
                    areaLabel: 'North Zone',
                },
                openHours: '24/7',
                eligibilityNotes: 'Urgent cases prioritized',
                operationalStatus: 'open',
                createdAt: '2026-02-26T12:00:00.000Z',
            },
        });

        expect(normalized.success).toBe(true);
        if (normalized.success) {
            expect(normalized.event.payload).toMatchObject({
                kind: 'directory-resource',
                openHours: '24/7',
                eligibilityNotes: 'Urgent cases prioritized',
                operationalStatus: 'open',
            });
        }
    });

    it('redacts sensitive ingestion log fields and avoids raw AT URIs', () => {
        const consumer = new FirehoseConsumer();
        const result = consumer.ingest(buildPhase3FixtureFirehoseEvents());

        expect(result.logs.length).toBeGreaterThan(0);

        const infoLog = result.logs.find(log => log.level === 'info');
        expect(infoLog?.uri).toContain('at://[did]/');
        expect(infoLog?.uri).not.toContain('did:example');
        expect(infoLog?.uri).not.toContain('/post-a');
    });
});
