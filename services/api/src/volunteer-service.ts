import {
    DeterministicRoutingAssistant,
    VolunteerOnboardingStore,
    buildVolunteerRoutingCandidates,
    type AidPostRecord,
} from '@patchwork/shared';

export interface ApiVolunteerRouteResult {
    statusCode: number;
    body: unknown;
}

const readString = (
    params: URLSearchParams,
    key: string,
): string | undefined => {
    const value = params.get(key);
    if (value === null || value.trim() === '') {
        return undefined;
    }

    return value;
};

const requireString = (params: URLSearchParams, key: string): string => {
    const value = readString(params, key);
    if (!value) {
        throw new Error(`Missing required field: ${key}`);
    }

    return value;
};

const parseList = (value: string | undefined): string[] => {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
};

const parseAidCategory = (
    value: string | undefined,
): AidPostRecord['category'] => {
    if (
        value === 'food' ||
        value === 'shelter' ||
        value === 'medical' ||
        value === 'transport' ||
        value === 'childcare' ||
        value === 'other'
    ) {
        return value;
    }

    return 'other';
};

const parseUrgency = (value: string | undefined): AidPostRecord['urgency'] => {
    if (
        value === 'low' ||
        value === 'medium' ||
        value === 'high' ||
        value === 'critical'
    ) {
        return value;
    }

    return 'medium';
};

const parseCheckpointStatus = (
    value: string | undefined,
): 'pending' | 'approved' | 'rejected' => {
    if (value === 'approved' || value === 'rejected' || value === 'pending') {
        return value;
    }

    return 'pending';
};

export class ApiVolunteerService {
    private readonly store = new VolunteerOnboardingStore();
    private readonly routingAssistant = new DeterministicRoutingAssistant();

    upsertFromParams(params: URLSearchParams): ApiVolunteerRouteResult {
        try {
            const now = readString(params, 'now');
            const entry = this.store.upsertProfile(
                {
                    did: requireString(params, 'did'),
                    displayName: requireString(params, 'displayName'),
                    capabilities: parseList(
                        readString(params, 'capabilities'),
                    ) as Array<
                        | 'transport'
                        | 'food-delivery'
                        | 'translation'
                        | 'first-aid'
                        | 'childcare'
                        | 'other'
                    >,
                    availability:
                        (readString(params, 'availability') as
                            | 'immediate'
                            | 'within-24h'
                            | 'scheduled'
                            | 'unavailable'
                            | undefined) ?? 'scheduled',
                    contactPreference:
                        (readString(params, 'contactPreference') as
                            | 'chat-only'
                            | 'chat-or-call'
                            | undefined) ?? 'chat-only',
                    skills: parseList(readString(params, 'skills')),
                    availabilityWindows: parseList(
                        readString(params, 'availabilityWindows'),
                    ),
                    verificationCheckpoints: {
                        identityCheck: parseCheckpointStatus(
                            readString(params, 'checkpointIdentity'),
                        ),
                        safetyTraining: parseCheckpointStatus(
                            readString(params, 'checkpointSafety'),
                        ),
                        communityReference: parseCheckpointStatus(
                            readString(params, 'checkpointReference'),
                        ),
                    },
                    matchingPreferences: {
                        preferredCategories: parseList(
                            readString(params, 'preferredCategories'),
                        ) as AidPostRecord['category'][],
                        preferredUrgencies: parseList(
                            readString(params, 'preferredUrgencies'),
                        ) as AidPostRecord['urgency'][],
                        maxDistanceKm: Number(
                            readString(params, 'maxDistanceKm') ?? '10',
                        ),
                        acceptsLateNight:
                            readString(params, 'acceptsLateNight') === 'true',
                    },
                    notes: readString(params, 'notes'),
                },
                { now },
            );

            return {
                statusCode: 200,
                body: {
                    did: entry.did,
                    record: entry.record,
                    matchingPreferences: entry.matchingPreferences,
                },
            };
        } catch (error) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_VOLUNTEER_PROFILE',
                        message:
                            error instanceof Error ?
                                error.message
                            :   'Failed to upsert volunteer profile',
                    },
                },
            };
        }
    }

    listFromParams(): ApiVolunteerRouteResult {
        const profiles = this.store.listProfiles();
        return {
            statusCode: 200,
            body: {
                total: profiles.length,
                results: profiles,
            },
        };
    }

    routePreferenceAwareFromParams(
        params: URLSearchParams,
    ): ApiVolunteerRouteResult {
        try {
            const aidCategory = parseAidCategory(
                readString(params, 'category'),
            );
            const urgency = parseUrgency(readString(params, 'urgency'));
            const candidates = buildVolunteerRoutingCandidates(
                this.store.listProfiles(),
                {
                    aidCategory,
                    urgency,
                    isLateNight: readString(params, 'isLateNight') === 'true',
                },
            );

            const decision = this.routingAssistant.decide({
                aidPostUri:
                    readString(params, 'aidPostUri') ??
                    'at://did:example:requester/app.patchwork.aid.post/preference-route',
                requesterDid:
                    readString(params, 'requesterDid') ??
                    'did:example:requester',
                aidCategory,
                urgency,
                volunteerCandidates: candidates,
                resourceCandidates: [],
                now: readString(params, 'now'),
            });

            return {
                statusCode: 200,
                body: {
                    candidateCount: candidates.length,
                    decision,
                },
            };
        } catch (error) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_ROUTE_INPUT',
                        message:
                            error instanceof Error ?
                                error.message
                            :   'Failed to compute preference-aware route',
                    },
                },
            };
        }
    }
}

export const createFixtureVolunteerService = (): ApiVolunteerService => {
    return new ApiVolunteerService();
};
