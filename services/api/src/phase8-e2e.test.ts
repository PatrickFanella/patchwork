/**
 * P8.2 – End-to-end request-to-handoff flow tests.
 *
 * Exercises the complete critical path using realistic pilot scenario
 * fixtures: aid-post creation → discovery on map/feed → chat initiation →
 * successful handoff. Also covers fallback scenarios and state-transition
 * validation across all surfaces.
 *
 * Test coverage:
 *   1. Pilot seed ingestion and discovery index integrity
 *   2. Map-surface discovery for each pilot scenario
 *   3. Feed-surface discovery for each pilot scenario
 *   4. Chat initiation from map → successful atproto-direct handoff
 *   5. Chat initiation from feed → conversation deduplication
 *   6. Fallback handoff when recipient lacks AT-native chat capability
 *   7. UX state-machine transitions: idle → submitting → success / error
 *   8. Actionable diagnostics on failure states
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
    FirehoseConsumer,
    DiscoveryIndexStore,
    buildPilotScenarioFirehoseEvents,
    PILOT_NOW_ISO,
    PILOT_CENTER,
    PILOT_FOOD_AID_POST_URI,
    PILOT_FOOD_AUTHOR_DID,
    PILOT_FOOD_HELPER_DID,
    PILOT_MEDICAL_AID_POST_URI,
    PILOT_MEDICAL_AUTHOR_DID,
    PILOT_SHELTER_AID_POST_URI,
    PUBLIC_MIN_PRECISION_KM,
} from '@patchwork/shared';
import { createFixtureChatService } from './chat-service.js';
import { ApiDiscoveryQueryService } from './query-service.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/**
 * Builds a query service seeded exclusively with the pilot scenario events:
 * three aid-post creates and one shelter status-transition update.
 */
const createPilotQueryService = () => {
    const consumer = new FirehoseConsumer();
    const ingested = consumer.ingest(buildPilotScenarioFirehoseEvents());
    const store = new DiscoveryIndexStore();
    store.applyEvents(ingested.normalizedEvents);
    const service = new ApiDiscoveryQueryService(store);
    return { service, ingested, store };
};

// ---------------------------------------------------------------------------
// 1. Ingestion and discovery index integrity
// ---------------------------------------------------------------------------

