/**
 * In-memory sliding-window rate limiter.
 *
 * Each key (typically a client IP) maintains a list of request timestamps.
 * When `check` is called the window is pruned of expired entries before
 * evaluating whether the caller is within their budget.
 *
 * No external dependencies -- the data structure lives entirely in process
 * memory and is lost on restart (which is acceptable for rate-limiting state).
 */

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
}

export interface RateLimiterOptions {
    windowMs: number;
    maxRequests: number;
}

export class RateLimiter {
    private readonly windowMs: number;
    private readonly maxRequests: number;
    private readonly hits = new Map<string, number[]>();

    constructor(options: RateLimiterOptions) {
        this.windowMs = options.windowMs;
        this.maxRequests = options.maxRequests;
    }

    /**
     * Check whether `key` is allowed to make another request.
     * If allowed the request is recorded; if not, no state change occurs.
     */
    check(key: string, now: number = Date.now()): RateLimitResult {
        const windowStart = now - this.windowMs;

        let timestamps = this.hits.get(key);
        if (timestamps) {
            // Prune entries outside the current window
            timestamps = timestamps.filter(t => t > windowStart);
            this.hits.set(key, timestamps);
        } else {
            timestamps = [];
            this.hits.set(key, timestamps);
        }

        if (timestamps.length >= this.maxRequests) {
            // Earliest entry determines when the window will next free a slot
            const oldestInWindow = timestamps[0]!;
            const retryAfterMs = oldestInWindow + this.windowMs - now;
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: Math.max(retryAfterMs, 0),
            };
        }

        timestamps.push(now);
        return {
            allowed: true,
            remaining: this.maxRequests - timestamps.length,
            retryAfterMs: 0,
        };
    }

    /** Reset all state for a key (useful in tests). */
    reset(key: string): void {
        this.hits.delete(key);
    }

    /** Reset all state for all keys. */
    resetAll(): void {
        this.hits.clear();
    }
}

/* ------------------------------------------------------------------ */
/*  Default rate-limiter instances for the API server                  */
/* ------------------------------------------------------------------ */

/** General API traffic: 100 req / 60 s */
export const generalLimiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
});

/** Auth endpoints: 10 req / 60 s */
export const authLimiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
});

/** Account-mutation endpoints: 5 req / 60 s */
export const mutationLimiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: 5,
});

/* ------------------------------------------------------------------ */
/*  Route classification                                              */
/* ------------------------------------------------------------------ */

const AUTH_PREFIXES = ['/auth/'];

const MUTATION_PREFIXES = [
    '/account/deactivate',
    '/account/export',
    '/account/settings',
];

/**
 * Select the appropriate rate limiter for a given route pathname.
 */
export const selectLimiter = (pathname: string): RateLimiter => {
    if (AUTH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        return authLimiter;
    }
    if (MUTATION_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        return mutationLimiter;
    }
    return generalLimiter;
};

/* ------------------------------------------------------------------ */
/*  Client-IP extraction                                              */
/* ------------------------------------------------------------------ */

/**
 * Extract a client identifier from the request for rate-limiting purposes.
 * Prefers X-Forwarded-For (first entry) then falls back to the socket
 * remote address, and finally to a catch-all key.
 */
export const extractClientIp = (
    headers: Record<string, string | string[] | undefined>,
    remoteAddress: string | undefined,
): string => {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0]!.trim();
    }
    return remoteAddress ?? 'unknown';
};
