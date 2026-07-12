import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('API server method routing', () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.ATPROTO_SERVICE_DID = 'did:example:patchwork-test';
        process.env.API_DATA_SOURCE = 'fixture';
        process.env.API_PUBLIC_ORIGIN = 'https://patchwork.test';
        const { createApiServer } = await import('../index.js');
        server = createApiServer();
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('API test server did not bind a TCP address.');
        }
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('returns 405 and Allow for a known path with the wrong method', async () => {
        const response = await fetch(`${origin}/health`, { method: 'PATCH' });

        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET');
        await expect(response.json()).resolves.toEqual({
            error: {
                code: 'METHOD_NOT_ALLOWED',
                message: 'The requested method is not allowed for this route.',
                requestId: expect.any(String),
            },
        });
    });

    it('rejects malformed JSON with a stable request-ID error', async () => {
        const response = await fetch(`${origin}/aid/post/transition`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{',
        });

        expect(response.status).toBe(400);
        const requestId = response.headers.get('x-request-id');
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: 'MALFORMED_JSON',
                message: 'The request body is not valid JSON.',
                requestId,
            },
        });
    });

    it('rejects command bodies without application/json', async () => {
        const response = await fetch(`${origin}/aid/post/transition`, {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: '{}',
        });

        expect(response.status).toBe(415);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
        });
    });

    it('rejects command bodies larger than one mebibyte', async () => {
        const response = await fetch(`${origin}/aid/post/transition`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
        });

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'REQUEST_BODY_TOO_LARGE' },
        });
    });

    it('applies security headers and rejects cookie mutations without CSRF proof', async () => {
        const response = await fetch(`${origin}/aid/post/transition`, {
            method: 'POST',
            headers: {
                origin: 'https://patchwork.test',
                cookie: 'patchwork_session=session; patchwork_csrf=expected',
                'content-type': 'application/json',
            },
            body: '{}',
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'CSRF_TOKEN_INVALID' },
        });
    });
});
