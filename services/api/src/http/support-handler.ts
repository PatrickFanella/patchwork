import type { IncomingMessage, ServerResponse } from 'node:http';
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
    ['/account/support', ['GET']],
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

const mapError = (error: unknown): unknown => {
    if (!(error instanceof SupportServiceError)) return error;
    const [status, message] = errors[error.code];
    return new PublicHttpError(status, error.code, message);
};

export const createSupportHandler = (dependencies: {
    service: Pick<
        SupportService,
        'getOptions' | 'createCheckout' | 'getCheckoutStatus' | 'createPortalSession' | 'getAccountSupport'
    >;
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
            const authenticated = await dependencies.authenticate(request);
            if (pathname === '/support/portal') {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.createPortalSession(authenticated.principal.did),
                );
                return;
            }
            writeJsonResponse(
                response,
                200,
                await dependencies.service.getAccountSupport(authenticated.principal.did),
            );
        } catch (error) {
            if (!response.headersSent) writePublicError(response, mapError(error));
        }
    })();
    return true;
};
