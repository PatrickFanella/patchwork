import type { RoutingAssistantInput, RoutingDecision } from './messaging.js';

export interface RoutingFixture {
    id: string;
    input: RoutingAssistantInput;
    expectedRule: RoutingDecision['matchedRule'];
    expectedDestinationKind: RoutingDecision['destinationKind'];
}

export const buildPhase5RoutingFixtures = (): readonly RoutingFixture[] => {
    return [
        {
            id: 'post-author-direct',
            input: {
                aidPostUri:
                    'at://did:example:requester/app.patchwork.aid.post/post-author-1',
                requesterDid: 'did:example:requester',
                aidCategory: 'food',
                urgency: 'high',
                postAuthorDid: 'did:example:author',
                volunteerCandidates: [],
                resourceCandidates: [],
                now: '2026-02-26T14:00:00.000Z',
            },
            expectedRule: 'RULE_POST_AUTHOR',
            expectedDestinationKind: 'post-author',
        },
        {
            id: 'volunteer-best-match',
            input: {
                aidPostUri:
                    'at://did:example:requester/app.patchwork.aid.post/volunteer-1',
                requesterDid: 'did:example:requester',
                aidCategory: 'transport',
                urgency: 'critical',
                volunteerCandidates: [
                    {
                        id: 'v2',
                        did: 'did:example:volunteer-b',
                        availability: 'within-24h',
                        trustScore: 0.95,
                        matchesCategory: true,
                    },
                    {
                        id: 'v1',
                        did: 'did:example:volunteer-a',
                        availability: 'immediate',
                        trustScore: 0.8,
                        matchesCategory: true,
                    },
                ],
                resourceCandidates: [],
                now: '2026-02-26T14:05:00.000Z',
            },
            expectedRule: 'RULE_VOLUNTEER_POOL',
            expectedDestinationKind: 'volunteer-pool',
        },
        {
            id: 'resource-verified',
            input: {
                aidPostUri:
                    'at://did:example:requester/app.patchwork.aid.post/resource-1',
                requesterDid: 'did:example:requester',
                aidCategory: 'medical',
                urgency: 'medium',
                volunteerCandidates: [
                    {
                        id: 'v3',
                        did: 'did:example:volunteer-c',
                        availability: 'unavailable',
                        trustScore: 0.6,
                        matchesCategory: false,
                    },
                ],
                resourceCandidates: [
                    {
                        id: 'r2',
                        verificationStatus: 'community-verified',
                        supportsCategory: true,
                        currentlyOpen: true,
                    },
                    {
                        id: 'r1',
                        verificationStatus: 'partner-verified',
                        supportsCategory: true,
                        currentlyOpen: true,
                    },
                ],
                now: '2026-02-26T14:10:00.000Z',
            },
            expectedRule: 'RULE_VERIFIED_RESOURCE',
            expectedDestinationKind: 'verified-resource',
        },
        {
            id: 'volunteer-preference-aware',
            input: {
                aidPostUri:
                    'at://did:example:requester/app.patchwork.aid.post/volunteer-2',
                requesterDid: 'did:example:requester',
                aidCategory: 'medical',
                urgency: 'critical',
                volunteerCandidates: [
                    {
                        id: 'v4',
                        did: 'did:example:volunteer-d',
                        availability: 'immediate',
                        trustScore: 0.8,
                        matchesCategory: true,
                        preferredCategories: ['medical'],
                        preferredUrgencyLevels: ['critical', 'high'],
                        maxDistanceKm: 10,
                        distanceKm: 4,
                        verificationCheckpointScore: 1,
                    },
                    {
                        id: 'v5',
                        did: 'did:example:volunteer-e',
                        availability: 'immediate',
                        trustScore: 0.8,
                        matchesCategory: true,
                        preferredCategories: ['food'],
                        preferredUrgencyLevels: ['low'],
                        maxDistanceKm: 20,
                        distanceKm: 5,
                        verificationCheckpointScore: 0.33,
                    },
                ],
                resourceCandidates: [],
                now: '2026-02-26T14:12:00.000Z',
            },
            expectedRule: 'RULE_VOLUNTEER_POOL',
            expectedDestinationKind: 'volunteer-pool',
        },
    ] as const;
};
