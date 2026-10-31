import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
    PaymentWebhookReceipt,
    PaymentWebhookSource,
} from '../payments/payment-webhook-service.js';
import {
    StripeSignatureError,
    verifyStripeSignature,
} from '../payments/stripe-signature.js';
import { readRawBody } from './json-body.js';
import {
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './error-response.js';

export const paymentWebhookPaths: Readonly<Record<string, PaymentWebhookSource>> = {
    '/internal/payments/stripe/webhook': 'platform',
    '/internal/payments/stripe/connect-webhook': 'connect',
};

export const isPaymentWebhookRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    request.method === 'POST' &&
    Object.hasOwn(paymentWebhookPaths, requestUrl.pathname);

const eventIdPattern = /^evt_[A-Za-z0-9]{1,255}$/u;
const accountIdPattern = /^acct_[A-Za-z0-9]{1,255}$/u;
const eventTypePattern = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/u;

const invalidPayload = () =>
    new PublicHttpError(
        400,
        'INVALID_STRIPE_EVENT',
        'The webhook payload is not a Stripe event.',
    );

const parseReceipt = (
    payload: Buffer,
    source: PaymentWebhookSource,
): PaymentWebhookReceipt => {
    let body: unknown;
    try {
        body = JSON.parse(payload.toString('utf8'));
    } catch {
        throw invalidPayload();
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw invalidPayload();
    }
    const record = body as Record<string, unknown>;
    const { id, type, livemode, created, account } = record;
    if (
        record['object'] !== 'event' ||
        typeof id !== 'string' ||
        !eventIdPattern.test(id) ||
        typeof type !== 'string' ||
        type.length > 120 ||
        !eventTypePattern.test(type) ||
        typeof livemode !== 'boolean' ||
        typeof created !== 'number' ||
        !Number.isInteger(created) ||
        created <= 0
    ) {
        throw invalidPayload();
    }
    if (source === 'connect') {
        if (typeof account !== 'string' || !accountIdPattern.test(account)) {
            throw invalidPayload();
        }
        return { eventId: id, source, accountId: account, type, livemode, created };
    }
    if (account !== undefined && account !== null) throw invalidPayload();
    return { eventId: id, source, type, livemode, created };
};

export const createPaymentWebhookHandler = (dependencies: {
    service: {
        receive(receipt: PaymentWebhookReceipt): Promise<boolean>;
    };
    platformSecret: string;
    connectSecret: string;
    expectedLivemode: boolean;
    onSignatureFailure?: (source: PaymentWebhookSource) => void;
    onRecorded?: () => void;
    nowSeconds?: () => number;
}) => (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!isPaymentWebhookRoute(request, requestUrl)) return false;
    const source = paymentWebhookPaths[requestUrl.pathname]!;
    void (async () => {
        try {
            response.setHeader('cache-control', 'no-store');
            const payload = await readRawBody(request);
            try {
                verifyStripeSignature({
                    payload,
                    header: request.headers['stripe-signature'],
                    secret:
                        source === 'platform' ?
                            dependencies.platformSecret
                        :   dependencies.connectSecret,
                    nowSeconds: dependencies.nowSeconds?.(),
                });
            } catch (error) {
                if (error instanceof StripeSignatureError) {
                    dependencies.onSignatureFailure?.(source);
                    throw new PublicHttpError(
                        400,
                        'INVALID_STRIPE_SIGNATURE',
                        'The webhook signature is invalid.',
                    );
                }
                throw error;
            }
            const receipt = parseReceipt(payload, source);
            if (receipt.livemode !== dependencies.expectedLivemode) {
                throw new PublicHttpError(
                    400,
                    'STRIPE_MODE_MISMATCH',
                    'The webhook event mode does not match this deployment.',
                );
            }
            const recorded = await dependencies.service.receive(receipt);
            if (recorded) dependencies.onRecorded?.();
            writeJsonResponse(response, 200, {
                received: true,
                duplicate: !recorded,
            });
        } catch (error) {
            if (!response.headersSent) writePublicError(response, error);
        }
    })();
    return true;
};
