import { describe, expect, it, vi } from 'vitest';
import { type AidPostRecord } from '@patchwork/at-lexicons';
import {
    AidPostRecordClient,
    decodeAidPostFromAt,
    encodeAidPostForAt,
    type AtRecordTransport,
} from './index.js';

const validRecord: AidPostRecord = {
    $type: 'app.patchwork.aid.post',
    version: '1.0.0',
    title: 'Grocery delivery needed',
    description: 'Need a grocery delivery this afternoon.',
    category: 'food',
    urgency: 'medium',
    status: 'open',
    location: {
        latitude: 41.88,
        longitude: -87.63,
        precisionKm: 1,
    },
    createdAt: '2026-07-10T12:00:00.000Z',
};

const transport = (): AtRecordTransport => ({
    did: 'did:plc:alice',
    createRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-create',
    })),
    getRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-current',
        value: validRecord,
    })),
    putRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-updated',
    })),
    deleteRecord: vi.fn(async () => undefined),
});

describe('AidPostRecordClient', () => {
    it('encodes decimal coordinates as AT-compatible integers and decodes them', () => {
        const encoded = encodeAidPostForAt(validRecord);

        expect(encoded.location).toEqual({
            latitudeE6: 41_880_000,
            longitudeE6: -87_630_000,
            precisionMeters: 1_000,
        });
        expect(decodeAidPostFromAt(encoded)).toEqual(validRecord);
    });

    it('validates and creates an aid-post record in the authenticated repository', async () => {
        const at = transport();
        const client = new AidPostRecordClient(at);

        await expect(client.create(validRecord)).resolves.toEqual({
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            cid: 'bafy-create',
            record: validRecord,
        });
        expect(at.createRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.aid.post',
            record: validRecord,
        });
    });

    it('uses a deterministic put when an idempotent create key is supplied', async () => {
        const at = transport();
        const client = new AidPostRecordClient(at);

        await client.create(validRecord, 'pw123');

        expect(at.createRecord).not.toHaveBeenCalled();
        expect(at.putRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.aid.post',
            rkey: 'pw123',
            record: validRecord,
        });
    });

    it('rejects a public record below the alpha one-kilometre precision floor', async () => {
        const client = new AidPostRecordClient(transport());

        await expect(
            client.create({
                ...validRecord,
                location: { ...validRecord.location, precisionKm: 0.5 },
            }),
        ).rejects.toMatchObject({
            code: 'INVALID_RECORD',
            retryable: false,
        });
    });

    it('rejects private exact-location fields in the public record', async () => {
        const client = new AidPostRecordClient(transport());

        await expect(
            client.create({
                ...validRecord,
                location: {
                    ...validRecord.location,
                    exactLatitude: 41.881234,
                },
            }),
        ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    });

    it('validates records returned by the PDS', async () => {
        const at = transport();
        vi.mocked(at.getRecord).mockResolvedValueOnce({
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            cid: 'bafy-invalid',
            value: { ...validRecord, title: '' },
        });
        const client = new AidPostRecordClient(at);

        await expect(
            client.get('at://did:plc:alice/app.patchwork.aid.post/3abc'),
        ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
    });

    it('uses compare-and-swap when updating a record', async () => {
        const at = transport();
        const client = new AidPostRecordClient(at);
        const updated = {
            ...validRecord,
            status: 'resolved' as const,
            updatedAt: '2026-07-10T13:00:00.000Z',
        };

        await expect(
            client.update(
                'at://did:plc:alice/app.patchwork.aid.post/3abc',
                'bafy-current',
                updated,
            ),
        ).resolves.toEqual({
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            cid: 'bafy-updated',
            record: updated,
        });
        expect(at.putRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.aid.post',
            rkey: '3abc',
            record: updated,
            swapRecord: 'bafy-current',
        });
    });

    it('maps a stale revision conflict to a stable error', async () => {
        const at = transport();
        vi.mocked(at.putRecord).mockRejectedValueOnce(
            Object.assign(new Error('InvalidSwap'), { status: 409 }),
        );
        const client = new AidPostRecordClient(at);

        await expect(
            client.update(
                'at://did:plc:alice/app.patchwork.aid.post/3abc',
                'bafy-stale',
                validRecord,
            ),
        ).rejects.toMatchObject({
            code: 'REVISION_CONFLICT',
            retryable: false,
        });
    });

    it('prevents the authenticated account from mutating another repository', async () => {
        const at = transport();
        const client = new AidPostRecordClient(at);

        await expect(
            client.update(
                'at://did:plc:bob/app.patchwork.aid.post/3abc',
                'bafy-current',
                validRecord,
            ),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(at.putRecord).not.toHaveBeenCalled();
    });

    it('deletes with compare-and-swap', async () => {
        const at = transport();
        const client = new AidPostRecordClient(at);

        await client.delete(
            'at://did:plc:alice/app.patchwork.aid.post/3abc',
            'bafy-current',
        );

        expect(at.deleteRecord).toHaveBeenCalledWith({
            repo: 'did:plc:alice',
            collection: 'app.patchwork.aid.post',
            rkey: '3abc',
            swapRecord: 'bafy-current',
        });
    });

    it('maps PDS unavailability as retryable', async () => {
        const at = transport();
        vi.mocked(at.createRecord).mockRejectedValueOnce(
            Object.assign(new Error('upstream unavailable'), { status: 503 }),
        );
        const client = new AidPostRecordClient(at);

        await expect(client.create(validRecord)).rejects.toMatchObject({
            code: 'PDS_UNAVAILABLE',
            retryable: true,
        });
    });
});
