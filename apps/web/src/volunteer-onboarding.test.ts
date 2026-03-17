import { describe, expect, it } from 'vitest';
import {
    buildVolunteerProfileCreatePayload,
    buildVolunteerProfileEditPayload,
    isVolunteerFullyVerified,
    summarizeCheckpoints,
    toVolunteerOnboardingDraftFromRecord,
    validateVolunteerOnboardingDraft,
    type VolunteerOnboardingDraft,
} from './volunteer-onboarding.js';

const baseDraft: VolunteerOnboardingDraft = {
    did: 'did:example:volunteer123',
    displayName: 'Ari',
    capabilities: ['transport', 'food-delivery'],
    availability: 'within-24h',
    contactPreference: 'chat-or-call',
    skills: ['First aid', 'Meal delivery'],
    availabilityWindows: ['weekday_evenings', 'weekend_mornings'],
    preferredCategories: ['medical', 'food'],
    preferredUrgencies: ['high', 'critical'],
    maxDistanceKm: 15,
    acceptsLateNight: true,
    checkpoints: {
        identityCheck: 'approved',
        safetyTraining: 'approved',
        communityReference: 'pending',
    },
};

describe('phase 6 volunteer onboarding web ux', () => {
    it('builds create payloads with skills/availability/checkpoint metadata', () => {
        const payload = buildVolunteerProfileCreatePayload(baseDraft, {
            now: '2026-02-26T08:30:00.000Z',
        });

        expect(payload.record.skills).toEqual(['First aid', 'Meal delivery']);
        expect(payload.record.availabilityWindows).toEqual([
            'weekday_evenings',
            'weekend_mornings',
        ]);
        expect(payload.record.createdAt).toBe('2026-02-26T08:30:00.000Z');
        expect(payload.checkpointSummary).toEqual({
            approved: 2,
            pending: 1,
            rejected: 0,
        });
        expect(isVolunteerFullyVerified(baseDraft.checkpoints)).toBe(false);
    });

    it('supports edit payloads while preserving createdAt', () => {
        const created = buildVolunteerProfileCreatePayload(baseDraft, {
            now: '2026-02-26T09:00:00.000Z',
        });

        const edited = buildVolunteerProfileEditPayload(
            created.record,
            {
                ...baseDraft,
                displayName: 'Ari N.',
                checkpoints: {
                    identityCheck: 'approved',
                    safetyTraining: 'approved',
                    communityReference: 'approved',
                },
            },
            { updatedAt: '2026-02-26T10:00:00.000Z' },
        );

        expect(edited.record.displayName).toBe('Ari N.');
        expect(edited.record.createdAt).toBe('2026-02-26T09:00:00.000Z');
        expect(edited.record.updatedAt).toBe('2026-02-26T10:00:00.000Z');
        expect(edited.checkpointSummary.approved).toBe(3);
    });

    it('validates incomplete onboarding drafts', () => {
        const result = validateVolunteerOnboardingDraft({
            ...baseDraft,
            did: 'invalid-did',
            displayName: '',
            capabilities: [],
            skills: [],
            availabilityWindows: [],
            preferredCategories: [],
            preferredUrgencies: [],
            maxDistanceKm: 0,
        });

        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('summarizes checkpoint states and restores draft from record', () => {
        const payload = buildVolunteerProfileCreatePayload(baseDraft);
        const draft = toVolunteerOnboardingDraftFromRecord(payload.record);
        const summary = summarizeCheckpoints(baseDraft.checkpoints);

        expect(draft.skills).toEqual(baseDraft.skills);
        expect(summary).toEqual({ approved: 2, pending: 1, rejected: 0 });
    });
});
