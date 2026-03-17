import {
    recordNsid,
    type AidPostRecord,
    type VolunteerProfileRecord,
    validateRecordPayload,
} from '@patchwork/at-lexicons';

const didPattern = /^did:[a-z0-9:._%-]+$/i;

export interface VolunteerVerificationCheckpoints {
    identityCheck: 'pending' | 'approved' | 'rejected';
    safetyTraining: 'pending' | 'approved' | 'rejected';
    communityReference: 'pending' | 'approved' | 'rejected';
}

export interface VolunteerOnboardingDraft {
    did: string;
    displayName: string;
    capabilities: VolunteerProfileRecord['capabilities'];
    availability: VolunteerProfileRecord['availability'];
    contactPreference: VolunteerProfileRecord['contactPreference'];
    skills: string[];
    availabilityWindows: string[];
    preferredCategories: AidPostRecord['category'][];
    preferredUrgencies: AidPostRecord['urgency'][];
    maxDistanceKm: number;
    acceptsLateNight: boolean;
    checkpoints: VolunteerVerificationCheckpoints;
    notes?: string;
}

export interface VolunteerOnboardingValidationIssue {
    field:
        | 'did'
        | 'displayName'
        | 'capabilities'
        | 'skills'
        | 'availabilityWindows'
        | 'preferences';
    message: string;
}

export interface VolunteerOnboardingValidationResult {
    ok: boolean;
    errors: readonly VolunteerOnboardingValidationIssue[];
}

export interface VolunteerCheckpointSummary {
    approved: number;
    pending: number;
    rejected: number;
}

const normalizeTextList = (values: readonly string[]): string[] => {
    const deduped = new Map<string, string>();

    for (const rawValue of values) {
        const value = rawValue.trim();
        if (value.length === 0) {
            continue;
        }

        const key = value.toLowerCase();
        if (!deduped.has(key)) {
            deduped.set(key, value);
        }
    }

    return [...deduped.values()];
};

export const summarizeCheckpoints = (
    checkpoints: VolunteerVerificationCheckpoints,
): VolunteerCheckpointSummary => {
    const statuses = Object.values(checkpoints);
    return {
        approved: statuses.filter(status => status === 'approved').length,
        pending: statuses.filter(status => status === 'pending').length,
        rejected: statuses.filter(status => status === 'rejected').length,
    };
};

export const isVolunteerFullyVerified = (
    checkpoints: VolunteerVerificationCheckpoints,
): boolean => {
    const summary = summarizeCheckpoints(checkpoints);
    return summary.pending === 0 && summary.rejected === 0;
};

export const validateVolunteerOnboardingDraft = (
    draft: VolunteerOnboardingDraft,
): VolunteerOnboardingValidationResult => {
    const errors: VolunteerOnboardingValidationIssue[] = [];

    if (!didPattern.test(draft.did.trim())) {
        errors.push({
            field: 'did',
            message: 'DID is required and must use a valid did:* format',
        });
    }

    if (
        draft.displayName.trim().length === 0 ||
        draft.displayName.length > 80
    ) {
        errors.push({
            field: 'displayName',
            message: 'Display name is required and must be <= 80 characters',
        });
    }

    if (draft.capabilities.length === 0) {
        errors.push({
            field: 'capabilities',
            message: 'At least one capability is required',
        });
    }

    if (normalizeTextList(draft.skills).length === 0) {
        errors.push({
            field: 'skills',
            message: 'At least one skill is required',
        });
    }

    if (normalizeTextList(draft.availabilityWindows).length === 0) {
        errors.push({
            field: 'availabilityWindows',
            message: 'At least one availability window is required',
        });
    }

    if (
        draft.preferredCategories.length === 0 ||
        draft.preferredUrgencies.length === 0 ||
        draft.maxDistanceKm <= 0
    ) {
        errors.push({
            field: 'preferences',
            message:
                'Preferred categories/urgencies and max distance are required',
        });
    }

    return {
        ok: errors.length === 0,
        errors,
    };
};

