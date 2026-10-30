import { describe, expect, it, vi } from 'vitest';
import { HttpStripeGateway, StripeApiError } from './stripe-gateway.js';

const event = {
    id: 'evt_1Fetched',
    object: 'event',
    type: 'account.updated',
    livemode: false,
    created: 1_793_400_000,
    account: 'acct_1Org',
    data: { object: { id: 'acct_1Org', charges_enabled: true } },
};

const respond = (status: number, body: unknown = {}) =>
    vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(body), { status }),
    );

describe('HttpStripeGateway', () => {
    it('fetches events with the secret key and connected-account header', async () => {
        const fetchMock = respond(200, event);
        const gateway = new HttpStripeGateway('sk_test_key', {
            baseUrl: 'https://stripe.example.test',
            fetch: fetchMock,
        });
        await expect(gateway.retrieveEvent('evt_1Fetched', 'acct_1Org')).resolves.toEqual({
            id: 'evt_1Fetched',
            type: 'account.updated',
            livemode: false,
            created: 1_793_400_000,
            account: 'acct_1Org',
            data: { object: { id: 'acct_1Org', charges_enabled: true } },
        });
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://stripe.example.test/v1/events/evt_1Fetched');
        expect(init?.headers).toEqual({
            authorization: 'Bearer sk_test_key',
            'stripe-account': 'acct_1Org',
        });
    });

    it('never builds a request path from an invalid identifier', async () => {
        const fetchMock = respond(200, event);
        const gateway = new HttpStripeGateway('sk_test_key', { fetch: fetchMock });
        await expect(gateway.retrieveEvent('evt_../../v1/charges')).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        await expect(gateway.retrieveEvent('evt_1Ok', 'acct_1\nx')).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [404, 'NOT_FOUND', false],
        [401, 'UNAUTHORIZED', true],
        [429, 'RATE_LIMITED', true],
        [503, 'UNAVAILABLE', true],
    ] as const)('maps HTTP %i to %s', async (status, code, retryable) => {
        const gateway = new HttpStripeGateway('sk_test_key', { fetch: respond(status) });
        const error = await gateway.retrieveEvent('evt_1Fetched').catch(caught => caught);
        expect(error).toBeInstanceOf(StripeApiError);
        expect(error).toMatchObject({ code, retryable });
    });

    it('treats network failures as retryable and malformed events as permanent', async () => {
        const offline = new HttpStripeGateway('sk_test_key', {
            fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
        });
        await expect(offline.retrieveEvent('evt_1Fetched')).rejects.toMatchObject({
            code: 'UNAVAILABLE',
            retryable: true,
        });
        const malformed = new HttpStripeGateway('sk_test_key', {
            fetch: respond(200, { ...event, object: 'charge' }),
        });
        await expect(malformed.retrieveEvent('evt_1Fetched')).rejects.toMatchObject({
            code: 'INVALID_RESPONSE',
            retryable: false,
        });
    });
});
