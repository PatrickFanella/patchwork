import { createHmac, timingSafeEqual } from 'node:crypto';

/** Stripe's documented default replay window for webhook timestamps. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeSignatureError extends Error {
    constructor(readonly code: 'MISSING' | 'MALFORMED' | 'STALE' | 'MISMATCH') {
        super(`Stripe signature check failed: ${code}`);
        this.name = 'StripeSignatureError';
    }
}

const parseHeader = (
    header: string,
): { timestamp: number; signatures: string[] } => {
    let timestamp: number | undefined;
    const signatures: string[] = [];
    for (const part of header.split(',')) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key === 't' && /^\d{1,12}$/u.test(value)) {
            timestamp = Number(value);
        } else if (key === 'v1' && /^[0-9a-f]{64}$/u.test(value)) {
            signatures.push(value);
        }
    }
    if (timestamp === undefined || signatures.length === 0) {
        throw new StripeSignatureError('MALFORMED');
    }
    return { timestamp, signatures };
};

/**
 * Verify a Stripe-Signature header against the exact request bytes.
 * Only v1 (HMAC-SHA256) signatures are accepted; v0 test signatures are ignored.
 */
export const verifyStripeSignature = (input: {
    payload: Buffer;
    header: string | string[] | undefined;
    secret: string;
    nowSeconds?: number;
    toleranceSeconds?: number;
}): void => {
    if (typeof input.header !== 'string' || input.header.length === 0) {
        throw new StripeSignatureError('MISSING');
    }
    if (input.header.length > 2048) {
        throw new StripeSignatureError('MALFORMED');
    }
    const { timestamp, signatures } = parseHeader(input.header);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const tolerance = input.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    if (Math.abs(now - timestamp) > tolerance) {
        throw new StripeSignatureError('STALE');
    }
    const expected = createHmac('sha256', input.secret)
        .update(`${timestamp}.`)
        .update(input.payload)
        .digest();
    const matched = signatures.some(signature =>
        timingSafeEqual(Buffer.from(signature, 'hex'), expected),
    );
    if (!matched) {
        throw new StripeSignatureError('MISMATCH');
    }
};

/** Build a signature header. Used by tests and local fixtures only. */
export const signStripePayload = (
    payload: Buffer | string,
    secret: string,
    timestamp: number,
): string => {
    const digest = createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(payload)
        .digest('hex');
    return `t=${timestamp},v1=${digest}`;
};
