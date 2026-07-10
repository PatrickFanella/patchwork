import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { createNodeOAuthAdapter } from '@patchwork/at-client';
import type { ApiConfig } from '@patchwork/shared';
import type { Pool } from 'pg';
import { AtAuthService } from './at-auth-service.js';
import {
    AesGcmJsonCipher,
    parseOAuthEncryptionKey,
    PostgresBrowserSessionRepository,
    PostgresOAuthSessionStore,
    PostgresOAuthStateStore,
} from './session-repository.js';

export interface AtAuthRuntime {
    service: AtAuthService;
    clientMetadata: NodeOAuthClient['clientMetadata'];
}

export const createAtAuthRuntime = (
    config: ApiConfig,
    pool: Pool,
): AtAuthRuntime => {
    if (
        !config.ATPROTO_OAUTH_CLIENT_ID ||
        !config.ATPROTO_OAUTH_REDIRECT_URI ||
        !config.ATPROTO_SESSION_ENCRYPTION_KEY
    ) {
        throw new Error('AT OAuth runtime configuration is incomplete.');
    }

    const cipher = new AesGcmJsonCipher(
        parseOAuthEncryptionKey(config.ATPROTO_SESSION_ENCRYPTION_KEY),
    );
    const client = new NodeOAuthClient({
        clientMetadata: {
            client_id: config.ATPROTO_OAUTH_CLIENT_ID,
            client_name: 'Patchwork',
            client_uri: config.API_PUBLIC_ORIGIN,
            redirect_uris: [config.ATPROTO_OAUTH_REDIRECT_URI],
            grant_types: ['authorization_code', 'refresh_token'],
            scope: 'atproto transition:generic',
            response_types: ['code'],
            application_type: 'web',
            token_endpoint_auth_method: 'none',
            dpop_bound_access_tokens: true,
        },
        stateStore: new PostgresOAuthStateStore(pool, cipher),
        sessionStore: new PostgresOAuthSessionStore(pool, cipher),
    });

    return {
        service: new AtAuthService(
            createNodeOAuthAdapter(client),
            new PostgresBrowserSessionRepository(pool),
        ),
        clientMetadata: client.clientMetadata,
    };
};
