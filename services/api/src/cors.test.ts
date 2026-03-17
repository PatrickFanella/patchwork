import { describe, expect, it } from 'vitest';
import { getCorsHeaders } from './cors.js';

const PUBLIC_ORIGIN = 'https://patchwork.community';
const DEV_ORIGIN = 'http://localhost:5173';

describe('getCorsHeaders', () => {
    describe('production environment', () => {
        const env = 'production';

        it('allows the configured public origin', () => {
            const headers = getCorsHeaders(PUBLIC_ORIGIN, env, PUBLIC_ORIGIN);
            expect(headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
        });

        it('rejects a different origin', () => {
            const headers = getCorsHeaders(
                'https://evil.example.com',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe('');
        });

        it('rejects localhost in production', () => {
            const headers = getCorsHeaders(
                'http://localhost:5173',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe('');
        });

        it('rejects when origin is undefined', () => {
            const headers = getCorsHeaders(undefined, env, PUBLIC_ORIGIN);
            expect(headers['access-control-allow-origin']).toBe('');
        });
    });

    describe('development environment', () => {
        const env = 'development';

        it('allows localhost origins', () => {
            const headers = getCorsHeaders(
                'http://localhost:5173',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe(
                'http://localhost:5173',
            );
        });

        it('allows 127.0.0.1 origins', () => {
            const headers = getCorsHeaders(
                'http://127.0.0.1:3000',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe(
                'http://127.0.0.1:3000',
            );
        });

        it('allows localhost without port', () => {
            const headers = getCorsHeaders(
                'http://localhost',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe(
                'http://localhost',
            );
        });

        it('allows the configured public origin', () => {
            const headers = getCorsHeaders(PUBLIC_ORIGIN, env, PUBLIC_ORIGIN);
            expect(headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
        });

        it('rejects non-localhost, non-configured origins', () => {
            const headers = getCorsHeaders(
                'https://evil.example.com',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe('');
        });

        it('returns public origin when origin header is absent (e.g. curl)', () => {
            const headers = getCorsHeaders(undefined, env, PUBLIC_ORIGIN);
            expect(headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
        });
    });

    describe('test environment', () => {
        const env = 'test';

        it('behaves the same as development', () => {
            const headers = getCorsHeaders(
                'http://localhost:5173',
                env,
                PUBLIC_ORIGIN,
            );
            expect(headers['access-control-allow-origin']).toBe(
                'http://localhost:5173',
            );
        });
    });

    describe('common headers', () => {
        it('always sets methods, headers, max-age, and vary', () => {
            const headers = getCorsHeaders(DEV_ORIGIN, 'development', DEV_ORIGIN);
            expect(headers['access-control-allow-methods']).toContain('GET');
            expect(headers['access-control-allow-methods']).toContain('POST');
            expect(headers['access-control-allow-methods']).toContain('OPTIONS');
            expect(headers['access-control-allow-headers']).toContain(
                'Content-Type',
            );
            expect(headers['access-control-allow-headers']).toContain(
                'Authorization',
            );
            expect(headers['access-control-max-age']).toBe('86400');
            expect(headers['vary']).toBe('Origin');
        });
    });
});
