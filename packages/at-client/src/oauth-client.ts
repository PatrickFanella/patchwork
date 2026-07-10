import type { NodeOAuthClient } from '@atproto/oauth-client-node';
import { toAtClientError } from './errors.js';

export interface OAuthSessionHandle {
    did: string;
    fetch(pathname: string, init?: RequestInit): Promise<Response>;
}

export interface OAuthCallbackResult {
    session: OAuthSessionHandle;
    state: string | null;
}

export interface OAuthAdapter {
    authorize(handle: string): Promise<URL>;
    callback(params: URLSearchParams): Promise<OAuthCallbackResult>;
    restore(did: string): Promise<OAuthSessionHandle>;
    revoke(did: string): Promise<void>;
}

export interface SessionResult {
    did: string;
}

export interface LoginResult {
    did: string;
    state: string | null;
}

export class AtSessionClient {
    constructor(private readonly adapter: OAuthAdapter) {}

    async beginLogin(handle: string): Promise<{ authorizationUrl: string }> {
        try {
            const authorizationUrl = await this.adapter.authorize(handle);
            return { authorizationUrl: authorizationUrl.toString() };
        } catch (error) {
            throw toAtClientError(error, 'Unable to begin AT Protocol login.');
        }
    }

    async completeLogin(params: URLSearchParams): Promise<LoginResult> {
        try {
            const result = await this.adapter.callback(params);
            return { did: result.session.did, state: result.state };
        } catch (error) {
            throw toAtClientError(error, 'Unable to complete AT Protocol login.');
        }
    }

    async restore(did: string): Promise<SessionResult> {
        try {
            const session = await this.adapter.restore(did);
            return { did: session.did };
        } catch (error) {
            throw toAtClientError(error, 'Unable to restore AT Protocol session.');
        }
    }

    async refresh(did: string): Promise<SessionResult> {
        return this.restore(did);
    }

    async logout(did: string): Promise<void> {
        try {
            await this.adapter.revoke(did);
        } catch (error) {
            throw toAtClientError(error, 'Unable to revoke AT Protocol session.');
        }
    }
}

export const createNodeOAuthAdapter = (
    client: NodeOAuthClient,
): OAuthAdapter => ({
    authorize: handle => client.authorize(handle),
    callback: async params => {
        const result = await client.callback(params);
        return {
            state: result.state,
            session: {
                did: result.session.did,
                fetch: result.session.fetchHandler.bind(result.session),
            },
        };
    },
    restore: async did => {
        const session = await client.restore(did, true);
        return {
            did: session.did,
            fetch: session.fetchHandler.bind(session),
        };
    },
    revoke: did => client.revoke(did),
});