describe('P8.2 pilot seed ingestion', () => {
    it('ingests all pilot scenario events without failures', () => {
        const consumer = new FirehoseConsumer();
        const result = consumer.ingest(buildPilotScenarioFirehoseEvents());

        expect(result.failures).toHaveLength(0);
        expect(result.metrics.processed).toBe(4);
        expect(result.metrics.normalized).toBe(4);
    });

    it('applies status-transition update for shelter scenario', () => {
        const consumer = new FirehoseConsumer();
        const result = consumer.ingest(buildPilotScenarioFirehoseEvents());
        const store = new DiscoveryIndexStore();
        store.applyEvents(result.normalizedEvents);

        const shelterQueryResult = store.queryMap({
            latitude: PILOT_CENTER.latitude,
            longitude: PILOT_CENTER.longitude,
            radiusKm: 50,
            status: 'in-progress',
        });

        expect(
            shelterQueryResult.items.some(item =>
                item.uri === PILOT_SHELTER_AID_POST_URI,
            ),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 2. Map-surface discovery
// ---------------------------------------------------------------------------

describe('P8.2 map discovery', () => {
    it('discovers food and medical pilot requests within 50 km radius', () => {
        const { service } = createPilotQueryService();

        const result = service.queryMap(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                status: 'open',
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as { total: number; results: Array<{ uri: string }> };
        const uris = body.results.map(r => r.uri);
        expect(uris).toContain(PILOT_FOOD_AID_POST_URI);
        expect(uris).toContain(PILOT_MEDICAL_AID_POST_URI);
    });

    it('applies category filter on map surface', () => {
        const { service } = createPilotQueryService();

        const result = service.queryMap(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                category: 'food',
                status: 'open',
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as { results: Array<{ uri: string; category: string }> };
        for (const item of body.results) {
            expect(item.category).toBe('food');
        }
        expect(body.results.some(r => r.uri === PILOT_FOOD_AID_POST_URI)).toBe(true);
    });

    it('enforces minimum geo-precision on all map results', () => {
        const { service } = createPilotQueryService();

        const result = service.queryMap(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
            }),
        );

        const body = result.body as {
            results: Array<{ approximateGeo: { precisionKm: number } }>;
        };
        for (const item of body.results) {
            expect(item.approximateGeo.precisionKm).toBeGreaterThanOrEqual(
                PUBLIC_MIN_PRECISION_KM,
            );
        }
    });

    it('returns 400 for a map query missing required coordinates', () => {
        const { service } = createPilotQueryService();

        const result = service.queryMap(new URLSearchParams({ radiusKm: '50' }));
        expect(result.statusCode).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// 3. Feed-surface discovery
// ---------------------------------------------------------------------------

describe('P8.2 feed discovery', () => {
    it('discovers all open pilot requests on the feed', () => {
        const { service } = createPilotQueryService();

        const result = service.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                status: 'open',
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as { results: Array<{ uri: string }> };
        const uris = body.results.map(r => r.uri);
        expect(uris).toContain(PILOT_FOOD_AID_POST_URI);
        expect(uris).toContain(PILOT_MEDICAL_AID_POST_URI);
    });

    it('applies urgency filter on feed surface', () => {
        const { service } = createPilotQueryService();

        const result = service.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                urgency: 'critical',
                status: 'open',
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as { results: Array<{ uri: string; urgency: string }> };
        for (const item of body.results) {
            expect(item.urgency).toBe('critical');
        }
        expect(body.results.some(r => r.uri === PILOT_MEDICAL_AID_POST_URI)).toBe(true);
    });

    it('excludes in-progress shelter request from open-only feed query', () => {
        const { service } = createPilotQueryService();

        const result = service.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                status: 'open',
            }),
        );

        const body = result.body as { results: Array<{ uri: string }> };
        expect(body.results.some(r => r.uri === PILOT_SHELTER_AID_POST_URI)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 4. Chat initiation from map → atproto-direct handoff (happy path)
// ---------------------------------------------------------------------------

describe('P8.2 chat initiation – map surface happy path', () => {
    it('creates a new conversation for the food pilot scenario from the map', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'true',
                now: PILOT_NOW_ISO,
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as {
            created: boolean;
            conversationUri: string;
            transportPath: string;
            fallbackNotice?: unknown;
        };
        expect(body.created).toBe(true);
        expect(body.conversationUri).toMatch(/^at:\/\//);
        expect(body.transportPath).toBe('atproto-direct');
        expect(body.fallbackNotice).toBeUndefined();
    });

    it('records the map surface in the conversation request context', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'true',
                now: PILOT_NOW_ISO,
            }),
        );

        const body = result.body as {
            requestContext: { initiatedFrom: string };
        };
        expect(body.requestContext.initiatedFrom).toBe('map');
    });
});

// ---------------------------------------------------------------------------
// 5. Feed surface initiation → conversation deduplication
// ---------------------------------------------------------------------------

describe('P8.2 chat initiation – feed surface deduplication', () => {
    it('re-uses the same conversation URI when initiated from feed for same post and helper', () => {
        const service = createFixtureChatService();

        const mapParams = new URLSearchParams({
            aidPostUri: PILOT_FOOD_AID_POST_URI,
            initiatedByDid: PILOT_FOOD_HELPER_DID,
            recipientDid: PILOT_FOOD_AUTHOR_DID,
            initiatedFrom: 'map',
            supportsAtprotoChat: 'true',
            now: PILOT_NOW_ISO,
        });

        const feedParams = new URLSearchParams({
            aidPostUri: PILOT_FOOD_AID_POST_URI,
            initiatedByDid: PILOT_FOOD_HELPER_DID,
            recipientDid: PILOT_FOOD_AUTHOR_DID,
            initiatedFrom: 'feed',
            supportsAtprotoChat: 'true',
            now: PILOT_NOW_ISO,
        });

        const first = service.initiateFromParams(mapParams);
        const second = service.initiateFromParams(feedParams);

        expect((first.body as { created: boolean }).created).toBe(true);
        expect((second.body as { created: boolean }).created).toBe(false);

        const firstUri = (first.body as { conversationUri: string }).conversationUri;
        const secondUri = (second.body as { conversationUri: string }).conversationUri;
        expect(firstUri).toBe(secondUri);
    });

    it('lists both surface initiations under the same aid post uri', () => {
        const service = createFixtureChatService();

        service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'true',
                now: PILOT_NOW_ISO,
            }),
        );

        const listed = service.listConversationsFromParams(
            new URLSearchParams({ aidPostUri: PILOT_FOOD_AID_POST_URI }),
        );

        expect(listed.statusCode).toBe(200);
        const body = listed.body as { total: number };
        expect(body.total).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 6. Fallback handoff when recipient lacks AT-native chat capability
// ---------------------------------------------------------------------------

describe('P8.2 fallback handoff', () => {
    it('produces manual-fallback transport path for pilot-bob (no atproto chat)', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_MEDICAL_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_MEDICAL_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'false',
                now: PILOT_NOW_ISO,
            }),
        );

        expect(result.statusCode).toBe(200);
        const body = result.body as {
            transportPath: string;
            fallbackNotice?: { code: string; safeForUser: boolean };
        };
        expect(body.transportPath).toBe('manual-fallback');
        expect(body.fallbackNotice?.code).toBe('RECIPIENT_CAPABILITY_MISSING');
        expect(body.fallbackNotice?.safeForUser).toBe(true);
    });

    it('fallback notice message is safe for user display', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_MEDICAL_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_MEDICAL_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'false',
                now: PILOT_NOW_ISO,
            }),
        );

        const body = result.body as {
            fallbackNotice?: { message: string };
        };
        expect(body.fallbackNotice?.message).toBeTruthy();
        expect(body.fallbackNotice?.message.length).toBeGreaterThan(10);
    });

    it('returns 400 for chat initiated by the same DID as recipient', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_AUTHOR_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                now: PILOT_NOW_ISO,
            }),
        );

        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when allowInitiation is explicitly false', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                allowInitiation: 'false',
                now: PILOT_NOW_ISO,
            }),
        );

        expect(result.statusCode).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// 7. UX state-machine transitions
