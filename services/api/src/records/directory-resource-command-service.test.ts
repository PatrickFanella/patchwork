import { describe, expect, it, vi } from 'vitest';
import type { DirectoryResourceRecord } from '@patchwork/at-lexicons';
import {
    DirectoryResourceCommandService,
    type DirectoryResourceClient,
} from './directory-resource-command-service.js';

const record: DirectoryResourceRecord = {
    $type: 'app.patchwork.directory.resource',
    version: '1.1.0',
    name: 'Northside Community Pantry',
    category: 'food-bank',
    serviceArea: 'Near North Side',
    contact: { phone: '312-555-0100' },
    verificationStatus: 'unverified',
    location: {
        latitude: 41.9,
        longitude: -87.64,
        precisionKm: 2,
    },
    operationalStatus: 'open',
    createdAt: '2026-07-28T12:00:00.000Z',
};

const client = (): DirectoryResourceClient => ({
    create: vi.fn(async value => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-created',
        record: value as DirectoryResourceRecord,
    })),
    get: vi.fn(async () => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-current',
        record: {
            ...record,
            verificationStatus: 'community-verified' as const,
        },
    })),
    update: vi.fn(async (_uri, _cid, value) => ({
        uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
        cid: 'bafy-updated',
        record: value as DirectoryResourceRecord,
    })),
    delete: vi.fn(async () => undefined),
});

describe('DirectoryResourceCommandService', () => {
    it('creates with a deterministic rkey and prevents self-verification', async () => {
        const at = client();
        const factory = vi.fn(async () => at);
        const service = new DirectoryResourceCommandService(factory);

        await service.create(
            'browser-session',
            { ...record, verificationStatus: 'partner-verified' },
            'request-123',
        );

        expect(factory).toHaveBeenCalledWith('browser-session');
        expect(at.create).toHaveBeenCalledWith(
            expect.objectContaining({ verificationStatus: 'unverified' }),
            expect.stringMatching(/^pw[a-f0-9]{22}$/),
        );
    });

    it('preserves server-read creation and verification state on update', async () => {
        const at = client();
        const service = new DirectoryResourceCommandService(async () => at);

        await service.update('browser-session', {
            uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
            expectedCid: 'bafy-current',
            record: {
                ...record,
                name: 'Updated Pantry',
                createdAt: '2030-01-01T00:00:00.000Z',
                verificationStatus: 'partner-verified',
            },
        });

        expect(at.get).toHaveBeenCalled();
        expect(at.update).toHaveBeenCalledWith(
            'at://did:plc:alice/app.patchwork.directory.resource/main',
            'bafy-current',
            expect.objectContaining({
                name: 'Updated Pantry',
                createdAt: record.createdAt,
                verificationStatus: 'community-verified',
            }),
        );
    });

    it('deletes owned resources with compare-and-swap', async () => {
        const at = client();
        const service = new DirectoryResourceCommandService(async () => at);

        await service.delete('browser-session', {
            uri: 'at://did:plc:alice/app.patchwork.directory.resource/main',
            expectedCid: 'bafy-current',
        });

        expect(at.delete).toHaveBeenCalledWith(
            'at://did:plc:alice/app.patchwork.directory.resource/main',
            'bafy-current',
        );
    });

    it('rejects aid-post URIs before restoring a client', async () => {
        const factory = vi.fn(async () => client());
        const service = new DirectoryResourceCommandService(factory);

        await expect(
            service.get(
                'browser-session',
                'at://did:plc:alice/app.patchwork.aid.post/main',
            ),
        ).rejects.toThrow();
        expect(factory).not.toHaveBeenCalled();
    });
});
