import { describe, expect, it } from 'vitest';
import { recordNsid } from '@patchwork/at-lexicons';
import { AtRecordRepository, RecordWriteError } from './records.js';

const baseAidPost = {
    $type: recordNsid.aidPost,
    version: '1.0.0' as const,
    title: 'Need groceries for two days',
    description: 'Requesting non-perishable groceries near transit.',
    category: 'food' as const,
    urgency: 'high' as const,
    status: 'open' as const,
    location: {
        latitude: 40.7128,
        longitude: -74.006,
        precisionKm: 3,
    },
    createdAt: '2026-02-26T10:00:00.000Z',
};

describe('P2.3/P2.4 CRUD + tombstone contract', () => {
    it('creates valid records and retrieves active state', () => {
        const repository = new AtRecordRepository();

        const created = repository.createRecord({
            collection: recordNsid.aidPost,
            authorDid: 'did:example:alice',
            value: baseAidPost,
        });

        expect(created.version).toBe(1);
        expect(created.lifecycle).toBe('active');

        const fetched = repository.getActiveRecord(created.uri);
        expect(
            (fetched?.value as typeof baseAidPost | undefined)?.title,
        ).toContain('groceries');
    });

    it('rejects invalid payloads with structured validation errors', () => {
        const repository = new AtRecordRepository();

        expect(() =>
            repository.createRecord({
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
                value: {
                    ...baseAidPost,
                    urgency: 'urgent',
                },
            }),
        ).toThrowError(RecordWriteError);

        try {
            repository.createRecord({
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
                value: {
                    ...baseAidPost,
                    urgency: 'urgent',
                },
            });
        } catch (error) {
            const typed = error as RecordWriteError;
            expect(typed.code).toBe('VALIDATION_FAILED');
        }
    });

    it('prevents invalid aid-post status transitions', () => {
        const repository = new AtRecordRepository();

        const created = repository.createRecord({
            collection: recordNsid.aidPost,
            authorDid: 'did:example:alice',
            value: baseAidPost,
        });

        const closed = repository.updateRecord({
            uri: created.uri,
            updatedByDid: 'did:example:alice',
            value: {
                ...baseAidPost,
                status: 'closed',
                updatedAt: '2026-02-26T10:10:00.000Z',
            },
        });

        expect((closed.value as typeof baseAidPost).status).toBe('closed');

        expect(() =>
            repository.updateRecord({
                uri: created.uri,
                updatedByDid: 'did:example:alice',
                value: {
                    ...baseAidPost,
                    status: 'open',
                    updatedAt: '2026-02-26T10:15:00.000Z',
                },
            }),
        ).toThrowError(RecordWriteError);

        try {
            repository.updateRecord({
                uri: created.uri,
                updatedByDid: 'did:example:alice',
                value: {
                    ...baseAidPost,
                    status: 'open',
                    updatedAt: '2026-02-26T10:15:00.000Z',
                },
            });
        } catch (error) {
            const typed = error as RecordWriteError;
            expect(typed.code).toBe('INVALID_TRANSITION');
        }
    });

    it('emits deterministic tombstones and supports round-trip event serialization', () => {
        const repository = new AtRecordRepository();

        const created = repository.createRecord({
            collection: recordNsid.aidPost,
            authorDid: 'did:example:alice',
            value: baseAidPost,
            rkey: 'fixed-rkey',
        });

        const tombstone = repository.deleteRecord({
            uri: created.uri,
            deletedByDid: 'did:example:alice',
            reason: 'resolved-offline',
        });

        expect(tombstone.$type).toBe('app.patchwork.system.tombstone');
        expect(repository.getActiveRecord(created.uri)).toBeNull();

        const events = repository.listMutationEvents();
        const deletedEvent = events[events.length - 1];
        expect(deletedEvent.type).toBe('record.deleted');

        const serialized = repository.serializeMutationEvent(deletedEvent);
        const roundTrip = repository.deserializeMutationEvent(serialized);

        expect(roundTrip).toEqual(deletedEvent);
    });

    it('prevents tombstoned records from resurfacing', () => {
        const repository = new AtRecordRepository();

        const created = repository.createRecord({
            collection: recordNsid.aidPost,
            authorDid: 'did:example:alice',
            value: baseAidPost,
            rkey: 'fixed-rkey',
        });

        repository.deleteRecord({
            uri: created.uri,
            deletedByDid: 'did:example:alice',
            reason: 'duplicate',
        });

        expect(() =>
            repository.updateRecord({
                uri: created.uri,
                updatedByDid: 'did:example:alice',
                value: {
                    ...baseAidPost,
                    updatedAt: '2026-02-26T10:20:00.000Z',
                },
            }),
        ).toThrowError(RecordWriteError);

        expect(() =>
            repository.createRecord({
                collection: recordNsid.aidPost,
                authorDid: 'did:example:alice',
                value: baseAidPost,
                rkey: 'fixed-rkey',
            }),
        ).toThrowError(RecordWriteError);
    });
});
