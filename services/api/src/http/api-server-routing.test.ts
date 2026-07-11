import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('API server method routing', () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.ATPROTO_SERVICE_DID = 'did:example:patchwork-test';
        process.env.API_DATA_SOURCE = 'fixture';
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
            },
        });
    });
});
