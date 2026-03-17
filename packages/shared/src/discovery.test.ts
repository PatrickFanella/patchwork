import { describe, expect, it } from 'vitest';
import {
    DiscoveryIndexStore,
    validateAidQueryInput,
    validateDirectoryQueryInput,
} from './discovery.js';
import {
    FirehoseConsumer,
    buildPhase3FixtureFirehoseEvents,
    type NormalizedFirehoseEvent,
} from './firehose.js';
import { recordNsid } from '@patchwork/at-lexicons';

const buildStore = (): DiscoveryIndexStore => {
    const consumer = new FirehoseConsumer();
    const ingested = consumer.ingest(buildPhase3FixtureFirehoseEvents());
    const store = new DiscoveryIndexStore();
    store.applyEvents(ingested.normalizedEvents);
    return store;
};

describe('P3.2/P3.3 discovery indexing + query APIs', () => {
    it('updates indexes correctly on create/update/delete lifecycle events', () => {
        const store = buildStore();
        const baseline = store.getStats();
        expect(baseline.aidRecords).toBe(2);
        expect(baseline.directoryRecords).toBe(2);

        const deleteEvent: NormalizedFirehoseEvent = {
            eventId: '6:delete:post-b',
            seq: 6,
            action: 'delete',
            uri: 'at://did:example:bob/app.patchwork.aid.post/post-b',
            collection: recordNsid.aidPost,
            authorDid: 'did:example:bob',
            receivedAt: '2026-02-26T12:05:00.000Z',
            deleteReason: 'resolved-offline',
        };

        store.applyEvent(deleteEvent);
        expect(store.getStats().aidRecords).toBe(1);

        const feed = store.queryFeed({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 25,
            nowIso: '2026-02-26T13:00:00.000Z',
        });
        expect(feed.items.every(item => item.uri !== deleteEvent.uri)).toBe(
            true,
        );
    });

    it('never exposes exact coordinates in map query output', () => {
        const store = buildStore();

        const map = store.queryMap({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 20,
            category: 'food',
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(map.items.length).toBeGreaterThan(0);
        expect(map.items[0]?.approximateGeo.latitude).not.toBe(40.713234);
        expect(map.items[0]?.approximateGeo.longitude).not.toBe(-74.00576);
    });

    it('returns deterministic pagination and stable sorting for feed', () => {
        const store = buildStore();

        const pageOne = store.queryFeed({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 50,
            page: 1,
            pageSize: 1,
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        const pageTwo = store.queryFeed({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 50,
            page: 2,
            pageSize: 1,
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        const rerunPageOne = store.queryFeed({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 50,
            page: 1,
            pageSize: 1,
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(pageOne.items[0]?.uri).not.toBe(pageTwo.items[0]?.uri);
        expect(rerunPageOne.items[0]?.uri).toBe(pageOne.items[0]?.uri);
    });

    it('supports directory query filters and deterministic ordering', () => {
        const store = buildStore();

        const filtered = store.queryDirectory({
            category: 'food-bank',
            status: 'community-verified',
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(filtered.total).toBe(1);
        expect(filtered.items[0]?.name).toContain('Pantry');
        expect(filtered.items[0]?.openHours).toContain('Mon-Fri');
        expect(filtered.items[0]?.eligibilityNotes).toContain('residents');
    });

    it('returns no aid results when any provided filter has zero matches', () => {
        const store = buildStore();

        const filtered = store.queryFeed({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 50,
            category: 'transport',
            status: 'in-progress',
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(filtered.total).toBe(0);
        expect(filtered.items).toEqual([]);
    });

    it('returns no directory results when any provided filter has zero matches', () => {
        const store = buildStore();

        const filtered = store.queryDirectory({
            category: 'nonexistent',
            status: 'community-verified',
            nowIso: '2026-02-26T13:00:00.000Z',
        });

        expect(filtered.total).toBe(0);
        expect(filtered.items).toEqual([]);
    });

    it('applies directory create/update/delete lifecycle events deterministically', () => {
        const store = buildStore();

        store.applyEvent({
            eventId: '6:create:directory-c',
            seq: 6,
            action: 'create',
            uri: 'at://did:example:ella/app.patchwork.directory.resource/resource-c',
            collection: recordNsid.directoryResource,
            authorDid: 'did:example:ella',
            receivedAt: '2026-02-26T12:06:00.000Z',
            payload: {
                kind: 'directory-resource',
                name: 'Late Night Food Hub',
                serviceArea: 'West district',
                category: 'food-bank',
                verificationStatus: 'partner-verified',
                contact: {
                    phone: '+1-555-0900',
                },
                approximateGeo: {
                    latitude: 40.715,
                    longitude: -74.001,
                    precisionKm: 1.8,
                },
                openHours: 'Daily 20:00-02:00',
                eligibilityNotes: 'Walk-ins welcome for emergency meals',
                operationalStatus: 'open',
                createdAt: '2026-02-26T12:06:00.000Z',
                updatedAt: '2026-02-26T12:06:00.000Z',
                searchableText:
                    'late night food hub west district food-bank partner-verified daily 20:00-02:00 walk-ins welcome emergency meals',
                trustScore: 0.88,
            },
        });

        const created = store.queryDirectory({
            searchText: 'emergency meals',
            nowIso: '2026-02-26T13:00:00.000Z',
        });
        expect(created.total).toBe(1);
        expect(created.items[0]?.name).toBe('Late Night Food Hub');

        store.applyEvent({
            eventId: '7:update:directory-c',
            seq: 7,
            action: 'update',
            uri: 'at://did:example:ella/app.patchwork.directory.resource/resource-c',
            collection: recordNsid.directoryResource,
            authorDid: 'did:example:ella',
            receivedAt: '2026-02-26T12:07:00.000Z',
            payload: {
                kind: 'directory-resource',
                name: 'Late Night Food Hub',
                serviceArea: 'West district',
                category: 'food-bank',
                verificationStatus: 'partner-verified',
                contact: {
                    phone: '+1-555-0900',
                },
                approximateGeo: {
                    latitude: 40.715,
                    longitude: -74.001,
                    precisionKm: 1.8,
                },
                openHours: 'Daily 18:00-03:00',
                eligibilityNotes: 'Emergency meals and grocery packs',
                operationalStatus: 'limited',
                createdAt: '2026-02-26T12:06:00.000Z',
                updatedAt: '2026-02-26T12:07:00.000Z',
                searchableText:
                    'late night food hub west district food-bank partner-verified daily 18:00-03:00 emergency meals grocery packs',
                trustScore: 0.88,
            },
        });

        const updated = store.queryDirectory({
            operationalStatus: 'limited',
            searchText: 'grocery packs',
            nowIso: '2026-02-26T13:00:00.000Z',
        });
        expect(updated.total).toBe(1);
        expect(updated.items[0]?.openHours).toContain('18:00-03:00');

        store.applyEvent({
            eventId: '8:delete:directory-c',
            seq: 8,
            action: 'delete',
            uri: 'at://did:example:ella/app.patchwork.directory.resource/resource-c',
            collection: recordNsid.directoryResource,
            authorDid: 'did:example:ella',
            receivedAt: '2026-02-26T12:08:00.000Z',
            deleteReason: 'closed-offline',
        });

        const deleted = store.queryDirectory({
            searchText: 'late night food hub',
            nowIso: '2026-02-26T13:00:00.000Z',
        });
        expect(deleted.total).toBe(0);
    });

    it('validates aid and directory query payloads', () => {
        expect(() =>
            validateAidQueryInput({
                latitude: 95,
                longitude: 0,
                radiusKm: 5,
            }),
        ).toThrow();

        expect(() =>
            validateDirectoryQueryInput({
                page: 0,
            }),
        ).toThrow();

        expect(() =>
            validateDirectoryQueryInput({
                latitude: 1.3,
                radiusKm: 5,
            }),
        ).toThrow();

        expect(
            validateAidQueryInput({
                latitude: 40.71,
                longitude: -74.0,
                radiusKm: 5,
                category: 'food',
                urgency: 'high',
            }),
        ).toMatchObject({ category: 'food', urgency: 'high' });
    });
});
