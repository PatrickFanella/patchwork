import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('moderation HTTP boundary', () => {
    let server: Server;
    let origin: string;
    const expectsDurableRuntime = Boolean(process.env.DATABASE_URL);

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.ATPROTO_SERVICE_DID = 'did:example:moderation-test';
        process.env.MODERATION_SERVICE_TOKEN = 'test-service-credential';
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
            headers: {
                authorization: 'Bearer test-service-credential',
                'content-type': 'application/json',
            },
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
        if (expectsDurableRuntime) {
            const subjectUri =
                'at://did:example:http-test/app.patchwork.aid.post/json-body';
            const policy = await fetch(`${origin}/moderation/policy/apply`, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer test-service-credential',
                    'content-type': 'application/json',
                    'x-patchwork-actor-did': 'did:example:moderator',
                },
                body: JSON.stringify({
                    subjectUri,
                    actorDid: 'did:example:untrusted-body',
                    action: 'delist',
                    reason: 'confirmed-test-report',
                    occurredAt: '2026-07-11T23:59:00.000Z',
                    idempotencyKey: 'moderation-http-policy-1',
                }),
            });
            expect(policy.status).toBe(200);

            const audit = await fetch(`${origin}/moderation/audit`, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer test-service-credential',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ subjectUri }),
            });
            const payload = (await audit.json()) as {
                results: Array<{ actorDid: string }>;
            };
            expect(payload.results[0]?.actorDid).toBe('did:example:moderator');
        }
    });

    it('rejects a moderation command without the service credential', async () => {
        const response = await fetch(`${origin}/moderation/state`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                subjectUri:
                    'at://did:example:http-test/app.patchwork.aid.post/private',
            }),
        });

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'SERVICE_AUTH_REQUIRED' },
        });
    });
});
