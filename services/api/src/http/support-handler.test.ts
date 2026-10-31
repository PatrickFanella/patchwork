import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import { PaymentModerationError } from '../payments/payment-moderation-service.js';
import { SupportServiceError } from '../payments/support-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { PublicHttpError } from './error-response.js';
import { createSupportHandler } from './support-handler.js';

const donorDid = 'did:plc:handlerdonor';
const moderatorDid = 'did:plc:handlermoderator';
const principal = (did: string, role: 'user' | 'moderator' = 'user'): AuthenticatedRequest => ({
    sessionToken: 'opaque',
    session: { did },
    principal: { did, role, authorization: createAuthorizationContext(did, role) },
}) as AuthenticatedRequest;

describe('support HTTP boundary', () => {
    const service = {
        getOptions: vi.fn(),
        createCheckout: vi.fn(),
        getCheckoutStatus: vi.fn(),
        createPortalSession: vi.fn(),
        getAccountSupport: vi.fn(),
        listEligibleOrganizations: vi.fn(),
        updateRecognition: vi.fn(),
        listBadgeHolders: vi.fn(),
        listPublicSupporters: vi.fn(),
    };
    const organizations = {
        getStatus: vi.fn(),
        startOnboarding: vi.fn(),
    };
    const moderation = {
        listRecipients: vi.fn(),
        suspend: vi.fn(),
        restore: vi.fn(),
    };
    const authenticate = vi.fn<(request: unknown) => Promise<AuthenticatedRequest>>();
    const authenticateOptional = vi.fn<(request: unknown) => Promise<AuthenticatedRequest | undefined>>();
    let origin: string;
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        const handler = createSupportHandler({ service, organizations, moderation, authenticate, authenticateOptional });
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
        for (const mock of [...Object.values(service), ...Object.values(organizations), ...Object.values(moderation)]) mock.mockReset();
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
        expect(service.createPortalSession).toHaveBeenCalledWith(donorDid, undefined);
        await fetch(`${origin}/support/portal`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ recipientId: 'r1' }),
        });
        expect(service.createPortalSession).toHaveBeenLastCalledWith(donorDid, 'r1');
        const account = await fetch(`${origin}/account/support`);
        expect(account.status).toBe(200);
        expect(service.getAccountSupport).toHaveBeenCalledWith(donorDid);

        authenticate.mockRejectedValue(new PublicHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in.'));
        expect((await fetch(`${origin}/account/support`)).status).toBe(401);
        expect((await fetch(`${origin}/support/portal`, { method: 'POST' })).status).toBe(401);
    });

    it('answers eligibility for a batch of organizations without a session', async () => {
        service.listEligibleOrganizations.mockResolvedValue(['b']);
        const response = await fetch(`${origin}/support/recipients?organization=a&organization=b`);
        await expect(response.json()).resolves.toEqual({ eligibleOrganizationIds: ['b'] });
        expect(service.listEligibleOrganizations).toHaveBeenCalledWith(['a', 'b']);
        expect(authenticate).not.toHaveBeenCalled();
    });

    it('routes organization payment status and onboarding for the signed-in actor', async () => {
        organizations.getStatus.mockResolvedValue({ status: 'not-started' });
        organizations.startOnboarding.mockResolvedValue({ url: 'https://connect.stripe.test/x' });
        const status = await fetch(`${origin}/organizations/payments?organization=o1`);
        expect(status.status).toBe(200);
        expect(organizations.getStatus).toHaveBeenCalledWith(donorDid, 'o1');
        const onboarding = await fetch(`${origin}/organizations/payments/onboarding`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ organizationId: 'o1' }),
        });
        await expect(onboarding.json()).resolves.toEqual({ url: 'https://connect.stripe.test/x' });
        expect(organizations.startOnboarding).toHaveBeenCalledWith(donorDid, 'o1');

        const { OrganizationPaymentsError } = await import('../payments/organization-payments-service.js');
        for (const [code, statusCode] of [
            ['ORGANIZATION_PAYMENTS_FORBIDDEN', 403],
            ['ORGANIZATION_NOT_VERIFIED', 409],
            ['STRIPE_UNAVAILABLE', 503],
        ] as const) {
            organizations.getStatus.mockRejectedValueOnce(new OrganizationPaymentsError(code));
            const failed = await fetch(`${origin}/organizations/payments?organization=o1`);
            expect(failed.status).toBe(statusCode);
            await expect(failed.json()).resolves.toMatchObject({ error: { code } });
        }
    });

    it('serves badges and the public supporters list without a session, and saves recognition with one', async () => {
        service.listBadgeHolders.mockResolvedValue(['did:plc:b']);
        service.listPublicSupporters.mockResolvedValue(['did:plc:c']);
        const badges = await fetch(`${origin}/support/badges?did=did:plc:a&did=did:plc:b`);
        await expect(badges.json()).resolves.toEqual({ supporterDids: ['did:plc:b'] });
        expect(service.listBadgeHolders).toHaveBeenCalledWith(['did:plc:a', 'did:plc:b']);
        const supporters = await fetch(`${origin}/support/supporters`);
        await expect(supporters.json()).resolves.toEqual({ supporterDids: ['did:plc:c'] });
        expect(authenticate).not.toHaveBeenCalled();

        const recognition = { badgeVisible: true, listedPublicly: false, shareNameWithRecipient: true };
        service.updateRecognition.mockResolvedValue(recognition);
        const saved = await fetch(`${origin}/account/support/recognition`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(recognition),
        });
        await expect(saved.json()).resolves.toEqual({ recognition });
        expect(service.updateRecognition).toHaveBeenCalledWith(donorDid, recognition);
        authenticate.mockRejectedValueOnce(new PublicHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in.'));
        const unauthenticated = await fetch(`${origin}/account/support/recognition`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(recognition),
        });
        expect(unauthenticated.status).toBe(401);
    });

    it('lets only moderators list, suspend and restore organization recipients', async () => {
        const recipientId = '61111111-1111-4111-8111-111111111111';
        const forbidden = await fetch(`${origin}/moderation/payment-recipients`);
        expect(forbidden.status).toBe(403);
        expect(await forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
        const forbiddenSuspend = await fetch(`${origin}/moderation/payment-recipients/suspend`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ recipientId, reason: 'Fraud report' }),
        });
        expect(forbiddenSuspend.status).toBe(403);
        expect(moderation.suspend).not.toHaveBeenCalled();

        authenticate.mockResolvedValue(principal(moderatorDid, 'moderator'));
        moderation.listRecipients.mockResolvedValue([{ recipientId, status: 'active' }]);
        const listed = await fetch(`${origin}/moderation/payment-recipients`);
        expect(await listed.json()).toEqual({ recipients: [{ recipientId, status: 'active' }] });

        moderation.suspend.mockResolvedValue({ recipientId, status: 'suspended' });
        const suspended = await fetch(`${origin}/moderation/payment-recipients/suspend`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ recipientId, reason: 'Fraud report' }),
        });
        expect(suspended.status).toBe(200);
        expect(moderation.suspend).toHaveBeenCalledWith(moderatorDid, { recipientId, reason: 'Fraud report' });

        moderation.restore.mockRejectedValue(new PaymentModerationError('PAYMENT_RECIPIENT_NOT_SUSPENDED'));
        const restored = await fetch(`${origin}/moderation/payment-recipients/restore`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ recipientId, reason: 'Resolved' }),
        });
        expect(restored.status).toBe(409);
        expect(await restored.json()).toMatchObject({ error: { code: 'PAYMENT_RECIPIENT_NOT_SUSPENDED' } });
    });
});
