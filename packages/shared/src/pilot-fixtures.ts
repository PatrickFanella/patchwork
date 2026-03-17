/**
 * Pilot scenario fixtures for Phase 8.2 E2E request-to-handoff tests.
 *
 * Provides realistic, deterministic fixture data modeled after real pilot
 * scenarios. Each fixture covers: aid-post creation → discovery → chat
 * initiation → handoff across map and feed surfaces.
 *
 * Requirement traceability:
 *   P8.2 – E2E flows → buildPilotScenarioFirehoseEvents, PILOT_*
 */

import { recordNsid } from '@patchwork/at-lexicons';
import type { ApiChatInitiationRequest } from './contracts.js';

// ---------------------------------------------------------------------------
// Shared pilot anchors
// ---------------------------------------------------------------------------

/** Fixed "now" used across all pilot E2E fixture calculations. */
export const PILOT_NOW_ISO = '2026-02-27T06:00:00.000Z';

/** Geographic center for pilot scenario proximity queries. */
export const PILOT_CENTER = { latitude: 40.7128, longitude: -74.006 } as const;

// ---------------------------------------------------------------------------
// Scenario A: Food (high-urgency grocery support)
// ---------------------------------------------------------------------------

export const PILOT_FOOD_AUTHOR_DID = 'did:example:pilot-alice' as const;
export const PILOT_FOOD_HELPER_DID = 'did:example:pilot-helper' as const;
export const PILOT_FOOD_AID_POST_URI =
    'at://did:example:pilot-alice/app.patchwork.aid.post/pilot-food-1' as const;

export const PILOT_FOOD_AID_POST = {
    $type: recordNsid.aidPost,
    version: '1.0.0',
    title: 'Family needs grocery support — downtown pickup',
    description:
        'Family of four urgently needs pantry items. Can collect from the community center on weekday mornings.',
    category: 'food',
    urgency: 'high',
    status: 'open',
    location: {
        latitude: 40.713,
        longitude: -74.007,
        precisionKm: 1,
    },
    createdAt: '2026-02-27T05:00:00.000Z',
} as const;

export const PILOT_FOOD_FIREHOSE_EVENT = {
    seq: 100,
    receivedAt: '2026-02-27T05:01:00.000Z',
    action: 'create',
    uri: PILOT_FOOD_AID_POST_URI,
    collection: recordNsid.aidPost,
    authorDid: PILOT_FOOD_AUTHOR_DID,
    trustScore: 0.88,
    record: { ...PILOT_FOOD_AID_POST },
} as const;

// ---------------------------------------------------------------------------
// Scenario B: Medical transport (critical urgency, fallback handoff)
// ---------------------------------------------------------------------------

export const PILOT_MEDICAL_AUTHOR_DID = 'did:example:pilot-bob' as const;
export const PILOT_MEDICAL_AID_POST_URI =
    'at://did:example:pilot-bob/app.patchwork.aid.post/pilot-medical-1' as const;

export const PILOT_MEDICAL_AID_POST = {
    $type: recordNsid.aidPost,
    version: '1.0.0',
    title: 'Urgent transport to specialist clinic',
    description:
        'Need a ride to a medical appointment tomorrow morning. Mobility-limited — requires an accessible vehicle.',
    category: 'medical',
    urgency: 'critical',
    status: 'open',
    location: {
        latitude: 40.715,
        longitude: -74.003,
        precisionKm: 2,
    },
    createdAt: '2026-02-27T05:10:00.000Z',
} as const;

export const PILOT_MEDICAL_FIREHOSE_EVENT = {
    seq: 101,
    receivedAt: '2026-02-27T05:11:00.000Z',
    action: 'create',
    uri: PILOT_MEDICAL_AID_POST_URI,
    collection: recordNsid.aidPost,
    authorDid: PILOT_MEDICAL_AUTHOR_DID,
    trustScore: 0.82,
    record: { ...PILOT_MEDICAL_AID_POST },
} as const;

