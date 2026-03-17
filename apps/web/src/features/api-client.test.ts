import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createAidPostViaApi,
    fetchDirectoryCardsFromApi,
    fetchFeedRecordsFromApi,
    initiateChatViaApi,
} from './api-client.js';
import type { DiscoveryFilterState } from '../discovery-filters.js';

const originalFetch = globalThis.fetch;

const baseDiscoveryState: DiscoveryFilterState = {
    feedTab: 'nearby',
    center: {
        lat: 1.3,
        lng: 103.8,
    },
    radiusMeters: 5000,
    text: 'food',
};

const createJsonResponse = (payload: unknown, ok = true, status = 200) => {
    return {
        ok,
        status,
        json: async () => payload,
    } as Response;
};

describe('api client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    it('fetches and maps aid records for map scope', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                total: 1,
                page: 1,
                pageSize: 20,
                hasNextPage: false,
                results: [
                    {
                        uri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
                        authorDid: 'did:example:alice',
                        title: 'Need groceries',
                        summary: 'Two households need meal kits.',
                        status: 'open',
                        category: 'food',
                        urgency: 'high',
                        approximateGeo: {
                            latitude: 1.3001,
                            longitude: 103.8002,
                            precisionKm: 0.6,
                        },
                        updatedAt: '2026-02-28T10:00:00.000Z',
                    },
                ],
            }),
        );

        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchFeedRecordsFromApi(baseDiscoveryState, 'map');

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.card.title).toBe('Need groceries');
        expect(result.data[0]?.card.category).toBe('food');
        expect(result.data[0]?.card.urgency).toBe(4);

        const firstCall = (
            fetchMock.mock.calls as unknown as Array<[unknown]>
        )[0];
        const url = firstCall?.[0];
        expect(String(url)).toContain('/query/map?');
        expect(String(url)).toContain('latitude=1.300000');
        expect(String(url)).toContain('searchText=food');
    });

    it('returns API error message for directory fetch failure', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse(
                {
                    error: {
                        code: 'INVALID_QUERY',
                        message: 'Query parameters failed validation.',
                    },
                },
                false,
                400,
            ),
        );

        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchDirectoryCardsFromApi(baseDiscoveryState);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(result.error).toContain('validation');
    });

    it('maps chat initiation fallback payload from API', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                conversationUri:
                    'at://did:example:alice/app.patchwork.conversation.meta/conv-123',
                created: true,
                transportPath: 'manual-fallback',
                fallbackNotice: {
                    code: 'RECIPIENT_CAPABILITY_MISSING',
                    message: 'Recipient cannot receive AT-native chat yet.',
                    safeForUser: true,
                    transportPath: 'manual-fallback',
                },
            }),
        );

        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await initiateChatViaApi({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            initiatedByDid: 'did:example:helper-1',
            recipientDid: 'did:example:alice',
            initiatedFrom: 'map',
            allowInitiation: true,
            supportsAtprotoChat: false,
            now: '2026-02-28T12:00:00.000Z',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.data.transportPath).toBe('manual-fallback');
        expect(result.data.fallbackNotice?.safeForUser).toBe(true);

        const firstCall = (
            fetchMock.mock.calls as unknown as Array<[unknown]>
        )[0];
        const url = firstCall?.[0];
        expect(String(url)).toContain('/chat/initiate?');
        expect(String(url)).toContain('allowInitiation=true');
        expect(String(url)).toContain('supportsAtprotoChat=false');
    });

    it('creates aid post via API and maps response to feed record envelope', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                uri: 'at://did:example:resident-1/app.patchwork.aid.post/post-new-1',
                authorDid: 'did:example:resident-1',
                title: 'Need transport to clinic',
                summary: 'Wheelchair-compatible ride needed by 18:00.',
                category: 'transport',
                urgency: 'critical',
                status: 'open',
                approximateGeo: {
                    latitude: 1.301,
                    longitude: 103.802,
                    precisionKm: 0.5,
                },
                createdAt: '2026-02-28T18:00:00.000Z',
                updatedAt: '2026-02-28T18:00:00.000Z',
            }),
        );

        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await createAidPostViaApi({
            authorDid: 'did:example:resident-1',
            rkey: 'post-new-1',
            now: '2026-02-28T18:00:00.000Z',
            draft: {
                title: 'Need transport to clinic',
                description: 'Wheelchair-compatible ride needed by 18:00.',
                category: 'transport',
                urgency: 5,
                accessibilityTags: ['mobility-aid'],
                location: {
                    lat: 1.301,
                    lng: 103.802,
                    precisionMeters: 500,
                },
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.data.card.title).toBe('Need transport to clinic');
        expect(result.data.card.urgency).toBe(5);
        expect(result.data.aidPostUri).toContain('/post-new-1');

        const firstCall = (
            fetchMock.mock.calls as unknown as Array<[unknown, unknown]>
        )[0];
        const url = firstCall?.[0];
        const init = firstCall?.[1] as RequestInit | undefined;
        expect(String(url)).toContain('/aid/post/create');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body['category']).toBe('transport');
        expect(body['urgency']).toBe('critical');
    });
});
