import { describe, expect, it, vi } from 'vitest';
import { encodeStripeForm, HttpStripeGateway, StripeApiError } from './stripe-gateway.js';

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
            'stripe-version': '2025-03-31.basil',
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

    it('encodes nested Checkout parameters in Stripe form notation', () => {
        expect(encodeStripeForm({
            mode: 'payment',
            line_items: [{ quantity: 1, price_data: { unit_amount: 500, product_data: { name: 'Gift & thanks' } } }],
            metadata: { patchwork_checkout_id: 'c1' },
            customer: undefined,
        }).toString()).toBe(
            'mode=payment&line_items%5B0%5D%5Bquantity%5D=1'
            + '&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=500'
            + '&line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=Gift+%26+thanks'
            + '&metadata%5Bpatchwork_checkout_id%5D=c1',
        );
    });

    it('posts Checkout sessions with an idempotency key and parses the result', async () => {
        const fetchMock = respond(200, {
            id: 'cs_test_1Abc', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_1Abc',
            status: 'open', payment_status: 'unpaid', mode: 'payment', livemode: false,
            customer: { id: 'cus_1Expanded' }, payment_intent: null,
        });
        const gateway = new HttpStripeGateway('sk_test_key', { fetch: fetchMock });
        await expect(gateway.createCheckoutSession({ mode: 'payment' }, 'patchwork-checkout-1')).resolves.toEqual({
            id: 'cs_test_1Abc', url: 'https://checkout.stripe.com/c/pay/cs_test_1Abc', status: 'open',
            paymentStatus: 'unpaid', mode: 'payment', livemode: false, customer: 'cus_1Expanded',
        });
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
        expect(init).toMatchObject({
            method: 'POST',
            body: 'mode=payment',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'idempotency-key': 'patchwork-checkout-1',
                'stripe-version': '2025-03-31.basil',
            },
        });
    });

    it('reads subscription periods from items on Basil and from the subscription before it', async () => {
        const base = {
            id: 'sub_1Shape', object: 'subscription', status: 'active', livemode: false,
            customer: 'cus_1Shape', cancel_at_period_end: true, pause_collection: { behavior: 'void' },
            metadata: { patchwork_checkout_id: 'c1', ignored: 5 },
        };
        const basil = new HttpStripeGateway('sk_test_key', {
            fetch: respond(200, { ...base, items: { data: [{ current_period_end: 1_800_000_000 }] } }),
        });
        await expect(basil.retrieveSubscription('sub_1Shape')).resolves.toEqual({
            id: 'sub_1Shape', status: 'active', livemode: false, customer: 'cus_1Shape',
            cancelAtPeriodEnd: true, currentPeriodEnd: 1_800_000_000, collectionPaused: true,
            metadata: { patchwork_checkout_id: 'c1' },
        });
        const legacy = new HttpStripeGateway('sk_test_key', {
            fetch: respond(200, { ...base, pause_collection: null, current_period_end: 1_700_000_000 }),
        });
        await expect(legacy.retrieveSubscription('sub_1Shape')).resolves.toMatchObject({
            currentPeriodEnd: 1_700_000_000, collectionPaused: false,
        });
    });

    it('treats invalid requests as permanent failures', async () => {
        const gateway = new HttpStripeGateway('sk_test_key', { fetch: respond(400, { error: { type: 'invalid_request_error' } }) });
        await expect(gateway.createCheckoutSession({}, 'k')).rejects.toMatchObject({
            code: 'INVALID_REQUEST', retryable: false,
        });
    });
});
