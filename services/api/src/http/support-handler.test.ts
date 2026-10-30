import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import { SupportServiceError } from '../payments/support-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { PublicHttpError } from './error-response.js';
import { createSupportHandler } from './support-handler.js';

const donorDid = 'did:plc:handlerdonor';
const principal = (did: string): AuthenticatedRequest => ({
    sessionToken: 'opaque',
    session: { did },
    principal: { did, role: 'user', authorization: createAuthorizationContext(did, 'user') },
}) as AuthenticatedRequest;

describe('support HTTP boundary', () => {
    const service = {
        getOptions: vi.fn(),
        createCheckout: vi.fn(),
        getCheckoutStatus: vi.fn(),
        createPortalSession: vi.fn(),
        getAccountSupport: vi.fn(),
    };
    const authenticate = vi.fn<(request: unknown) => Promise<AuthenticatedRequest>>();
    const authenticateOptional = vi.fn<(request: unknown) => Promise<AuthenticatedRequest | undefined>>();
    let origin: string;
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        const handler = createSupportHandler({ service, authenticate, authenticateOptional });
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
        for (const mock of Object.values(service)) mock.mockReset();
        authenticate.mockReset();
        authenticateOptional.mockReset();
        authenticate.mockResolvedValue(principal(donorDid));
        authenticateOptional.mockResolvedValue(undefined);
    });

    const postCheckout = (body: unknown, key?: string) =>
        fetch(`${origin}/support/checkout`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
            body: JSON.stringify(body),
        });

    it('serves public options without a session and never caches them', async () => {
        service.getOptions.mockResolvedValue({ paymentsEnabled: true, tiers: [] });
        const response = await fetch(`${origin}/support/tiers`);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(authenticate).not.toHaveBeenCalled();
    });

    it('creates guest and signed-in checkouts with the client key', async () => {
        service.createCheckout.mockResolvedValue({ checkoutId: 'c1', url: 'https://checkout.stripe.test/1' });
        const body = { recipient: 'general-fund', mode: 'one-time', amountMinor: 500 };
        const guest = await postCheckout(body, 'key-1');
        expect(guest.status).toBe(201);
        await expect(guest.json()).resolves.toEqual({ checkoutId: 'c1', url: 'https://checkout.stripe.test/1' });
        expect(service.createCheckout).toHaveBeenLastCalledWith({ body, clientKey: 'key-1' });

        authenticateOptional.mockResolvedValue(principal(donorDid));
        await postCheckout(body, 'key-2');
        expect(service.createCheckout).toHaveBeenLastCalledWith({ body, clientKey: 'key-2', donorDid });
    });

    it('requires an idempotency key and maps service errors to public codes', async () => {
        const missing = await postCheckout({}, undefined);
        expect(missing.status).toBe(400);
        await expect(missing.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });

        for (const [code, status] of [
            ['INVALID_SUPPORT_REQUEST', 400],
            ['IDEMPOTENCY_KEY_REUSED', 409],
            ['PAYMENTS_DISABLED', 503],
            ['CHECKOUT_UNAVAILABLE', 503],
        ] as const) {
            service.createCheckout.mockRejectedValueOnce(new SupportServiceError(code));
            const response = await postCheckout({}, 'key');
            expect(response.status).toBe(status);
            await expect(response.json()).resolves.toMatchObject({ error: { code } });
        }
    });

    it('reads checkout status from the query string', async () => {
        service.getCheckoutStatus.mockResolvedValue({ status: 'complete' });
        const response = await fetch(`${origin}/support/checkout?checkout=abc`);
        expect(response.status).toBe(200);
        expect(service.getCheckoutStatus).toHaveBeenCalledWith('abc');
        service.getCheckoutStatus.mockRejectedValueOnce(new SupportServiceError('CHECKOUT_NOT_FOUND'));
        expect((await fetch(`${origin}/support/checkout`)).status).toBe(404);
    });

    it('requires a session for the portal and account history', async () => {
        service.createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.test/x' });
        service.getAccountSupport.mockResolvedValue({ donations: [], subscriptions: [], canManage: false });
        const portal = await fetch(`${origin}/support/portal`, { method: 'POST' });
        expect(portal.status).toBe(200);
        expect(service.createPortalSession).toHaveBeenCalledWith(donorDid);
        const account = await fetch(`${origin}/account/support`);
        expect(account.status).toBe(200);
        expect(service.getAccountSupport).toHaveBeenCalledWith(donorDid);

        authenticate.mockRejectedValue(new PublicHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in.'));
        expect((await fetch(`${origin}/account/support`)).status).toBe(401);
        expect((await fetch(`${origin}/support/portal`, { method: 'POST' })).status).toBe(401);
    });
});