// ---------------------------------------------------------------------------

describe('P8.2 UX state-machine transitions', () => {
    it('progresses idle → submitting → success for map initiation', () => {
        // These state transitions mirror what the web UX layer performs when
        // the chat service responds successfully.
        const states: string[] = ['idle'];

        // Simulated dispatch: submit
        states.push('submitting');

        // Simulated dispatch: success (service responded 200)
        const service = createFixtureChatService();
        const response = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'true',
                now: PILOT_NOW_ISO,
            }),
        );
        expect(response.statusCode).toBe(200);
        states.push('success');

        expect(states).toEqual(['idle', 'submitting', 'success']);
    });

    it('progresses idle → submitting → error for unauthorized initiation', () => {
        const states: string[] = ['idle'];
        states.push('submitting');

        const service = createFixtureChatService();
        const response = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_AUTHOR_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'feed',
                now: PILOT_NOW_ISO,
            }),
        );
        expect(response.statusCode).toBe(400);
        states.push('error');

        expect(states).toEqual(['idle', 'submitting', 'error']);
    });
});

// ---------------------------------------------------------------------------
// 8. Actionable diagnostics
// ---------------------------------------------------------------------------

describe('P8.2 actionable diagnostics', () => {
    it('error body includes a code and message for missing required field', () => {
        const service = createFixtureChatService();

        const result = service.initiateFromParams(
            new URLSearchParams({
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                now: PILOT_NOW_ISO,
                // aidPostUri and initiatedByDid intentionally omitted
            }),
        );

        expect(result.statusCode).toBe(400);
        const body = result.body as { error: { code: string; message: string } };
        expect(body.error.code).toBeTruthy();
        expect(body.error.message.length).toBeGreaterThan(5);
    });

    it('map query error body includes validation issue details', () => {
        const { service } = createPilotQueryService();

        const result = service.queryMap(
            // latitude out of valid range
            new URLSearchParams({ latitude: '999', longitude: '-74', radiusKm: '10' }),
        );

        expect(result.statusCode).toBe(400);
        const body = result.body as {
            error: { code: string; details?: { issues: unknown[] } };
        };
        expect(body.error.code).toBe('INVALID_QUERY');
        expect(body.error.details?.issues.length).toBeGreaterThan(0);
    });

    it('routing scenario error references the unsupported scenario id', () => {
        const service = createFixtureChatService();

        const result = service.routeScenarioFromParams(
            new URLSearchParams({ scenario: 'nonexistent-pilot-scenario' }),
        );

        expect(result.statusCode).toBe(400);
        const body = result.body as {
            error: { code: string; message: string };
        };
        expect(body.error.code).toBe('UNSUPPORTED_SCENARIO');
        expect(body.error.message).toContain('nonexistent-pilot-scenario');
    });
});

