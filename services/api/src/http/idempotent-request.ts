import type { IncomingHttpHeaders } from 'node:http';
import { PublicHttpError } from './error-response.js';

const keyPattern = /^[A-Za-z0-9._:-]{1,200}$/;

export const idempotencyKeyFromRequest = (request: {
    headers: IncomingHttpHeaders;
}): string => {
    const header = request.headers['idempotency-key'];
    const key = typeof header === 'string' ? header.trim() : '';
    if (!key) {
        throw new PublicHttpError(
            400,
            'IDEMPOTENCY_KEY_REQUIRED',
            'An Idempotency-Key header is required.',
        );
    }
    if (!keyPattern.test(key)) {
        throw new PublicHttpError(
            400,
            'IDEMPOTENCY_KEY_INVALID',
            'The Idempotency-Key header is invalid.',
        );
    }
    return key;
};

export const withIdempotencyKey = (
    body: unknown,
    key: string,
    field: 'commandId' | 'idempotencyKey' = 'commandId',
): Record<string, unknown> => ({
    ...(typeof body === 'object' && body !== null ? body : {}),
    [field]: key,
});
