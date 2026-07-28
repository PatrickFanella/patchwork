import { describe, expect, it, vi } from 'vitest';
import {
    decodeDirectoryResourceFromAt,
    encodeDirectoryResourceForAt,
    type DirectoryResourceRecord,
} from '@patchwork/at-lexicons';
import {
    DirectoryResourceRecordClient,
    type AtDirectoryRecordTransport,
} from './index.js';

const record: DirectoryResourceRecord = {
    $type: 'app.patchwork.directory.resource',
    version: '1.1.0',
    name: 'Northside Community Pantry',
    category: 'food-bank',
    serviceArea: 'Near North Side',
    contact: { url: 'https://pantry.example' },
    verificationStatus: 'unverified',
    location: {
        latitude: 41.9,
        longitude: -87.64,
        precisionKm: 2,
        areaLabel: 'Near North Side',
    },
    openHours: 'Mon-Fri 09:00-17:00',
    operationalStatus: 'open',
    createdAt: '2026-07-28T12:00:00.000Z',
};

const transport = (): AtDirectoryRecordTransport => ({
    did: 'did:plc:alice',
    createRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-created',
    })),
    getRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-current',
        value: record,
    })),
    putRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-updated',
    })),
    deleteRecord: vi.fn(async () => undefined),
});

describe('DirectoryResourceRecordClient', () => {
    it('round-trips privacy-safe coordinates through the AT integer wire shape', () => {
        const encoded = encodeDirectoryResourceForAt(record);
        expect(encoded.location).toEqual({
            latitudeE6: 41_900_000,
            longitudeE6: -87_640_000,
            precisionMeters: 2_000,
            areaLabel: 'Near North Side',
        });
        expect(decodeDirectoryResourceFromAt(encoded)).toEqual(record);
    });

    it('creates in the authenticated repository with deterministic rkeys', async () => {
        const at = transport();
        const client = new DirectoryResourceRecordClient(at);

        await expect(client.create(record, 'pw-directory')).resolves.toMatchObject({
            cid: 'bafy-updated',
            record,
        });
        expect(at.putRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.directory.resource',
            rkey: 'pw-directory',
            record,
        });
    });

    it('rejects exact public coordinates below the alpha precision floor', async () => {
        const client = new DirectoryResourceRecordClient(transport());
        await expect(
            client.create({
                ...record,
                location: { ...record.location!, precisionKm: 0.25 },
            }),
        ).rejects.toMatchObject({
            code: 'INVALID_RECORD',
            retryable: false,
        });
    });

    it('rejects undeclared private fields', async () => {
        const client = new DirectoryResourceRecordClient(transport());
        await expect(
            client.create({
                ...record,
                privateContactName: 'Do not publish',
            }),
        ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    });

    it('uses compare-and-swap for owned updates and deletes', async () => {
        const at = transport();
        const client = new DirectoryResourceRecordClient(at);
        const uri =
            'at://did:plc:alice/app.patchwork.directory.resource/main';
        const updated = {
            ...record,
            operationalStatus: 'limited' as const,
            updatedAt: '2026-07-28T13:00:00.000Z',
        };

        await client.update(uri, 'bafy-current', updated);
        await client.delete(uri, 'bafy-updated');

        expect(at.putRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.directory.resource',
            rkey: 'main',
            swapRecord: 'bafy-current',
            record: updated,
        });
        expect(at.deleteRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.directory.resource',
            rkey: 'main',
            swapRecord: 'bafy-updated',
        });
    });

    it('prevents cross-repository reads and mutations', async () => {
        const at = transport();
        const client = new DirectoryResourceRecordClient(at);
        await expect(
            client.get(
                'at://did:plc:bob/app.patchwork.directory.resource/main',
            ),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(at.getRecord).not.toHaveBeenCalled();
    });
});
