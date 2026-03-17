/**
 * Phase 8 deterministic test fixtures.
 *
 * Provides shared, reproducible fixture data for ingestion, ranking,
 * routing, privacy, and schema validation test suites. All timestamps,
 * DIDs, and coordinates are hardcoded to guarantee stable test outcomes
 * across runs and environments.
 *
 * Requirement traceability:
 *   P2.1 – schema validation  → PHASE8_VALID_* exports
 *   P3.1 – ingestion          → buildPhase8FixtureFirehoseEvents
 *   P3.4 – ranking            → PHASE8_RANKING_CARDS, PHASE8_NOW_ISO
 *   P5   – routing            → PHASE8_CHAT_REQUEST, PHASE8_FIREHOSE_EVENT
 *   P7   – privacy            → PHASE8_PRIVACY_LOG_PAYLOAD
 *   P7.1 – moderation         → PHASE8_MODERATION_EVENT
 */

import { recordNsid } from '@patchwork/at-lexicons';
import type {
    ApiChatInitiationRequest,
    ApiQueryAidRequest,
    FirehoseNormalizedEvent,
    ModerationReviewRequestedEvent,
} from './contracts.js';
import type { RankableCard } from './ranking.js';

// ---------------------------------------------------------------------------
// Shared deterministic anchors
// ---------------------------------------------------------------------------

/** Fixed "now" timestamp used across all phase 8 fixture calculations. */
export const PHASE8_NOW_ISO = '2026-02-27T00:00:00.000Z';

/** Fixed epoch used as the baseline creation time in phase 8 fixtures. */
export const PHASE8_EPOCH_ISO = '2026-02-26T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Schema fixtures – valid record payloads for each NSID (P2.1)
// ---------------------------------------------------------------------------

export const PHASE8_VALID_AID_POST = {
    $type: recordNsid.aidPost,
    version: '1.0.0',
    title: 'P8 food request near downtown',
    description: 'Need pantry access for a family of four.',
    category: 'food',
    urgency: 'high',
    status: 'open',
    location: {
        latitude: 40.7128,
        longitude: -74.006,
        precisionKm: 2,
    },
    createdAt: '2026-02-27T00:00:00.000Z',
} as const;

export const PHASE8_VALID_VOLUNTEER_PROFILE = {
    $type: recordNsid.volunteerProfile,
    version: '1.1.0',
    displayName: 'Phase-8 Volunteer',
    capabilities: ['transport'],
    availability: 'within-24h',
    contactPreference: 'chat-only',
    skills: ['route planning'],
    availabilityWindows: ['weekday_evenings'],
    verificationCheckpoints: {
        identityCheck: 'approved',
        safetyTraining: 'approved',
        communityReference: 'approved',
    },
    matchingPreferences: {
        preferredCategories: ['food'],
        preferredUrgencies: ['high', 'critical'],
        maxDistanceKm: 15,
    },
    createdAt: '2026-02-27T00:00:00.000Z',
} as const;

export const PHASE8_VALID_CONVERSATION_META = {
    $type: recordNsid.conversationMeta,
    version: '1.0.0',
    aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/p8-post-1',
    participantDids: ['did:example:alice', 'did:example:helper'],
    status: 'open',
    createdAt: '2026-02-27T00:00:00.000Z',
} as const;

export const PHASE8_VALID_MODERATION_REPORT = {
    $type: recordNsid.moderationReport,
    version: '1.0.0',
    subjectUri: 'at://did:example:alice/app.patchwork.aid.post/p8-post-1',
    reporterDid: 'did:example:reporter',
    reason: 'spam',
    createdAt: '2026-02-27T00:00:00.000Z',
} as const;

export const PHASE8_VALID_DIRECTORY_RESOURCE = {
    $type: recordNsid.directoryResource,
    version: '1.1.0',
    name: 'Phase-8 Resource Centre',
    category: 'food-bank',
    serviceArea: 'P8 Test District',
    contact: {
        url: 'https://example.org/p8-resource',
    },
    verificationStatus: 'community-verified',
    location: {
        latitude: 40.715,
        longitude: -74.001,
        precisionKm: 1,
        areaLabel: 'P8 District',
    },
    openHours: 'Mon-Fri 09:00-17:00',
    operationalStatus: 'open',
    createdAt: '2026-02-27T00:00:00.000Z',
} as const;

// ---------------------------------------------------------------------------
// Ingestion fixtures – raw firehose events for phase 8 tests (P3.1)
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic set of raw firehose events for phase 8 ingestion
 * tests. Events cover create and update lifecycles for aid posts and
 * directory resources.
 */
