import { describe, expect, it } from 'vitest';
import { assertCsrfProtection, serializeCsrfCookie } from './csrf.js';
import { securityHeaders } from './security-headers.js';

describe('API browser perimeter', () => {
    it('sets restrictive browser security headers', () => {
        expect(securityHeaders('production')).toMatchObject({
            'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
        });
    });

    it('requires matching origin, cookie, and header tokens for cookie mutations', () => {
        const valid = {
            method: 'POST',
            headers: {
                origin: 'https://patchwork.example',
                cookie: 'patchwork_session=session; patchwork_csrf=csrf-token',
                'x-csrf-token': 'csrf-token',
            },
        };
        expect(() =>
            assertCsrfProtection(valid, 'https://patchwork.example'),
        ).not.toThrow();

        expect(() =>
            assertCsrfProtection(
                { ...valid, headers: { ...valid.headers, 'x-csrf-token': '' } },
                'https://patchwork.example',
            ),
        ).toThrowError(expect.objectContaining({ code: 'CSRF_TOKEN_INVALID' }));
        expect(serializeCsrfCookie('token', true)).toContain(
            'SameSite=Strict; Max-Age=43200; Secure',
        );
    });
});
