import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileApiClient, type MobileApiClientConfig } from './api-client.js';
import { mobileContractStubs } from '@patchwork/shared';

const originalFetch = globalThis.fetch;

const createJsonResponse = (payload: unknown, ok = true, status = 200) => {
    return {
        ok,
        status,
        json: async () => payload,
    } as Response;
};

const createClientConfig = (
    overrides?: Partial<MobileApiClientConfig>,
): MobileApiClientConfig => ({
    appConfig: mobileContractStubs.appConfig,
    deviceInfo: mobileContractStubs.deviceInfo,
    accessToken: 'test-token-abc',
    ...overrides,
});

describe('MobileApiClient', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    it('includes mobile device headers in requests', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                service: 'api',
                status: 'ok',
                contractVersion: '0.9.0-phase9',
                did: 'did:example:test',
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig());
        await client.healthCheck();

        expect(fetchMock).toHaveBeenCalledOnce();
        const firstCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
        const headers = firstCall[1].headers as Record<string, string>;

        expect(headers['x-patchwork-platform']).toBe('ios');
        expect(headers['x-patchwork-app-version']).toBe('1.0.0');
        expect(headers['x-patchwork-device-id']).toBe('device-stub-001');
        expect(headers['authorization']).toBe('Bearer test-token-abc');
    });

    it('returns offline error when disconnected', async () => {
        const client = new MobileApiClient(createClientConfig());
        client.setConnected(false);

        const result = await client.healthCheck();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('offline');
            expect(result.offline).toBe(true);
        }
    });

    it('queries aid requests with correct parameters', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                total: 1,
                page: 1,
                pageSize: 20,
                hasNextPage: false,
                results: [],
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig());
        const result = await client.queryAidRequests({
            latitude: 40.7128,
            longitude: -74.006,
            radiusKm: 5,
            category: 'food',
            urgency: 'high',
        });

        expect(result.ok).toBe(true);

        const firstCall = (fetchMock.mock.calls as unknown as Array<[string]>)[0]!;
        const url = firstCall[0];
        expect(url).toContain('/query/feed?');
        expect(url).toContain('latitude=40.7128');
        expect(url).toContain('category=food');
        expect(url).toContain('urgency=high');
    });

    it('handles API error responses', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse(
                {
                    error: {
                        code: 'INVALID_QUERY',
                        message: 'Missing required fields.',
                    },
                },
                false,
                400,
            ),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig());
        const result = await client.healthCheck();

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('Missing required fields');
        }
    });

    it('initiates chat via POST with correct body', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({
                conversationUri: 'at://did:example:alice/conv/123',
                created: true,
                transportPath: 'atproto-direct',
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig());
        const result = await client.initiateChat({
            aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-1',
            initiatedByDid: 'did:example:helper',
            recipientDid: 'did:example:alice',
            initiatedFrom: 'feed',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.conversationUri).toContain('at://');
            expect(result.data.created).toBe(true);
        }

        const firstCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
        expect(firstCall[1].method).toBe('POST');
        const body = JSON.parse(firstCall[1].body as string) as Record<string, unknown>;
        expect(body['initiatedFrom']).toBe('feed');
    });

    it('registers push token with device info', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({ registered: true }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig());
        const result = await client.registerPushToken('token-xyz');

        expect(result.ok).toBe(true);

        const firstCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
        const body = JSON.parse(firstCall[1].body as string) as Record<string, unknown>;
        expect(body['pushToken']).toBe('token-xyz');
        expect(body['platform']).toBe('ios');
        expect(body['deviceId']).toBe('device-stub-001');
    });

    it('setAccessToken updates the authorization header', async () => {
        const fetchMock = vi.fn(async () =>
            createJsonResponse({ service: 'api', status: 'ok', contractVersion: '0.9.0', did: 'did:example:x' }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new MobileApiClient(createClientConfig({ accessToken: undefined }));

        // First call -- no auth header
        await client.healthCheck();
        const call1 = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
        expect((call1[1].headers as Record<string, string>)['authorization']).toBeUndefined();

        // Set token and call again
        client.setAccessToken('new-token');
        await client.healthCheck();
        const call2 = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[1]!;
        expect((call2[1].headers as Record<string, string>)['authorization']).toBe('Bearer new-token');
    });
});
