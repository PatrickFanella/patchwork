import { z } from 'zod';
import {
    recordNsid,
    type AidPostRecord,
    type VolunteerProfileRecord,
    validateRecordPayload,
} from '@patchwork/at-lexicons';
import type { VolunteerRoutingCandidate } from './messaging.js';
import { capabilitySupportsAidCategory } from './category-policy.js';
import { deepClone } from './clone.js';
import { didSchema } from './schemas.js';

const capabilitySchema = z.enum([
    'transport',
    'food-delivery',
    'translation',
    'first-aid',
    'childcare',
    'other',
]);

const checkpointStatusSchema = z.enum(['pending', 'approved', 'rejected']);

const matchingPreferencesSchema = z.object({
    preferredCategories: z
        .array(
            z.enum([
                'food',
                'shelter',
                'medical',
                'transport',
                'childcare',
                'other',
            ]),
        )
        .min(1),
    preferredUrgencies: z
        .array(z.enum(['low', 'medium', 'high', 'critical']))
        .min(1),
    maxDistanceKm: z.number().min(1).max(250),
    acceptsLateNight: z.boolean().optional(),
});

const volunteerOnboardingDraftSchema = z.object({
    did: didSchema,
    displayName: z.string().trim().min(1).max(80),
    capabilities: z.array(capabilitySchema).min(1),
    availability: z.enum([
        'immediate',
        'within-24h',
        'scheduled',
        'unavailable',
    ]),
    contactPreference: z.enum(['chat-only', 'chat-or-call']),
    skills: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
    availabilityWindows: z
        .array(z.string().trim().min(1).max(64))
        .min(1)
        .max(50),
    verificationCheckpoints: z.object({
        identityCheck: checkpointStatusSchema,
        safetyTraining: checkpointStatusSchema,
        communityReference: checkpointStatusSchema,
    }),
    matchingPreferences: matchingPreferencesSchema,
    notes: z.string().trim().max(500).optional(),
});

export type VolunteerOnboardingDraft = z.infer<
    typeof volunteerOnboardingDraftSchema
>;

export interface VolunteerProfileEntry {
    did: string;
    record: VolunteerProfileRecord;
    verificationCheckpoints: VolunteerOnboardingDraft['verificationCheckpoints'];
    matchingPreferences: VolunteerOnboardingDraft['matchingPreferences'];
    updatedAt: string;
}

export interface VolunteerCheckpointSummary {
    approved: number;
    pending: number;
    rejected: number;
}

const normalizeStringList = (values: readonly string[]): string[] => {
    const seen = new Map<string, string>();

    for (const raw of values) {
        const normalized = raw.trim();
        if (normalized.length === 0) {
            continue;
        }
        const key = normalized.toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, normalized);
        }
    }

    return [...seen.values()];
};

const normalizeDraft = (
    input: VolunteerOnboardingDraft,
): VolunteerOnboardingDraft => {
    const parsed = volunteerOnboardingDraftSchema.parse(input);

    return {
        ...parsed,
        skills: normalizeStringList(parsed.skills),
        availabilityWindows: normalizeStringList(parsed.availabilityWindows),
    };
};

export const summarizeVolunteerCheckpoints = (
    checkpoints: VolunteerOnboardingDraft['verificationCheckpoints'],
): VolunteerCheckpointSummary => {
    const statuses = Object.values(checkpoints);
    return {
        approved: statuses.filter(status => status === 'approved').length,
        pending: statuses.filter(status => status === 'pending').length,
        rejected: statuses.filter(status => status === 'rejected').length,
    };
};

const toRoutingCandidateId = (did: string): string => {
    const token = did.split(':').at(-1);
    return token && token.length > 0 ? token : did;
};

export interface VolunteerRoutingSelectionInput {
    aidCategory: AidPostRecord['category'];
    urgency: AidPostRecord['urgency'];
    isLateNight?: boolean;
    distanceKmByDid?: Record<string, number>;
}

export const buildVolunteerRoutingCandidates = (
    profiles: readonly VolunteerProfileEntry[],
    input: VolunteerRoutingSelectionInput,
): VolunteerRoutingCandidate[] => {
    const result: VolunteerRoutingCandidate[] = [];

    for (const profile of profiles) {
        if (
            input.isLateNight &&
            profile.matchingPreferences.acceptsLateNight === false
        ) {
            continue;
        }

        const distanceKm = input.distanceKmByDid?.[profile.did];

        const checkpointSummary = summarizeVolunteerCheckpoints(
            profile.verificationCheckpoints,
        );

        const verificationCheckpointScore =
            checkpointSummary.approved /
            Math.max(
                1,
                checkpointSummary.approved +
                    checkpointSummary.pending +
                    checkpointSummary.rejected,
            );

        const capabilityMatch = profile.record.capabilities.some(capability =>
            capabilitySupportsAidCategory(capability, input.aidCategory),
        );
        const preferenceMatch =
            profile.matchingPreferences.preferredCategories.includes(
                input.aidCategory,
            );

        result.push({
            id: toRoutingCandidateId(profile.did),
            did: profile.did,
            availability: profile.record.availability,
            trustScore: Number(
                (0.5 + verificationCheckpointScore * 0.4).toFixed(3),
            ),
            matchesCategory: capabilityMatch || preferenceMatch,
            preferredCategories: [
                ...profile.matchingPreferences.preferredCategories,
            ],
            preferredUrgencyLevels: [
                ...profile.matchingPreferences.preferredUrgencies,
            ],
            maxDistanceKm: profile.matchingPreferences.maxDistanceKm,
            distanceKm,
            verificationCheckpointScore: Number(
                verificationCheckpointScore.toFixed(3),
            ),
        });
    }

    return result.sort((left, right) => left.id.localeCompare(right.id));
};

export class VolunteerOnboardingStore {
    private readonly entries = new Map<string, VolunteerProfileEntry>();

    upsertProfile(
        input: VolunteerOnboardingDraft,
        options: { now?: string } = {},
    ): VolunteerProfileEntry {
        const normalized = normalizeDraft(input);
        const now = options.now ?? new Date().toISOString();
        const existing = this.entries.get(normalized.did);

        const recordCandidate: VolunteerProfileRecord = {
            $type: recordNsid.volunteerProfile,
            version: '1.1.0',
            displayName: normalized.displayName,
            capabilities: normalized.capabilities,
            availability: normalized.availability,
            contactPreference: normalized.contactPreference,
            skills: normalized.skills,
            availabilityWindows: normalized.availabilityWindows,
            verificationCheckpoints: normalized.verificationCheckpoints,
            matchingPreferences: normalized.matchingPreferences,
            notes: normalized.notes,
            createdAt: existing?.record.createdAt ?? now,
            updatedAt: now,
        };

        const record = validateRecordPayload(
            recordNsid.volunteerProfile,
            recordCandidate,
        );

        const entry: VolunteerProfileEntry = {
            did: normalized.did,
            record,
            verificationCheckpoints: normalized.verificationCheckpoints,
            matchingPreferences: normalized.matchingPreferences,
            updatedAt: now,
        };

        this.entries.set(normalized.did, entry);
        return deepClone(entry);
    }

    getProfile(did: string): VolunteerProfileEntry | null {
        const parsedDid = didSchema.parse(did);
        const found = this.entries.get(parsedDid);
        return found ? deepClone(found) : null;
    }

    listProfiles(): VolunteerProfileEntry[] {
        return [...this.entries.values()]
            .sort((left, right) => left.did.localeCompare(right.did))
            .map(value => deepClone(value));
    }
}
