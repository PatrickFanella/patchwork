import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { PublicHttpError } from './error-response.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

const cookieValue = (
    headers: IncomingHttpHeaders,
    target: string,
): string | undefined => {
    for (const cookie of headers.cookie?.split(';') ?? []) {
        const [name, ...parts] = cookie.trim().split('=');
        if (name === target) {
            try {
                return decodeURIComponent(parts.join('='));
            } catch {
                return undefined;
            }
        }
    }
    return undefined;
};

const tokensMatch = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
        leftBuffer.length === rightBuffer.length &&
        timingSafeEqual(leftBuffer, rightBuffer)
    );
};

export const assertCsrfProtection = (
    request: { method?: string; headers: IncomingHttpHeaders },
    publicOrigin: string,
): void => {
    if (safeMethods.has(request.method ?? 'GET')) return;
    if (!cookieValue(request.headers, 'patchwork_session')) return;
    if (request.headers.origin !== publicOrigin) {
        throw new PublicHttpError(
            403,
            'CSRF_ORIGIN_INVALID',
            'The request origin is not allowed.',
        );
    }
    const cookieToken = cookieValue(request.headers, 'patchwork_csrf');
    const header = request.headers['x-csrf-token'];
    const headerToken = typeof header === 'string' ? header : undefined;
    if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
        throw new PublicHttpError(
            403,
            'CSRF_TOKEN_INVALID',
            'The CSRF token is missing or invalid.',
        );
    }
};

export const createCsrfToken = (): string => randomBytes(32).toString('base64url');

export const serializeCsrfCookie = (
    token: string,
    secure: boolean,
    maxAge = 12 * 60 * 60,
): string => {
    const attributes = [
        `patchwork_csrf=${encodeURIComponent(token)}`,
        'Path=/',
        'SameSite=Strict',
        `Max-Age=${maxAge}`,
    ];
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
};
