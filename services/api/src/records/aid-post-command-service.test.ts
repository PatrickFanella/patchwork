import { describe, expect, it, vi } from 'vitest';
import type { AidPostRecord } from '@patchwork/at-lexicons';
import {
    AidPostCommandService,
    type AidPostClient,
} from './aid-post-command-service.js';

const record: AidPostRecord = {
    $type: 'app.patchwork.aid.post',
    version: '1.0.0',
    title: 'Meal delivery',
    description: 'A meal delivery is needed this evening.',
    category: 'food',
    urgency: 'medium',
    status: 'open',
    location: { latitude: 41.88, longitude: -87.63, precisionKm: 1 },
    createdAt: '2026-07-10T12:00:00.000Z',
};

const client = (): AidPostClient => ({
    create: vi.fn(async value => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-created',
        record: value as AidPostRecord,
    })),
    get: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-current',
        record,
    })),
    update: vi.fn(async (_uri, _cid, value) => ({
        uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
        cid: 'bafy-updated',
        record: value as AidPostRecord,
    })),
    delete: vi.fn(async () => undefined),
});

describe('AidPostCommandService', () => {
    it('creates through the client restored from the opaque browser session', async () => {
        const at = client();
        const factory = vi.fn(async () => at);
        const service = new AidPostCommandService(factory);

        await expect(service.create('browser-session', record)).resolves.toMatchObject({
            cid: 'bafy-created',
        });
        expect(factory).toHaveBeenCalledWith('browser-session');
        expect(at.create).toHaveBeenCalledWith(record);
    });

    it('updates with the caller-provided expected CID', async () => {
        const at = client();
        const service = new AidPostCommandService(async () => at);

        await service.update('browser-session', {
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            expectedCid: 'bafy-current',
            record: { ...record, status: 'resolved' },
        });

        expect(at.update).toHaveBeenCalledWith(
            'at://did:plc:alice/app.patchwork.aid.post/3abc',
            'bafy-current',
            { ...record, status: 'resolved' },
        );
    });

    it('closes the current record using compare-and-swap', async () => {
        const at = client();
        const service = new AidPostCommandService(async () => at);

        await service.close('browser-session', {
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            expectedCid: 'bafy-current',
            updatedAt: '2026-07-10T13:00:00.000Z',
        });

        expect(at.get).toHaveBeenCalled();
        expect(at.update).toHaveBeenCalledWith(
            'at://did:plc:alice/app.patchwork.aid.post/3abc',
            'bafy-current',
            { ...record, status: 'closed', updatedAt: '2026-07-10T13:00:00.000Z' },
        );
    });

    it('deletes with compare-and-swap', async () => {
        const at = client();
        const service = new AidPostCommandService(async () => at);

        await service.delete('browser-session', {
            uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
            expectedCid: 'bafy-current',
        });

        expect(at.delete).toHaveBeenCalledWith(
            'at://did:plc:alice/app.patchwork.aid.post/3abc',
            'bafy-current',
        );
    });
});
