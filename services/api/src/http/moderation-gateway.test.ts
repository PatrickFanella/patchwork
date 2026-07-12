import { describe, expect, it, vi } from 'vitest';
import { createModerationGateway } from './moderation-gateway.js';

describe('moderation service gateway', () => {
    it('authenticates the service and overwrites body actor identity', async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify({ item: { visibility: 'delisted' } }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );
        const gateway = createModerationGateway({
            baseUrl: 'http://moderation.internal:4200',
            serviceToken: 'internal-credential',
            fetchImpl,
        });

        await gateway.command({
            path: '/moderation/policy/apply',
            actorDid: 'did:example:authenticated-moderator',
            body: {
                actorDid: 'did:example:untrusted-browser',
                action: 'delist',
            },
        });

        const [, init] = (
            fetchImpl.mock.calls as unknown as Array<[URL, RequestInit]>
        )[0]!;
        expect(init?.headers).toMatchObject({
            authorization: 'Bearer internal-credential',
            'x-patchwork-actor-did': 'did:example:authenticated-moderator',
        });
        expect(JSON.parse(String(init?.body))).toEqual({ action: 'delist' });
    });
});
