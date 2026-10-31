import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthorizationError, requireCapability } from '../authorization-guard.js';
import {
    OrganizationPaymentsError,
    type OrganizationPaymentsErrorCode,
    type OrganizationPaymentsService,
} from '../payments/organization-payments-service.js';
import {
    PaymentModerationError,
    type PaymentModerationErrorCode,
    type PaymentModerationService,
} from '../payments/payment-moderation-service.js';
import {
    SupportServiceError,
    type SupportService,
    type SupportServiceErrorCode,
} from '../payments/support-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { readJsonBody } from './json-body.js';
import {
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './error-response.js';

const routes = new Map<string, readonly string[]>([
    ['/support/tiers', ['GET']],
    ['/support/checkout', ['GET', 'POST']],
    ['/support/portal', ['POST']],
    ['/support/recipients', ['GET']],
    ['/account/support', ['GET']],
    ['/account/support/recognition', ['PUT']],
    ['/support/badges', ['GET']],
    ['/support/supporters', ['GET']],
    ['/organizations/payments', ['GET']],
    ['/organizations/payments/onboarding', ['POST']],
    ['/moderation/payment-recipients', ['GET']],
    ['/moderation/payment-recipients/suspend', ['POST']],
    ['/moderation/payment-recipients/restore', ['POST']],
]);

export const isSupportRoute = (request: IncomingMessage, requestUrl: URL): boolean =>
    routes.get(requestUrl.pathname)?.includes(request.method ?? '') ?? false;

const errors: Readonly<Record<SupportServiceErrorCode, [number, string]>> = {
    PAYMENTS_DISABLED: [503, 'Giving through Patchwork is not available right now.'],
    INVALID_SUPPORT_REQUEST: [400, 'Choose a one-time amount or a monthly tier.'],
    IDEMPOTENCY_KEY_INVALID: [400, 'The Idempotency-Key header must be a UUID.'],
    IDEMPOTENCY_KEY_REUSED: [409, 'This Idempotency-Key was used for a different request.'],
    RECIPIENT_UNAVAILABLE: [409, 'This recipient cannot receive gifts right now.'],
    TIER_UNAVAILABLE: [409, 'That monthly tier is no longer offered.'],
    CHECKOUT_CLOSED: [409, 'This checkout has already finished. Start a new one.'],
    CHECKOUT_NOT_FOUND: [404, 'That checkout was not found.'],
    CHECKOUT_UNAVAILABLE: [503, 'Stripe could not be reached. Try again in a moment.'],
    NO_SUPPORT_ACCOUNT: [404, 'There is no giving history to manage for this account.'],
};

const organizationErrors: Readonly<Record<OrganizationPaymentsErrorCode, [number, string]>> = {
    ORGANIZATION_NOT_FOUND: [404, 'That organization was not found.'],
    ORGANIZATION_PAYMENTS_FORBIDDEN: [403, 'Only organization owners and admins can manage payments.'],
    ORGANIZATION_NOT_VERIFIED: [409, 'The organization must be verified before it can receive gifts.'],
    ORGANIZATION_PAYMENTS_UNAVAILABLE: [409, 'This organization cannot receive gifts through Patchwork.'],
    PAYMENT_RECIPIENT_SUSPENDED: [409, 'Gifts to this organization are suspended.'],
    STRIPE_UNAVAILABLE: [503, 'Stripe could not be reached. Try again in a moment.'],
};

const moderationErrors: Readonly<Record<PaymentModerationErrorCode, [number, string]>> = {
    INVALID_MODERATION_REQUEST: [400, 'Choose a recipient and give a reason.'],
    PAYMENT_RECIPIENT_NOT_FOUND: [404, 'That payment recipient was not found.'],
    PAYMENT_RECIPIENT_CLOSED: [409, 'This recipient is closed and cannot change.'],
    PAYMENT_RECIPIENT_NOT_SUSPENDED: [409, 'This recipient is not suspended.'],
};

const mapError = (error: unknown): unknown => {
    if (error instanceof AuthorizationError) {
        return new PublicHttpError(error.statusCode, error.code, 'The required moderation capability is missing.');
    }
    if (error instanceof PaymentModerationError) {
        const [status, message] = moderationErrors[error.code];
        return new PublicHttpError(status, error.code, message);
    }
    if (error instanceof OrganizationPaymentsError) {
        const [status, message] = organizationErrors[error.code];
        return new PublicHttpError(status, error.code, message);
    }
    if (!(error instanceof SupportServiceError)) return error;
    const [status, message] = errors[error.code];
    return new PublicHttpError(status, error.code, message);
};

const optionalJsonBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
    if (!request.headers['content-type']) return {};
    const body = await readJsonBody(request, 4_096);
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
};

