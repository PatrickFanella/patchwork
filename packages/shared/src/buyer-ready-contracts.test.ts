import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    exactLocationSignalSessionSchema,
    policyConsentSchema,
    publicLocationSchema,
    serverRecordMetadataSchema,
    transientPeerExactLocationSchema,
    visitorContentMutationSchema,
} from './buyer-ready-contracts.js';

const future = '2099-07-28T18:00:00.000Z';
const readFixture = (path: string): unknown =>
    JSON.parse(
        readFileSync(
            new URL(`./fixtures/buyer-ready/${path}`, import.meta.url),
            'utf8',
        ),
    );

describe('buyer-ready safety contracts', () => {
    it.each([
        {
            kind: 'approximate-personal',
            latitude: 41.88,
            longitude: -87.63,
            precisionKm: 2,
            areaLabel: 'Central Chicago',
            noPermanentAddress: false,
        },
        {
            kind: 'no-permanent-address',
            serviceArea: 'Cook County, Illinois',
            noPermanentAddress: true,
        },
        {
            kind: 'exact-public-resource',
            latitude: 41.881,
            longitude: -87.629,
            streetAddress: '100 Fictional Public Plaza',
            organizationVerification: 'active',
            resourceVerification: 'active',
            moderatorApproval: 'active',
            confidentialFacility: false,
            approvalExpiresAt: future,
        },
    ])('accepts the supported public location case', value => {
        expect(publicLocationSchema.parse(value)).toMatchObject(value);
    });

    it.each([
        {
            kind: 'approximate-personal',
            latitude: 41.88123,
            longitude: -87.62981,
            precisionKm: 0.01,
        },
        {
            kind: 'exact-public-resource',
            latitude: 41.881,
            longitude: -87.629,
            streetAddress: 'Confidential shelter',
            organizationVerification: 'active',
            resourceVerification: 'active',
            moderatorApproval: 'active',
            confidentialFacility: true,
            approvalExpiresAt: future,
        },
        {
            kind: 'exact-public-resource',
            latitude: 41.881,
            longitude: -87.629,
            streetAddress: 'Unapproved resource',
            organizationVerification: 'active',
            resourceVerification: 'active',
            moderatorApproval: 'pending',
            confidentialFacility: false,
            approvalExpiresAt: future,
        },
        {
            kind: 'no-permanent-address',
            serviceArea: 'Cook County, Illinois',
            noPermanentAddress: false,
        },
    ])('rejects unsafe or unauthorized public location state', value => {
        expect(publicLocationSchema.safeParse(value).success).toBe(false);
    });

    it.each([
        'valid/approximate-personal.json',
        'valid/exact-public-resource.json',
        'valid/no-permanent-address.json',
    ])('accepts executable public-location fixture %s', path => {
        expect(publicLocationSchema.safeParse(readFixture(path)).success).toBe(
            true,
        );
    });

    it.each([
        'invalid/exact-personal-public.json',
        'invalid/confidential-exact-public.json',
        'invalid/unapproved-exact-public.json',
    ])('rejects executable public-location fixture %s', path => {
        expect(publicLocationSchema.safeParse(readFixture(path)).success).toBe(
            false,
        );
    });

    it('accepts the executable transient exact-personal fixture only in the peer schema', () => {
        const fixture = readFixture(
            'valid/transient-exact-personal.json',
        );
        expect(
            transientPeerExactLocationSchema.safeParse(fixture).success,
        ).toBe(true);
        expect(publicLocationSchema.safeParse(fixture).success).toBe(false);
    });

    it('keeps exact coordinates out of signaling', () => {
        const signaling = {
            sessionId: '11111111-1111-4111-8111-111111111111',
            connectionId: '22222222-2222-4222-8222-222222222222',
            participantDids: ['did:plc:alice', 'did:plc:bob'],
            consentedDids: ['did:plc:alice', 'did:plc:bob'],
            issuedAt: '2026-07-28T17:00:00.000Z',
            expiresAt: '2026-07-28T17:04:00.000Z',
            singleUse: true,
            status: 'pending',
        };
        expect(exactLocationSignalSessionSchema.parse(signaling)).toEqual(
            signaling,
        );
        expect(
            exactLocationSignalSessionSchema.safeParse({
                ...signaling,
                latitude: 41.881,
                longitude: -87.629,
            }).success,
        ).toBe(false);
        expect(
            transientPeerExactLocationSchema.parse({
                latitude: 41.881,
                longitude: -87.629,
                capturedAt: '2026-07-28T17:01:00.000Z',
            }),
        ).toBeDefined();
    });

    it('requires current versioned 18+ consent', () => {
        expect(
            policyConsentSchema.parse({
                subjectDid: 'did:plc:alice',
                policyVersion: '2026-07-28',
                acceptedAt: '2026-07-28T17:00:00.000Z',
                eligibility: {
                    minimumAge: 18,
                    asserted18OrOlder: true,
                },
            }),
        ).toBeDefined();
        expect(
            policyConsentSchema.safeParse({
                subjectDid: 'did:plc:alice',
                policyVersion: '2026-07-28',
                acceptedAt: '2026-07-28T17:00:00.000Z',
                eligibility: {
                    minimumAge: 16,
                    asserted18OrOlder: true,
                },
            }).success,
        ).toBe(false);
    });

    it('rejects browser-forged origin, approval, and authorship', () => {
        expect(
            visitorContentMutationSchema.safeParse({
                content: { title: 'Help requested' },
                origin: 'sourced-public',
                moderatorApproval: 'active',
                actorDid: 'did:plc:attacker',
            }).success,
        ).toBe(false);
        expect(
            serverRecordMetadataSchema.safeParse({
                origin: 'sourced-public',
                assignedBy: 'browser',
                assignedAt: '2026-07-28T17:00:00.000Z',
            }).success,
        ).toBe(false);
    });
});