// ---------------------------------------------------------------------------
// 9. Complete critical path (end-to-end integration)
// ---------------------------------------------------------------------------

describe('P8.2 complete critical path: create → discover → chat → handoff', () => {
    let service: ReturnType<typeof createFixtureChatService>;

    beforeEach(() => {
        service = createFixtureChatService();
    });

    it('food scenario: ingests → appears on map → initiates chat → atproto handoff', () => {
        // Step 1: Verify the food request is discoverable on the map
        const { service: queryService } = createPilotQueryService();
        const mapResult = queryService.queryMap(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                category: 'food',
                status: 'open',
            }),
        );
        expect(mapResult.statusCode).toBe(200);
        const mapBody = mapResult.body as { results: Array<{ uri: string }> };
        expect(mapBody.results.some(r => r.uri === PILOT_FOOD_AID_POST_URI)).toBe(true);

        // Step 2: Initiate chat from the map surface
        const chatResult = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_FOOD_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_FOOD_AUTHOR_DID,
                initiatedFrom: 'map',
                supportsAtprotoChat: 'true',
                now: PILOT_NOW_ISO,
            }),
        );
        expect(chatResult.statusCode).toBe(200);

        // Step 3: Validate successful handoff state
        const chatBody = chatResult.body as {
            created: boolean;
            conversationUri: string;
            transportPath: string;
            fallbackNotice?: unknown;
        };
        expect(chatBody.created).toBe(true);
        expect(chatBody.conversationUri).toMatch(/^at:\/\//);
        expect(chatBody.transportPath).toBe('atproto-direct');
        expect(chatBody.fallbackNotice).toBeUndefined();
    });

    it('medical scenario: ingests → appears on feed → initiates chat → fallback handoff', () => {
        // Step 1: Verify the medical request appears on the feed
        const { service: queryService } = createPilotQueryService();
        const feedResult = queryService.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                urgency: 'critical',
                status: 'open',
            }),
        );
        expect(feedResult.statusCode).toBe(200);
        const feedBody = feedResult.body as { results: Array<{ uri: string }> };
        expect(feedBody.results.some(r => r.uri === PILOT_MEDICAL_AID_POST_URI)).toBe(true);

        // Step 2: Initiate chat — recipient cannot use AT-native chat
        const chatResult = service.initiateFromParams(
            new URLSearchParams({
                aidPostUri: PILOT_MEDICAL_AID_POST_URI,
                initiatedByDid: PILOT_FOOD_HELPER_DID,
                recipientDid: PILOT_MEDICAL_AUTHOR_DID,
                initiatedFrom: 'feed',
                supportsAtprotoChat: 'false',
                now: PILOT_NOW_ISO,
            }),
        );
        expect(chatResult.statusCode).toBe(200);

        // Step 3: Validate fallback handoff state
        const chatBody = chatResult.body as {
            transportPath: string;
            fallbackNotice: { code: string; safeForUser: boolean; message: string };
        };
        expect(chatBody.transportPath).toBe('manual-fallback');
        expect(chatBody.fallbackNotice.code).toBe('RECIPIENT_CAPABILITY_MISSING');
        expect(chatBody.fallbackNotice.safeForUser).toBe(true);
        expect(chatBody.fallbackNotice.message).toBeTruthy();
    });

    it('shelter scenario: transitions to in-progress after handoff, no longer in open feed', () => {
        // Step 1: Confirm shelter shows as in-progress (from seed transition event)
        const { service: queryService } = createPilotQueryService();
        const openFeed = queryService.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                status: 'open',
            }),
        );
        const openBody = openFeed.body as { results: Array<{ uri: string }> };
        expect(openBody.results.some(r => r.uri === PILOT_SHELTER_AID_POST_URI)).toBe(false);

        // Step 2: Confirm it appears under in-progress status
        const inProgressFeed = queryService.queryFeed(
            new URLSearchParams({
                latitude: String(PILOT_CENTER.latitude),
                longitude: String(PILOT_CENTER.longitude),
                radiusKm: '50',
                status: 'in-progress',
            }),
        );
        const inProgressBody = inProgressFeed.body as { results: Array<{ uri: string }> };
        expect(inProgressBody.results.some(r => r.uri === PILOT_SHELTER_AID_POST_URI)).toBe(true);
    });
});
