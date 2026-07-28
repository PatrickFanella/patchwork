import { describe, expect, it } from 'vitest';
import {
    buildDirectoryResourceRecord,
    draftFromDirectoryResource,
    type DirectoryResourceDraft,
} from './directory-resource-form.js';

const draft: DirectoryResourceDraft = {
    name: 'Northside Community Pantry',
    category: 'food-bank',
    serviceArea: 'Near North Side',
    contactUrl: 'https://pantry.example',
    contactPhone: '',
    latitude: '41.9',
    longitude: '-87.64',
    precisionKm: '2',
    openHours: 'Mon-Fri 09:00-17:00',
    eligibilityNotes: 'Open to local residents.',
    operationalStatus: 'open',
};

describe('directory resource form', () => {
    it('builds an unverified privacy-safe public record', () => {
        const result = buildDirectoryResourceRecord(
            draft,
            '2026-07-28T12:00:00.000Z',
        );

        expect(result).toMatchObject({
            ok: true,
            issues: [],
            record: {
                verificationStatus: 'unverified',
                location: { precisionKm: 2 },
            },
        });
    });

    it('rejects exact coordinates and missing public contact', () => {
        const result = buildDirectoryResourceRecord(
            {
                ...draft,
                contactUrl: '',
                precisionKm: '0.25',
            },
            '2026-07-28T12:00:00.000Z',
        );

        expect(result.ok).toBe(false);
        expect(result.issues.join(' ')).toMatch(/1 and 50 kilometres/i);
        expect(result.issues.join(' ')).toMatch(/website or phone/i);
    });

    it('preserves verification and creation state when editing', () => {
        const created = buildDirectoryResourceRecord(
            draft,
            '2026-07-28T12:00:00.000Z',
        ).record!;
        const verified = {
            ...created,
            verificationStatus: 'community-verified' as const,
        };
        const result = buildDirectoryResourceRecord(
            { ...draftFromDirectoryResource(verified), name: 'Updated Pantry' },
            '2026-07-28T13:00:00.000Z',
            verified,
        );

        expect(result.record).toMatchObject({
            name: 'Updated Pantry',
            verificationStatus: 'community-verified',
            createdAt: '2026-07-28T12:00:00.000Z',
            updatedAt: '2026-07-28T13:00:00.000Z',
        });
    });
});
