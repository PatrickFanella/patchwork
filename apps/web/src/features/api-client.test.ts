import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type AidPostCreateApiInput,
    type LifecycleTransitionApiInput,
    blockUserViaApi,
    createAidPostViaApi,
    createAtAidPostViaApi,
    deactivateAccountViaApi,
    fetchDirectoryCardsFromApi,
    fetchFeedRecordsFromApi,
    exportDataViaApi,
    initiateChatViaApi,
    queryAidPostLifecycleViaApi,
    reportAidPostViaApi,
    reconcileAidPostStatusViaApi,
    transitionAidPostViaApi,
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

    it('exports the authenticated account without putting identity in the request', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                formatVersion: '1.0',
                generatedAt: '2026-07-11T12:00:00.000Z',
                subject: { did: 'did:plc:viewer' },
                data: {},
                exclusions: [],
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await exportDataViaApi();

        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/account\/export$/),
            expect.objectContaining({ method: 'GET', credentials: 'include' }),
        );
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(
            'did:plc:viewer',
        );
    });

    it('deactivates the authenticated account without sending browser identity', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                status: 'deactivated',
                effectiveAt: '2026-07-11T12:00:00.000Z',
                removed: {},
                revoked: {},
                retained: { deactivationReceipt: 1 },
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await deactivateAccountViaApi();

        expect(result.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toMatch(/\/account\/deactivate$/);
        expect(init).toMatchObject({
            method: 'POST',
            credentials: 'include',
            headers: expect.objectContaining({
                'idempotency-key': expect.any(String),
            }),
        });
        expect(JSON.parse(String(init.body))).toEqual({});
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('did:');
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
                        cid: 'bafy-discovered',
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
        expect(result.data[0]?.cid).toBe('bafy-discovered');

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
        expect(result).toMatchObject({
            code: 'INVALID_QUERY',
            kind: 'validation',
            retryable: false,
        });
    });

    it.each([
        [401, 'AUTH_REQUIRED', 'authentication', false],
        [503, 'SERVICE_UNAVAILABLE', 'server', true],
    ] as const)(
        'classifies HTTP %i as a typed %s failure',
        async (status, code, kind, retryable) => {
            globalThis.fetch = vi.fn(async () =>
                createJsonResponse(
                    { error: { code, message: 'Request failed.' } },
                    false,
                    status,
                ),
            ) as unknown as typeof fetch;

            const result = await fetchDirectoryCardsFromApi(baseDiscoveryState);

            expect(result).toMatchObject({
                ok: false,
                code,
                kind,
                retryable,
            });
        },
    );

    it('classifies fetch rejection as a retryable network failure', async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new TypeError('fetch failed');
        }) as unknown as typeof fetch;

        const result = await fetchDirectoryCardsFromApi(baseDiscoveryState);

        expect(result).toMatchObject({
            ok: false,
            code: 'NETWORK_ERROR',
            kind: 'network',
            retryable: true,
        });
    });

    it('rejects discovery rows without durable record identity', async () => {
        globalThis.fetch = vi.fn(async () =>
            createJsonResponse({
                results: [
                    {
                        title: 'Unidentified request',
                        summary: 'Missing URI and author DID.',
                        status: 'open',
                        category: 'food',
                        urgency: 'medium',
                        updatedAt: '2026-07-11T00:00:00.000Z',
                    },
                ],
            }),
        ) as unknown as typeof fetch;

        const result = await fetchFeedRecordsFromApi(baseDiscoveryState, 'feed');

        expect(result).toMatchObject({
            ok: false,
            code: 'INVALID_API_RESPONSE',
            kind: 'validation',
            retryable: false,
        });
    });

    it('reports an aid post without accepting browser-supplied identity', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({ reportId: '41', created: true }, true, 201),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await reportAidPostViaApi({
            subjectUri:
                'at://did:plc:subject/app.patchwork.aid.post/unsafe-post',
            reason: 'fraud',
            details: 'The request asks users to send prepaid cards.',
        });

        expect(result).toEqual({
            ok: true,
            data: { reportId: '41', created: true },
        });
        const [, init] = (
            fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
        )[0]!;
        expect(init).toMatchObject({
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/json',
                'idempotency-key': expect.any(String),
            },
        });
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
            subjectUri:
                'at://did:plc:subject/app.patchwork.aid.post/unsafe-post',
            reason: 'fraud',
            details: 'The request asks users to send prepaid cards.',
        });
        expect(body['commandId']).toEqual(expect.any(String));
        expect(body).not.toHaveProperty('reporterDid');
        expect(body).not.toHaveProperty('actorDid');
    });

    it('blocks the record author without accepting browser-supplied identity', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({ blockId: '51', created: true }, true, 201),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await blockUserViaApi({
            subjectDid: 'did:plc:subject',
            reason: 'Unsafe contact after request publication.',
        });

        expect(result).toEqual({
            ok: true,
            data: { blockId: '51', created: true },
        });
        const [, init] = (
            fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
        )[0]!;
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
            subjectDid: 'did:plc:subject',
            reason: 'Unsafe contact after request publication.',
            commandId: expect.any(String),
        });
        expect(body).not.toHaveProperty('blockerDid');
        expect(body).not.toHaveProperty('actorDid');
    });

    it('transitions lifecycle status without browser-supplied actor or role', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                postUri:
                    'at://did:plc:subject/app.patchwork.aid.post/lifecycle-1',
                previousStatus: 'open',
                currentStatus: 'resolved',
                transition: {},
                timeline: [],
                updatedAt: '2026-07-11T00:00:00.000Z',
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const hostileInput: LifecycleTransitionApiInput & {
            actorDid: string;
            actorRole: string;
        } = {
            postUri:
                'at://did:plc:subject/app.patchwork.aid.post/lifecycle-1',
            targetStatus: 'resolved',
            actorDid: 'did:plc:hostile-browser',
            actorRole: 'admin',
        };
        await transitionAidPostViaApi(hostileInput);

        const [, init] = (
            fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
        )[0]!;
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
            postUri:
                'at://did:plc:subject/app.patchwork.aid.post/lifecycle-1',
            targetStatus: 'resolved',
        });
        expect(body).not.toHaveProperty('actorDid');
        expect(body).not.toHaveProperty('actorRole');
    });

    it('reconciles durable lifecycle status to the owner AT record without browser identity', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                uri: 'at://did:plc:owner/app.patchwork.aid.post/post-1',
                cid: 'bafy-synced',
                record: {
                    $type: 'app.patchwork.aid.post',
                    version: '1.0.0',
                    title: 'Need groceries',
                    description: 'Delivery requested.',
                    category: 'food',
                    urgency: 'medium',
                    status: 'in-progress',
                    location: {
                        latitude: 41.88,
                        longitude: -87.63,
                        precisionKm: 3,
                    },
                    createdAt: '2026-07-11T12:00:00.000Z',
                    updatedAt: '2026-07-11T12:05:00.000Z',
                },
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await reconcileAidPostStatusViaApi({
            uri: 'at://did:plc:owner/app.patchwork.aid.post/post-1',
            expectedCid: 'bafy-before',
            updatedAt: '2026-07-11T12:05:00.000Z',
        });

        expect(result.ok).toBe(true);
        const [, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(JSON.parse(String(init.body))).toEqual({
            uri: 'at://did:plc:owner/app.patchwork.aid.post/post-1',
            expectedCid: 'bafy-before',
            updatedAt: '2026-07-11T12:05:00.000Z',
        });
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('actorDid');
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('actorRole');
    });

    it('loads private lifecycle state with an authenticated identity-free GET', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                postUri: 'at://did:plc:owner/app.patchwork.aid.post/post-1',
                currentStatus: 'open',
                statusLabel: 'Open',
                timeline: [],
                validTransitions: ['open', 'resolved'],
                updatedAt: '2026-07-11T12:00:00.000Z',
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await queryAidPostLifecycleViaApi(
            'at://did:plc:owner/app.patchwork.aid.post/post-1',
        );

        expect(result.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toContain('/aid/post/lifecycle?postUri=');
        expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
        expect(url).not.toContain('actorRole');
        expect(url).not.toContain('actorDid');
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
            fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>
        )[0];
        const url = firstCall?.[0];
        expect(String(url)).toContain('/chat/initiate');
        expect(String(url)).not.toContain('?');
        expect(firstCall?.[1].method).toBe('POST');
        expect(JSON.parse(String(firstCall?.[1].body))).toMatchObject({
            allowInitiation: true,
            supportsAtprotoChat: false,
        });
    });

    it('creates aid post via API and maps response to feed record envelope', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                uri: 'at://did:example:resident-1/app.patchwork.aid.post/post-new-1',
                cid: 'bafy-created',
                record: {
                    $type: 'app.patchwork.aid.post',
                    version: '1.0.0',
                    title: 'Need transport to clinic',
                    description: 'Wheelchair-compatible ride needed by 18:00.',
                    category: 'transport',
                    urgency: 'critical',
                    status: 'open',
                    location: {
                        latitude: 1.3,
                        longitude: 103.8,
                        precisionKm: 1,
                    },
                    createdAt: '2026-02-28T18:00:00.000Z',
                    updatedAt: '2026-02-28T18:00:00.000Z',
                },
            }),
        );

        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const hostileInput: AidPostCreateApiInput & { authorDid: string } = {
            authorDid: 'did:plc:hostile-browser',
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
        };
        const result = await createAidPostViaApi(hostileInput);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.data.card.title).toBe('Need transport to clinic');
        expect(result.data.card.urgency).toBe(5);
        expect(result.data.aidPostUri).toContain('/post-new-1');
        expect(result.data.recipientDid).toBe('did:example:resident-1');

        const firstCall = (
            fetchMock.mock.calls as unknown as Array<[unknown, unknown]>
        )[0];
        const url = firstCall?.[0];
        const init = firstCall?.[1] as RequestInit | undefined;
        expect(String(url)).toContain('/at/aid-posts');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
            'idempotency-key': expect.any(String),
        });
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body['category']).toBe('transport');
        expect(body['urgency']).toBe('critical');
        expect(body['location']).toEqual({
            latitude: 1.3,
            longitude: 103.8,
            precisionKm: 1,
        });
    });

    it('creates an authenticated AT aid post with browser credentials', async () => {
        const record = {
            $type: 'app.patchwork.aid.post' as const,
            version: '1.0.0' as const,
            title: 'Need groceries',
            description: 'Grocery delivery needed this afternoon.',
            category: 'food' as const,
            urgency: 'medium' as const,
            status: 'open' as const,
            location: {
                latitude: 41.88,
                longitude: -87.63,
                precisionKm: 1,
            },
            createdAt: '2026-07-10T12:00:00.000Z',
        };
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                uri: 'at://did:plc:alice/app.patchwork.aid.post/3abc',
                cid: 'bafy-created',
                record,
            }, true, 201),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(createAtAidPostViaApi(record)).resolves.toMatchObject({
            ok: true,
            data: { cid: 'bafy-created' },
        });
        const call = (
            fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>
        )[0];
        expect(String(call?.[0])).toContain('/at/aid-posts');
        expect(call?.[1].credentials).toBe('include');
    });
});
