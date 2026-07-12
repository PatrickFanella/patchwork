import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('moderation HTTP boundary', () => {
    let server: Server;
    let origin: string;
    const expectsDurableRuntime = Boolean(process.env.DATABASE_URL);

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.ATPROTO_SERVICE_DID = 'did:example:moderation-test';
        const { createModerationServer } = await import('./index.js');
        server = createModerationServer();
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('missing address');
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('rejects query-string mutation compatibility and requires POST JSON', async () => {
        const legacy = await fetch(
            `${origin}/moderation/queue/enqueue?subjectUri=private&reason=private`,
        );
        expect(legacy.status).toBe(405);
        expect(legacy.headers.get('allow')).toBe('POST');

        const bodyRoute = await fetch(`${origin}/moderation/queue/enqueue`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                subjectUri:
                    'at://did:example:http-test/app.patchwork.aid.post/json-body',
                reason: 'test-report',
            }),
        });
        expect(bodyRoute.status).toBe(expectsDurableRuntime ? 200 : 503);
        if (!expectsDurableRuntime) {
            await expect(bodyRoute.json()).resolves.toMatchObject({
                error: { code: 'DURABLE_MODERATION_REQUIRED' },
            });
        }
    });
});