export const createSupportHandler = (dependencies: {
    service: Pick<
        SupportService,
        | 'getOptions'
        | 'createCheckout'
        | 'getCheckoutStatus'
        | 'createPortalSession'
        | 'getAccountSupport'
        | 'listEligibleOrganizations'
        | 'updateRecognition'
        | 'listBadgeHolders'
        | 'listPublicSupporters'
    >;
    organizations: Pick<OrganizationPaymentsService, 'getStatus' | 'startOnboarding'>;
    moderation: Pick<PaymentModerationService, 'listRecipients' | 'suspend' | 'restore'>;
    authenticate(request: IncomingMessage): Promise<AuthenticatedRequest>;
    authenticateOptional(request: IncomingMessage): Promise<AuthenticatedRequest | undefined>;
}) => (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!isSupportRoute(request, requestUrl)) return false;
    void (async () => {
        try {
            response.setHeader('cache-control', 'no-store');
            const { pathname } = requestUrl;
            if (pathname === '/support/tiers') {
                writeJsonResponse(response, 200, await dependencies.service.getOptions());
                return;
            }
            if (pathname === '/support/checkout' && request.method === 'GET') {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.getCheckoutStatus(
                        requestUrl.searchParams.get('checkout') ?? '',
                    ),
                );
                return;
            }
            if (pathname === '/support/checkout') {
                const header = request.headers['idempotency-key'];
                const clientKey = typeof header === 'string' ? header.trim() : '';
                if (!clientKey) {
                    throw new PublicHttpError(
                        400,
                        'IDEMPOTENCY_KEY_REQUIRED',
                        'An Idempotency-Key header is required.',
                    );
                }
                const authenticated = await dependencies.authenticateOptional(request);
                const body = await readJsonBody(request, 4_096);
                writeJsonResponse(
                    response,
                    201,
                    await dependencies.service.createCheckout({
                        body,
                        clientKey,
                        ...(authenticated ? { donorDid: authenticated.principal.did } : {}),
                    }),
                );
                return;
            }
            if (pathname === '/support/recipients') {
                writeJsonResponse(response, 200, {
                    eligibleOrganizationIds: await dependencies.service.listEligibleOrganizations(
                        requestUrl.searchParams.getAll('organization'),
                    ),
                });
                return;
            }
            if (pathname === '/support/badges') {
                writeJsonResponse(response, 200, {
                    supporterDids: await dependencies.service.listBadgeHolders(
                        requestUrl.searchParams.getAll('did'),
                    ),
                });
                return;
            }
            if (pathname === '/support/supporters') {
                writeJsonResponse(response, 200, {
                    supporterDids: await dependencies.service.listPublicSupporters(),
                });
                return;
            }
            const authenticated = await dependencies.authenticate(request);
            const actorDid = authenticated.principal.did;
            if (pathname.startsWith('/moderation/')) {
                requireCapability(authenticated.principal.authorization, 'moderate:users');
                if (request.method === 'GET') {
                    writeJsonResponse(response, 200, {
                        recipients: await dependencies.moderation.listRecipients(),
                    });
                    return;
                }
                const body = await readJsonBody(request, 4_096);
                writeJsonResponse(response, 200, {
                    recipient: pathname.endsWith('/suspend') ?
                        await dependencies.moderation.suspend(actorDid, body)
                    :   await dependencies.moderation.restore(actorDid, body),
                });
                return;
            }
            if (pathname === '/account/support/recognition') {
                writeJsonResponse(
                    response,
                    200,
                    {
                        recognition: await dependencies.service.updateRecognition(
                            actorDid,
                            await readJsonBody(request, 1_024),
                        ),
                    },
                );
                return;
            }
            if (pathname === '/support/portal') {
                const body = await optionalJsonBody(request);
                const recipientId = typeof body['recipientId'] === 'string' ? body['recipientId'] : undefined;
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.createPortalSession(actorDid, recipientId),
                );
                return;
            }
            if (pathname === '/organizations/payments') {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.organizations.getStatus(
                        actorDid,
                        requestUrl.searchParams.get('organization') ?? '',
                    ),
                );
                return;
            }
            if (pathname === '/organizations/payments/onboarding') {
                const body = await optionalJsonBody(request);
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.organizations.startOnboarding(
                        actorDid,
                        typeof body['organizationId'] === 'string' ? body['organizationId'] : '',
                    ),
                );
                return;
            }
            writeJsonResponse(
                response,
                200,
                await dependencies.service.getAccountSupport(actorDid),
            );
        } catch (error) {
            if (!response.headersSent) writePublicError(response, mapError(error));
        }
    })();
    return true;
};
