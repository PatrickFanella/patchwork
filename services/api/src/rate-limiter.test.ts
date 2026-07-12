import { describe, expect, it, beforeEach } from 'vitest';
import {
    RateLimiter,
    selectLimiter,
    extractClientIp,
    generalLimiter,
    authLimiter,
    mutationLimiter,
    reportLimiter,
    moderationLimiter,
} from './rate-limiter.js';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 3 });
    });

    it('allows requests under the limit', () => {
        const r1 = limiter.check('a', 1000);
        expect(r1.allowed).toBe(true);
        expect(r1.remaining).toBe(2);
        expect(r1.retryAfterMs).toBe(0);

        const r2 = limiter.check('a', 2000);
        expect(r2.allowed).toBe(true);
        expect(r2.remaining).toBe(1);
    });

    it('rejects requests over the limit', () => {
        limiter.check('a', 1000);
        limiter.check('a', 2000);
        limiter.check('a', 3000);

        const r4 = limiter.check('a', 4000);
        expect(r4.allowed).toBe(false);
        expect(r4.remaining).toBe(0);
        expect(r4.retryAfterMs).toBeGreaterThan(0);
    });

    it('provides correct retryAfterMs', () => {
        limiter.check('a', 1000);
        limiter.check('a', 2000);
        limiter.check('a', 3000);

        const r = limiter.check('a', 4000);
        // Oldest entry is at 1000, window is 60_000, so retry after = 1000 + 60_000 - 4000 = 57_000
        expect(r.retryAfterMs).toBe(57_000);
    });

    it('allows requests once the window slides past old entries', () => {
        const now = 100_000;
        limiter.check('a', now);
        limiter.check('a', now + 1000);
        limiter.check('a', now + 2000);

        // Should be blocked inside the window
        expect(limiter.check('a', now + 3000).allowed).toBe(false);

        // After the window has passed the oldest entry (at `now`)
        // Remaining entries at now+1000 and now+2000 are still in window
        // so after recording this request we have 3/3 = 0 remaining
        const afterWindow = now + 60_001;
        const r = limiter.check('a', afterWindow);
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(0);
    });

    it('tracks keys independently', () => {
        limiter.check('a', 1000);
        limiter.check('a', 2000);
        limiter.check('a', 3000);

        // Key 'b' has its own budget
        const r = limiter.check('b', 4000);
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(2);
    });

    it('reset clears state for a key', () => {
        limiter.check('a', 1000);
        limiter.check('a', 2000);
        limiter.check('a', 3000);
        expect(limiter.check('a', 4000).allowed).toBe(false);

        limiter.reset('a');

        expect(limiter.check('a', 5000).allowed).toBe(true);
        expect(limiter.check('a', 5000).remaining).toBe(1);
    });

    it('resetAll clears state for all keys', () => {
        limiter.check('a', 1000);
        limiter.check('b', 1000);
        limiter.resetAll();

        expect(limiter.check('a', 2000).remaining).toBe(2);
        expect(limiter.check('b', 2000).remaining).toBe(2);
    });
});

describe('selectLimiter', () => {
    it('returns authLimiter for /auth/ paths', () => {
        expect(selectLimiter('POST', '/oauth/login')).toBe(authLimiter);
        expect(selectLimiter('POST', '/auth/refresh')).toBe(authLimiter);
    });

    it('returns mutationLimiter for account mutation paths', () => {
        expect(selectLimiter('POST', '/account/deactivate')).toBe(mutationLimiter);
        expect(selectLimiter('POST', '/account/export')).toBe(mutationLimiter);
        expect(selectLimiter('PUT', '/account/settings')).toBe(mutationLimiter);
        expect(selectLimiter('POST', '/reports')).toBe(reportLimiter);
        expect(selectLimiter('POST', '/moderation/policy/apply')).toBe(
            moderationLimiter,
        );
    });

    it('returns generalLimiter for all other paths', () => {
        expect(selectLimiter('GET', '/health')).toBe(generalLimiter);
        expect(selectLimiter('GET', '/query/map')).toBe(generalLimiter);
    });

    it('gives reports a stricter budget than ordinary writes', () => {
        reportLimiter.resetAll();
        mutationLimiter.resetAll();
        for (let index = 0; index < 5; index += 1) {
            expect(reportLimiter.check('client', index).allowed).toBe(true);
            expect(mutationLimiter.check('client', index).allowed).toBe(true);
        }
        expect(reportLimiter.check('client', 6).allowed).toBe(false);
        expect(mutationLimiter.check('client', 6).allowed).toBe(true);
    });
});

describe('extractClientIp', () => {
    it('ignores forwarded headers from an untrusted socket peer', () => {
        expect(
            extractClientIp(
                { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
                '10.0.0.1',
            ),
        ).toBe('10.0.0.1');
    });

    it('uses one valid forwarded address from an explicitly trusted peer', () => {
        expect(
            extractClientIp(
                { 'x-forwarded-for': '9.8.7.6' },
                '10.0.0.1',
                ['10.0.0.1'],
            ),
        ).toBe('9.8.7.6');
    });

    it('rejects a spoofable forwarded chain even from a trusted peer', () => {
        expect(
            extractClientIp(
                { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
                '10.0.0.1',
                ['10.0.0.0/24'],
            ),
        ).toBe('10.0.0.1');
    });

    it('falls back to remoteAddress when no forwarded header', () => {
        expect(extractClientIp({}, '10.0.0.1')).toBe('10.0.0.1');
    });

    it('returns "unknown" when nothing available', () => {
        expect(extractClientIp({}, undefined)).toBe('unknown');
    });

    it('ignores empty X-Forwarded-For', () => {
        expect(extractClientIp({ 'x-forwarded-for': '' }, '10.0.0.1')).toBe(
            '10.0.0.1',
        );
    });
});
