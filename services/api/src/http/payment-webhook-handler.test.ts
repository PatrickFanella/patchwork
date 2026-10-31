import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentWebhookReceipt } from '../payments/payment-webhook-service.js';
import { signStripePayload } from '../payments/stripe-signature.js';
import { createPaymentWebhookHandler } from './payment-webhook-handler.js';

const platformSecret = 'whsec_platform_secret';
const connectSecret = 'whsec_connect_secret';
const now = 1_793_400_000;

describe('Stripe webhook HTTP boundary', () => {
    const receive = vi.fn<(receipt: PaymentWebhookReceipt) => Promise<boolean>>();
    const onSignatureFailure = vi.fn();
    const onRecorded = vi.fn();
    let origin: string;
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        const handler = createPaymentWebhookHandler({
            service: { receive },
            platformSecret,
            connectSecret,
            expectedLivemode: false,
            onSignatureFailure,
            onRecorded,
            nowSeconds: () => now,
        });
        server = createServer((request, response) => {
            if (!handler(request, response, new URL(request.url ?? '/', 'http://localhost'))) {
                response.writeHead(404).end();
            }
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No test address.');
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    beforeEach(() => {
        receive.mockReset();
        receive.mockResolvedValue(true);
        onSignatureFailure.mockReset();
        onRecorded.mockReset();
    });

    const event = (overrides: Record<string, unknown> = {}) => ({
        id: 'evt_1PlatformEvent',
        object: 'event',
        type: 'checkout.session.completed',
        livemode: false,
        created: now - 5,
        data: { object: { id: 'cs_test_1', customer_email: 'donor@example.test' } },
        ...overrides,
    });

    const post = (
        path: string,
        body: string,
        secret: string | undefined,
        headers: Record<string, string> = {},
    ) =>
        fetch(`${origin}${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(secret ? { 'stripe-signature': signStripePayload(body, secret, now) } : {}),
                ...headers,
            },
            body,
        });

    it('records a signed platform event using identifiers only', async () => {
        const body = JSON.stringify(event());
        const response = await post('/internal/payments/stripe/webhook', body, platformSecret);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({ received: true, duplicate: false });
        expect(receive).toHaveBeenCalledWith({
            eventId: 'evt_1PlatformEvent',
            source: 'platform',
            type: 'checkout.session.completed',
            livemode: false,
            created: now - 5,
        });
        expect(JSON.stringify(receive.mock.calls)).not.toContain('donor@example.test');
        expect(onRecorded).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a duplicate delivery without asking for processing', async () => {
        receive.mockResolvedValue(false);
        const body = JSON.stringify(event());
        const response = await post('/internal/payments/stripe/webhook', body, platformSecret);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
        expect(onRecorded).not.toHaveBeenCalled();
    });

    it('requires a connected account on the Connect endpoint and its own secret', async () => {
        const connected = JSON.stringify(event({ id: 'evt_1Connect', account: 'acct_1Org' }));
        const accepted = await post('/internal/payments/stripe/connect-webhook', connected, connectSecret);
        expect(accepted.status).toBe(200);
        expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({
            source: 'connect',
            accountId: 'acct_1Org',
        }));

        const crossSigned = await post('/internal/payments/stripe/connect-webhook', connected, platformSecret);
        expect(crossSigned.status).toBe(400);
        await expect(crossSigned.json()).resolves.toMatchObject({
            error: { code: 'INVALID_STRIPE_SIGNATURE' },
        });
        expect(onSignatureFailure).toHaveBeenCalledWith('connect');

        const noAccount = JSON.stringify(event({ id: 'evt_1NoAccount' }));
        const rejected = await post('/internal/payments/stripe/connect-webhook', noAccount, connectSecret);
        expect(rejected.status).toBe(400);
        await expect(rejected.json()).resolves.toMatchObject({
            error: { code: 'INVALID_STRIPE_EVENT' },
        });
    });

    it('rejects a connected-account event on the platform endpoint', async () => {
        const body = JSON.stringify(event({ account: 'acct_1Org' }));
        const response = await post('/internal/payments/stripe/webhook', body, platformSecret);
        expect(response.status).toBe(400);
        expect(receive).not.toHaveBeenCalled();
    });

    it('rejects unsigned, tampered, and stale deliveries before recording', async () => {
        const body = JSON.stringify(event());
        const unsigned = await post('/internal/payments/stripe/webhook', body, undefined);
        expect(unsigned.status).toBe(400);

        const signature = signStripePayload(body, platformSecret, now);
        const tampered = await post(
            '/internal/payments/stripe/webhook',
            body.replace('checkout.session.completed', 'invoice.paid'),
            undefined,
            { 'stripe-signature': signature },
        );
        expect(tampered.status).toBe(400);

        const stale = await post('/internal/payments/stripe/webhook', body, undefined, {
            'stripe-signature': signStripePayload(body, platformSecret, now - 600),
        });
        expect(stale.status).toBe(400);
        expect(receive).not.toHaveBeenCalled();
        expect(onSignatureFailure).toHaveBeenCalledTimes(3);
    });

    it('rejects an event from the other Stripe mode', async () => {
        const body = JSON.stringify(event({ livemode: true }));
        const response = await post('/internal/payments/stripe/webhook', body, platformSecret);
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'STRIPE_MODE_MISMATCH' },
        });
        expect(receive).not.toHaveBeenCalled();
    });

    it('rejects signed bodies that are not Stripe events', async () => {
        for (const body of [
            'not json',
            JSON.stringify([event()]),
            JSON.stringify(event({ object: 'charge' })),
            JSON.stringify(event({ id: 'ch_123' })),
            JSON.stringify(event({ type: 'Checkout Session' })),
            JSON.stringify(event({ created: '1793400000' })),
        ]) {
            const response = await post('/internal/payments/stripe/webhook', body, platformSecret);
            expect(response.status).toBe(400);
        }
        expect(receive).not.toHaveBeenCalled();
    });

    it('requires JSON and returns 500 when the receipt cannot be stored so Stripe retries', async () => {
        const body = JSON.stringify(event());
        const wrongType = await post('/internal/payments/stripe/webhook', body, platformSecret, {
            'content-type': 'text/plain',
        });
        expect(wrongType.status).toBe(415);

        receive.mockRejectedValue(new Error('database unavailable'));
        const failed = await post('/internal/payments/stripe/webhook', body, platformSecret);
        expect(failed.status).toBe(500);
        await expect(failed.json()).resolves.toMatchObject({
            error: { code: 'INTERNAL_ERROR' },
        });
    });

    it('ignores other paths and methods', async () => {
        const response = await fetch(`${origin}/internal/payments/stripe/webhook`);
        expect(response.status).toBe(404);
    });
});
