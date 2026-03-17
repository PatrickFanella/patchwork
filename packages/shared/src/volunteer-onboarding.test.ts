import { describe, expect, it } from 'vitest';
import {
    VolunteerOnboardingStore,
    buildVolunteerRoutingCandidates,
    summarizeVolunteerCheckpoints,
    type VolunteerOnboardingDraft,
} from './volunteer-onboarding.js';

const baseDraft: VolunteerOnboardingDraft = {
    did: 'did:example:volunteer-a',
    displayName: 'Ari',
    capabilities: ['transport', 'food-delivery'],
    availability: 'within-24h',
    contactPreference: 'chat-or-call',
    skills: ['route planning', 'meal delivery'],
    availabilityWindows: ['weekday_evenings', 'weekend_mornings'],
    verificationCheckpoints: {
        identityCheck: 'approved',
        safetyTraining: 'approved',
        communityReference: 'pending',
    },
    matchingPreferences: {
        preferredCategories: ['food', 'transport'],
        preferredUrgencies: ['medium', 'high', 'critical'],
        maxDistanceKm: 15,
        acceptsLateNight: true,
    },
};

describe('phase 6 volunteer onboarding + profile management', () => {
    it('creates and updates volunteer profiles with normalized data', () => {
        const store = new VolunteerOnboardingStore();

        const created = store.upsertProfile(baseDraft, {
            now: '2026-02-26T18:00:00.000Z',
        });

        expect(created.record.createdAt).toBe('2026-02-26T18:00:00.000Z');
        expect(created.record.skills).toEqual([
            'route planning',
            'meal delivery',
        ]);

        const updated = store.upsertProfile(
            {
                ...baseDraft,
                displayName: 'Ari N.',
                skills: ['route planning', 'route planning', 'meal delivery'],
                verificationCheckpoints: {
                    identityCheck: 'approved',
                    safetyTraining: 'approved',
                    communityReference: 'approved',
                },
            },
            { now: '2026-02-26T18:10:00.000Z' },
        );

        expect(updated.record.displayName).toBe('Ari N.');
        expect(updated.record.createdAt).toBe('2026-02-26T18:00:00.000Z');
        expect(updated.record.updatedAt).toBe('2026-02-26T18:10:00.000Z');
        expect(updated.record.skills).toEqual([
            'route planning',
            'meal delivery',
        ]);
    });

    it('rejects incomplete onboarding drafts via schema validation', () => {
        const store = new VolunteerOnboardingStore();

        expect(() =>
            store.upsertProfile({
                ...baseDraft,
                did: 'invalid-did',
                skills: [],
            }),
        ).toThrow();
    });

    it('builds preference-aware routing candidates from stored profiles', () => {
        const store = new VolunteerOnboardingStore();
        store.upsertProfile(baseDraft);
        store.upsertProfile({
            ...baseDraft,
            did: 'did:example:volunteer-b',
            displayName: 'Bo',
            capabilities: ['first-aid'],
            availability: 'immediate',
            matchingPreferences: {
                preferredCategories: ['medical'],
                preferredUrgencies: ['critical'],
                maxDistanceKm: 8,
                acceptsLateNight: false,
            },
        });

        const candidates = buildVolunteerRoutingCandidates(
            store.listProfiles(),
            {
                aidCategory: 'medical',
                urgency: 'critical',
                distanceKmByDid: {
                    'did:example:volunteer-a': 6,
                    'did:example:volunteer-b': 5,
                },
                isLateNight: false,
            },
        );

        expect(candidates).toHaveLength(2);
        expect(candidates[1]?.id).toBe('volunteer-b');
        expect(candidates[1]?.preferredCategories).toEqual(['medical']);
        expect(candidates[1]?.preferredUrgencyLevels).toEqual(['critical']);
        expect(candidates[1]?.maxDistanceKm).toBe(8);
    });

    it('summarizes verification checkpoints deterministically', () => {
        const summary = summarizeVolunteerCheckpoints({
            identityCheck: 'approved',
            safetyTraining: 'pending',
            communityReference: 'rejected',
        });

        expect(summary).toEqual({
            approved: 1,
            pending: 1,
            rejected: 1,
        });
    });
});
