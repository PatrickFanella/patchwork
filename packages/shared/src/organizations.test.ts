import { describe, expect, it } from 'vitest';
import {
    organizationPublicProfileSchema,
    organizationRoleRank,
    resourceStewardshipSchema,
} from './organizations.js';

const base = {
    id: 'b7b8b206-c3c3-4ae7-8f29-6877b5a93531',
    slug: 'northside-mutual-aid',
    name: 'Northside Mutual Aid',
    description: 'Neighborhood resource coordination.',
    nonEndorsementLabel:
        'Listed for public information. Patchwork does not endorse or guarantee this organization.',
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
};

describe('durable organization contracts', () => {
    it('uses opaque organization IDs and real DIDs only for members and stewards', () => {
        expect(
            organizationPublicProfileSchema.parse({
                ...base,
                origin: 'visitor-created',
                provenance: null,
            }).id,
        ).toBe(base.id);
        expect(
            organizationPublicProfileSchema.safeParse({
                ...base,
                id: 'did:org:northside',
                origin: 'visitor-created',
                provenance: null,
            }).success,
        ).toBe(false);
        expect(
            resourceStewardshipSchema.safeParse({
                id: 'c7b8b206-c3c3-4ae7-8f29-6877b5a93531',
                organizationId: base.id,
                resourceUri:
                    'at://did:plc:resource-owner/app.patchwork.directory.resource/pantry',
                stewardDid: 'did:plc:real-steward',
                status: 'active',
                lastReconfirmedAt: base.createdAt,
                reconfirmDueAt: '2026-10-26T12:00:00.000Z',
                createdAt: base.createdAt,
                updatedAt: base.updatedAt,
            }).success,
        ).toBe(true);
    });

    it('requires provenance only for sourced public organizations', () => {
        expect(
            organizationPublicProfileSchema.safeParse({
                ...base,
                origin: 'sourced-public',
                provenance: null,
            }).success,
        ).toBe(false);
        expect(
            organizationPublicProfileSchema.safeParse({
                ...base,
                origin: 'sourced-public',
                provenance: {
                    sourceUrl: 'https://example.test/directory/northside',
                    retrievedAt: '2026-07-01T00:00:00.000Z',
                    lastVerifiedAt: '2026-07-20T00:00:00.000Z',
                },
            }).success,
        ).toBe(true);
        expect(
            organizationPublicProfileSchema.safeParse({
                ...base,
                origin: 'visitor-created',
                provenance: {
                    sourceUrl: 'https://example.test/forged',
                    retrievedAt: '2026-07-01T00:00:00.000Z',
                    lastVerifiedAt: '2026-07-20T00:00:00.000Z',
                },
            }).success,
        ).toBe(false);
    });

    it('orders owner, admin, steward, and member capabilities explicitly', () => {
        expect(organizationRoleRank.owner).toBeGreaterThan(
            organizationRoleRank.admin,
        );
        expect(organizationRoleRank.admin).toBeGreaterThan(
            organizationRoleRank.steward,
        );
        expect(organizationRoleRank.steward).toBeGreaterThan(
            organizationRoleRank.member,
        );
    });
});
