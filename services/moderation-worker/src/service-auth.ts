import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const equalSecret = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
        leftBuffer.length === rightBuffer.length &&
        timingSafeEqual(leftBuffer, rightBuffer)
    );
};

export const hasValidServiceCredential = (
    request: IncomingMessage,
    expectedToken: string | undefined,
): boolean => {
    if (!expectedToken) return false;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return false;
    const supplied = authorization.slice('Bearer '.length);
    return equalSecret(supplied, expectedToken);
};