export const buildPhase8FixtureFirehoseEvents = (): unknown[] => [
    {
        seq: 1,
        receivedAt: '2026-02-27T00:01:00.000Z',
        action: 'create',
        uri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
        collection: recordNsid.aidPost,
        authorDid: 'did:example:p8-alice',
        trustScore: 0.85,
        record: { ...PHASE8_VALID_AID_POST },
    },
    {
        seq: 2,
        receivedAt: '2026-02-27T00:02:00.000Z',
        action: 'create',
        uri: 'at://did:example:p8-bob/app.patchwork.directory.resource/p8-resource-a',
        collection: recordNsid.directoryResource,
        authorDid: 'did:example:p8-bob',
        trustScore: 0.9,
        record: { ...PHASE8_VALID_DIRECTORY_RESOURCE },
    },
    {
        seq: 3,
        receivedAt: '2026-02-27T00:03:00.000Z',
        action: 'update',
        uri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
        collection: recordNsid.aidPost,
        authorDid: 'did:example:p8-alice',
        trustScore: 0.85,
        record: {
            ...PHASE8_VALID_AID_POST,
            status: 'in-progress',
            updatedAt: '2026-02-27T00:03:00.000Z',
        },
    },
];

// ---------------------------------------------------------------------------
// Ranking fixtures – cards with a known deterministic ordering (P3.4)
// ---------------------------------------------------------------------------

/**
 * Three rankable cards whose ordering is fully determined when scored
 * against PHASE8_NOW_ISO. Expected order: rank-a > rank-b > rank-c.
 */
export const PHASE8_RANKING_CARDS: readonly RankableCard[] = [
    {
        uri: 'at://did:example:p8-rank/app.patchwork.aid.post/rank-a',
        distanceKm: 1.5,
        createdAt: '2026-02-26T23:00:00.000Z',
        trustScore: 0.9,
        updatedAt: '2026-02-26T23:30:00.000Z',
    },
    {
        uri: 'at://did:example:p8-rank/app.patchwork.aid.post/rank-b',
        distanceKm: 8,
        createdAt: '2026-02-26T20:00:00.000Z',
        trustScore: 0.6,
        updatedAt: '2026-02-26T21:00:00.000Z',
    },
    {
        uri: 'at://did:example:p8-rank/app.patchwork.aid.post/rank-c',
        distanceKm: 20,
        createdAt: '2026-02-25T00:00:00.000Z',
        trustScore: 0.4,
        updatedAt: '2026-02-25T01:00:00.000Z',
    },
];

// ---------------------------------------------------------------------------
// Privacy fixtures – log payload for redaction tests (P7)
// ---------------------------------------------------------------------------

/** Unredacted log payload used to verify privacy redaction behaviour. */
export const PHASE8_PRIVACY_LOG_PAYLOAD = {
    eventType: 'chat.safety.evaluated',
    senderDid: 'did:example:p8-sender',
    recipientDid: 'did:example:p8-recipient',
    subjectUri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
    latitude: 40.713274,
    longitude: -74.005678,
    details: 'Evaluated chat safety for p8 fixture',
} as const;

// ---------------------------------------------------------------------------
// Routing + contract stubs (P5, contracts)
// ---------------------------------------------------------------------------

/** Deterministic chat initiation request used in routing tests. */
export const PHASE8_CHAT_REQUEST: ApiChatInitiationRequest = {
    aidPostUri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
    initiatedByDid: 'did:example:p8-helper',
    recipientDid: 'did:example:p8-alice',
    initiatedFrom: 'map',
};

/** Deterministic map query request used in API routing tests. */
export const PHASE8_MAP_QUERY_REQUEST: ApiQueryAidRequest = {
    latitude: 40.7128,
    longitude: -74.006,
    radiusKm: 10,
    category: 'food',
    urgency: 'high',
    status: 'open',
    freshnessHours: 48,
    page: 1,
    pageSize: 10,
};

// ---------------------------------------------------------------------------
// Contract event fixtures (P3.1, P7.1)
// ---------------------------------------------------------------------------

/** Deterministic FirehoseNormalizedEvent matching the service contract. */
export const PHASE8_FIREHOSE_EVENT: FirehoseNormalizedEvent = {
    type: 'firehose.normalized',
    recordUri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
    authorDid: 'did:example:p8-alice',
    indexedAt: '2026-02-27T00:01:00.000Z',
    action: 'create',
    seq: 1,
};

/** Deterministic ModerationReviewRequestedEvent matching the service contract. */
export const PHASE8_MODERATION_EVENT: ModerationReviewRequestedEvent = {
    type: 'moderation.review.requested',
    subjectUri: 'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
    reason: 'user-report:spam',
    requestedAt: '2026-02-27T00:05:00.000Z',
};
