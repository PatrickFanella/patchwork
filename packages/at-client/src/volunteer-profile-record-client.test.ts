import { describe, expect, it, vi } from 'vitest';
import type { VolunteerProfileRecord } from '@patchwork/at-lexicons';
import {
    VolunteerProfileRecordClient,
    type AtVolunteerProfileTransport,
} from './index.js';

const record: VolunteerProfileRecord = {
    $type: 'app.patchwork.volunteer.profile',
    version: '1.2.0',
    displayName: 'Alex Rivera',
    bio: 'Neighborhood delivery volunteer.',
    capabilities: ['food-delivery'],
    availability: 'within-24h',
    contactPreference: 'chat-only',
    skills: ['meal delivery'],
    languages: ['en', 'es'],
    serviceArea: {
        areaLabel: 'Near North Side',
        noPermanentAddress: true,
        latitude: 41.9,
        longitude: -87.64,
        precisionKm: 2,
    },
    createdAt: '2026-07-28T12:00:00.000Z',
};

const transport = (): AtVolunteerProfileTransport => ({
    did: 'did:plc:alice',
    createRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.volunteer.profile/main',
        cid: 'bafy-created',
    })),
    getRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.volunteer.profile/main',
        cid: 'bafy-current',
        value: record,
    })),
    putRecord: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.volunteer.profile/main',
        cid: 'bafy-updated',
    })),
    deleteRecord: vi.fn(async () => undefined),
});

describe('VolunteerProfileRecordClient', () => {
    it('creates deterministic owned records and uses compare-and-swap', async () => {
        const at = transport();
        const client = new VolunteerProfileRecordClient(at);
        const uri =
            'at://did:plc:alice/app.patchwork.volunteer.profile/main';

        await client.create(record, 'main');
        await client.update(uri, 'bafy-current', {
            ...record,
            availability: 'scheduled',
        });
        await client.delete(uri, 'bafy-updated');

        expect(at.putRecord).toHaveBeenNthCalledWith(1, {
            repo: 'did:plc:alice',
            collection: 'app.patchwork.volunteer.profile',
            rkey: 'main',
            record,
        });
        expect(at.putRecord).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                repo: 'did:plc:alice',
                rkey: 'main',
                swapRecord: 'bafy-current',
            }),
        );
        expect(at.deleteRecord).toHaveBeenCalledWith(
            expect.objectContaining({ swapRecord: 'bafy-updated' }),
        );
    });

    it('rejects cross-repository access and undeclared private fields', async () => {
        const at = transport();
        const client = new VolunteerProfileRecordClient(at);
        await expect(
            client.get(
                'at://did:plc:bob/app.patchwork.volunteer.profile/main',
            ),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        await expect(
            client.create({ ...record, privatePhone: '312-555-0100' }),
        ).rejects.toMatchObject({ code: 'INVALID_RECORD' });
        expect(at.getRecord).not.toHaveBeenCalled();
    });
});
