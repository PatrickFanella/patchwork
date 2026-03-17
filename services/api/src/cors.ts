/**
 * CORS header generation locked by environment.
 *
 * - **production** – only the configured `API_PUBLIC_ORIGIN` is allowed.
 * - **development / test** – any localhost origin is allowed so that the
 *   Vite dev server (or tests) can talk to the API without friction.
 */

export interface CorsHeaders {
    'access-control-allow-origin': string;
    'access-control-allow-methods': string;
    'access-control-allow-headers': string;
    'access-control-max-age': string;
    'vary': string;
}

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';
const MAX_AGE = '86400'; // 24 hours

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Determine the correct CORS headers for a given request origin and
 * deployment environment.
 *
 * @param origin - The value of the request's `Origin` header (may be undefined).
 * @param env - `"production"`, `"development"`, or `"test"`.
 * @param publicOrigin - The configured public origin (API_PUBLIC_ORIGIN).
 */
export const getCorsHeaders = (
    origin: string | undefined,
    env: string,
    publicOrigin: string,
): CorsHeaders => {
    let allowedOrigin: string;

    if (env === 'production') {
        // In production only the configured public origin is accepted.
        allowedOrigin = origin === publicOrigin ? publicOrigin : '';
    } else {
        // In development / test allow any localhost origin, or the configured
        // public origin, so Vite dev server works out of the box.
        if (origin && LOCALHOST_PATTERN.test(origin)) {
            allowedOrigin = origin;
        } else if (origin === publicOrigin) {
            allowedOrigin = publicOrigin;
        } else {
            // If no origin header present (e.g. curl), echo the public origin.
            allowedOrigin = origin ? '' : publicOrigin;
        }
    }

    return {
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-methods': ALLOWED_METHODS,
        'access-control-allow-headers': ALLOWED_HEADERS,
        'access-control-max-age': MAX_AGE,
        'vary': 'Origin',
    };
};