export const buildVolunteerProfileCreatePayload = (
    draft: VolunteerOnboardingDraft,
    options: { now?: string } = {},
): {
    record: VolunteerProfileRecord;
    checkpointSummary: VolunteerCheckpointSummary;
} => {
    const validation = validateVolunteerOnboardingDraft(draft);
    if (!validation.ok) {
        throw new Error(
            validation.errors.map(issue => issue.message).join('; '),
        );
    }

    const now = options.now ?? new Date().toISOString();

    const record = validateRecordPayload(recordNsid.volunteerProfile, {
        $type: recordNsid.volunteerProfile,
        version: '1.1.0',
        displayName: draft.displayName.trim(),
        capabilities: draft.capabilities,
        availability: draft.availability,
        contactPreference: draft.contactPreference,
        skills: normalizeTextList(draft.skills),
        availabilityWindows: normalizeTextList(draft.availabilityWindows),
        verificationCheckpoints: draft.checkpoints,
        matchingPreferences: {
            preferredCategories: [...draft.preferredCategories],
            preferredUrgencies: [...draft.preferredUrgencies],
            maxDistanceKm: draft.maxDistanceKm,
            acceptsLateNight: draft.acceptsLateNight,
        },
        notes: draft.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
    });

    return {
        record,
        checkpointSummary: summarizeCheckpoints(draft.checkpoints),
    };
};

export const buildVolunteerProfileEditPayload = (
    existingRecord: VolunteerProfileRecord,
    draft: VolunteerOnboardingDraft,
    options: { updatedAt?: string } = {},
): {
    record: VolunteerProfileRecord;
    checkpointSummary: VolunteerCheckpointSummary;
} => {
    const validation = validateVolunteerOnboardingDraft(draft);
    if (!validation.ok) {
        throw new Error(
            validation.errors.map(issue => issue.message).join('; '),
        );
    }

    const updatedAt = options.updatedAt ?? new Date().toISOString();

    const record = validateRecordPayload(recordNsid.volunteerProfile, {
        $type: recordNsid.volunteerProfile,
        version: '1.1.0',
        displayName: draft.displayName.trim(),
        capabilities: draft.capabilities,
        availability: draft.availability,
        contactPreference: draft.contactPreference,
        skills: normalizeTextList(draft.skills),
        availabilityWindows: normalizeTextList(draft.availabilityWindows),
        verificationCheckpoints: draft.checkpoints,
        matchingPreferences: {
            preferredCategories: [...draft.preferredCategories],
            preferredUrgencies: [...draft.preferredUrgencies],
            maxDistanceKm: draft.maxDistanceKm,
            acceptsLateNight: draft.acceptsLateNight,
        },
        notes: draft.notes?.trim() || undefined,
        createdAt: existingRecord.createdAt,
        updatedAt,
    });

    return {
        record,
        checkpointSummary: summarizeCheckpoints(draft.checkpoints),
    };
};

export const toVolunteerOnboardingDraftFromRecord = (
    record: VolunteerProfileRecord,
    options: { did?: string } = {},
): VolunteerOnboardingDraft => {
    return {
        did: options.did ?? 'did:example:placeholder',
        displayName: record.displayName,
        capabilities: [...record.capabilities],
        availability: record.availability,
        contactPreference: record.contactPreference,
        skills: [...(record.skills ?? [])],
        availabilityWindows: [...(record.availabilityWindows ?? [])],
        preferredCategories: [
            ...(record.matchingPreferences?.preferredCategories ?? ['other']),
        ],
        preferredUrgencies: [
            ...(record.matchingPreferences?.preferredUrgencies ?? ['medium']),
        ],
        maxDistanceKm: record.matchingPreferences?.maxDistanceKm ?? 10,
        acceptsLateNight: record.matchingPreferences?.acceptsLateNight ?? false,
        checkpoints: {
            identityCheck:
                record.verificationCheckpoints?.identityCheck ?? 'pending',
            safetyTraining:
                record.verificationCheckpoints?.safetyTraining ?? 'pending',
            communityReference:
                record.verificationCheckpoints?.communityReference ?? 'pending',
        },
        notes: record.notes,
    };
};