// ---------------------------------------------------------------------------
// Scenario C: Shelter (high urgency, resolved via in-progress state)
// ---------------------------------------------------------------------------

export const PILOT_SHELTER_AUTHOR_DID = 'did:example:pilot-carol' as const;
export const PILOT_SHELTER_AID_POST_URI =
    'at://did:example:pilot-carol/app.patchwork.aid.post/pilot-shelter-1' as const;

export const PILOT_SHELTER_AID_POST = {
    $type: recordNsid.aidPost,
    version: '1.0.0',
    title: 'Temporary housing needed — displaced family of three',
    description:
        'Seeking temporary accommodation for two adults and one child while permanent housing is being arranged.',
    category: 'shelter',
    urgency: 'high',
    status: 'open',
    location: {
        latitude: 40.718,
        longitude: -74.009,
        precisionKm: 2,
    },
    createdAt: '2026-02-27T04:30:00.000Z',
} as const;

export const PILOT_SHELTER_FIREHOSE_EVENT = {
    seq: 102,
    receivedAt: '2026-02-27T04:31:00.000Z',
    action: 'create',
    uri: PILOT_SHELTER_AID_POST_URI,
    collection: recordNsid.aidPost,
    authorDid: PILOT_SHELTER_AUTHOR_DID,
    trustScore: 0.75,
    record: { ...PILOT_SHELTER_AID_POST },
} as const;

/** Status update event: shelter request moves to in-progress after handoff. */
export const PILOT_SHELTER_HANDOFF_EVENT = {
    seq: 103,
    receivedAt: '2026-02-27T05:45:00.000Z',
    action: 'update',
    uri: PILOT_SHELTER_AID_POST_URI,
    collection: recordNsid.aidPost,
    authorDid: PILOT_SHELTER_AUTHOR_DID,
    trustScore: 0.75,
    record: {
        ...PILOT_SHELTER_AID_POST,
        status: 'in-progress',
        updatedAt: '2026-02-27T05:45:00.000Z',
    },
} as const;

// ---------------------------------------------------------------------------
// Chat initiation fixtures
// ---------------------------------------------------------------------------

/** Happy path: food request initiated from the map surface. */
export const PILOT_FOOD_CHAT_REQUEST_MAP: ApiChatInitiationRequest = {
    aidPostUri: PILOT_FOOD_AID_POST_URI,
    initiatedByDid: PILOT_FOOD_HELPER_DID,
    recipientDid: PILOT_FOOD_AUTHOR_DID,
    initiatedFrom: 'map',
};

/** Dedup path: same food request initiated from the feed surface. */
export const PILOT_FOOD_CHAT_REQUEST_FEED: ApiChatInitiationRequest = {
    aidPostUri: PILOT_FOOD_AID_POST_URI,
    initiatedByDid: PILOT_FOOD_HELPER_DID,
    recipientDid: PILOT_FOOD_AUTHOR_DID,
    initiatedFrom: 'feed',
};

/**
 * Fallback path: medical request where the recipient cannot receive
 * AT-native chat — triggers the manual-fallback transport path.
 */
export const PILOT_MEDICAL_CHAT_REQUEST_FALLBACK: ApiChatInitiationRequest = {
    aidPostUri: PILOT_MEDICAL_AID_POST_URI,
    initiatedByDid: PILOT_FOOD_HELPER_DID,
    recipientDid: PILOT_MEDICAL_AUTHOR_DID,
    initiatedFrom: 'map',
};

// ---------------------------------------------------------------------------
// Full pilot seed
// ---------------------------------------------------------------------------

/**
 * Returns the complete set of pilot firehose events for ingestion by the
 * discovery index, covering creation and a single state-transition update.
 */
export const buildPilotScenarioFirehoseEvents = (): unknown[] => [
    PILOT_FOOD_FIREHOSE_EVENT,
    PILOT_MEDICAL_FIREHOSE_EVENT,
    PILOT_SHELTER_FIREHOSE_EVENT,
    PILOT_SHELTER_HANDOFF_EVENT,
];
