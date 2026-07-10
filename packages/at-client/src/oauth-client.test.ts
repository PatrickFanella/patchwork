import { describe, expect, it, vi } from 'vitest';
import {
    AtClientError,
    AtSessionClient,
    type OAuthAdapter,
    type OAuthSessionHandle,
} from './index.js';

const session = (did = 'did:plc:alice'): OAuthSessionHandle => ({
    did,
    fetch: vi.fn(),
});

const adapter = (): OAuthAdapter => ({
    authorize: vi.fn(async handle =>
        new URL(`https://pds.example/oauth?login_hint=${handle}`),
    ),
    callback: vi.fn(async () => ({ session: session(), state: 'state-1' })),
    restore: vi.fn(async did => session(did)),
    revoke: vi.fn(async () => undefined),
});

describe('AtSessionClient', () => {
    it('starts login without accepting a password', async () => {
        const oauth = adapter();
        const client = new AtSessionClient(oauth);

        await expect(client.beginLogin('alice.example')).resolves.toEqual({
            authorizationUrl:
                'https://pds.example/oauth?login_hint=alice.example',
        });
        expect(oauth.authorize).toHaveBeenCalledWith('alice.example');
    });

    it('completes a callback and returns a Patchwork session handle', async () => {
        const client = new AtSessionClient(adapter());

        await expect(
            client.completeLogin(new URLSearchParams('code=abc&state=state-1')),
        ).resolves.toEqual({ did: 'did:plc:alice', state: 'state-1' });
    });

    it('restores a session to refresh SDK-managed tokens', async () => {
        const oauth = adapter();
        const client = new AtSessionClient(oauth);

        await expect(client.refresh('did:plc:alice')).resolves.toEqual({
            did: 'did:plc:alice',
        });
        expect(oauth.restore).toHaveBeenCalledWith('did:plc:alice');
    });

    it('revokes the SDK session during logout', async () => {
        const oauth = adapter();
        const client = new AtSessionClient(oauth);

        await client.logout('did:plc:alice');

        expect(oauth.revoke).toHaveBeenCalledWith('did:plc:alice');
    });

    it('maps an expired restore to a stable Patchwork error', async () => {
        const oauth = adapter();
        vi.mocked(oauth.restore).mockRejectedValueOnce(
            Object.assign(new Error('invalid grant'), { status: 401 }),
        );
        const client = new AtSessionClient(oauth);

        await expect(client.refresh('did:plc:alice')).rejects.toMatchObject({
            code: 'SESSION_EXPIRED',
            retryable: false,
        } satisfies Partial<AtClientError>);
    });
});
