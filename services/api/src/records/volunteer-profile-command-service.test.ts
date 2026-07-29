import { describe, expect, it, vi } from 'vitest';
import type { VolunteerProfileRecord } from '@patchwork/at-lexicons';
import {
    VolunteerProfileCommandService,
    type VolunteerPrivateProfile,
    type VolunteerPrivateProfileStore,
} from './volunteer-profile-command-service.js';

const profile = {
    displayName: 'Alex Rivera',
    bio: 'Neighborhood delivery volunteer.',
    capabilities: ['food-delivery'] as const,
    availability: 'within-24h' as const,
    contactPreference: 'chat-only' as const,
    skills: ['meal delivery'],
    languages: ['en', 'es'],
    serviceArea: {
        areaLabel: 'Near North Side',
        noPermanentAddress: true,
        latitude: 41.9,
        longitude: -87.64,
        precisionKm: 2,
    },
};

const privateProfile: VolunteerPrivateProfile = {
    contactEmail: 'alex@example.test',
    contactPhone: null,
    availabilityWindows: ['weekday_evenings'],
    matchingPreferences: {
        preferredCategories: ['food'],
        preferredUrgencies: ['medium', 'high'],
        maxDistanceKm: 12,
        acceptsLateNight: false,
    },
};

describe('VolunteerProfileCommandService', () => {
    it('publishes only public fields under the session owner and stores private matching data separately', async () => {
        const create = vi.fn(async (record: VolunteerProfileRecord) => ({
            uri: 'at://did:plc:alice/app.patchwork.volunteer.profile/main',
            cid: 'bafy-profile',
            record,
        }));
        const put = vi.fn(async () => undefined);
        const service = new VolunteerProfileCommandService(
            async () => ({
                create,
                get: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            }),
            {
                get: vi.fn(),
                put,
                delete: vi.fn(),
            } as VolunteerPrivateProfileStore,
        );

        const result = await service.create(
            'opaque-session',
            'did:plc:alice',
            { profile, privateProfile },
            'profile-command',
            new Date('2026-07-28T12:00:00.000Z'),
        );

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                $type: 'app.patchwork.volunteer.profile',
                version: '1.2.0',
                displayName: 'Alex Rivera',
                serviceArea: expect.objectContaining({ precisionKm: 2 }),
            }),
            expect.stringMatching(/^pw[0-9a-f]{22}$/),
        );
        const publicRecord = create.mock.calls[0]?.[0];
        expect(publicRecord).not.toHaveProperty('verificationCheckpoints');
        expect(publicRecord).not.toHaveProperty('matchingPreferences');
        expect(publicRecord).not.toHaveProperty('availabilityWindows');
        expect(publicRecord).not.toHaveProperty('contactEmail');
        expect(put).toHaveBeenCalledWith(
            'did:plc:alice',
            privateProfile,
        );
        expect(result.privateProfile).toEqual(privateProfile);
    });

    it('rejects forged identity, verification, and private fields at the public command boundary', async () => {
        const service = new VolunteerProfileCommandService(
            async () => ({
                create: vi.fn(),
                get: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            }),
            {
                get: vi.fn(),
                put: vi.fn(),
                delete: vi.fn(),
            },
        );
        for (const forged of [
            { did: 'did:plc:attacker' },
            {
                verificationCheckpoints: {
                    identityCheck: 'approved',
                    safetyTraining: 'approved',
                    communityReference: 'approved',
                },
            },
            { contactEmail: 'public@example.test' },
        ]) {
            await expect(
                service.create(
                    'opaque-session',
                    'did:plc:alice',
                    {
                        profile: { ...profile, ...forged },
                        privateProfile,
                    },
                    'command',
                ),
            ).rejects.toBeDefined();
        }
    });
});
