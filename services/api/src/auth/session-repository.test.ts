import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type {
    NodeSavedSession,
    NodeSavedState,
} from '@atproto/oauth-client-node';
import { describe, expect, it, vi } from 'vitest';
import {
    AesGcmJsonCipher,
    PostgresOAuthSessionStore,
    PostgresOAuthStateStore,
    parseOAuthEncryptionKey,
} from './session-repository.js';

const makePool = () => {
    const rows = new Map<string, { encrypted_payload: string }>();
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
        const key = String(values?.[0]);
        if (sql.includes('INSERT INTO')) {
            rows.set(key, { encrypted_payload: String(values?.[1]) });
            return { rows: [] };
        }
        if (sql.includes('SELECT encrypted_payload')) {
            const row = rows.get(key);
            return { rows: row ? [row] : [] };
        }
        if (sql.includes('DELETE FROM')) {
            rows.delete(key);
            return { rows: [] };
        }
        if (sql.includes('UPDATE at_oauth_sessions')) {
            rows.delete(key);
            return { rows: [] };
        }
        return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    return {
        pool: { query, connect: vi.fn(async () => client) } as unknown as Pool,
        query,
        rows,
    };
};

describe('AesGcmJsonCipher', () => {
    it('round-trips JSON without storing plaintext', () => {
        const cipher = new AesGcmJsonCipher(randomBytes(32));
        const value = { refresh_token: 'secret-refresh-token', count: 3 };

        const encrypted = cipher.encrypt(value);

        expect(encrypted).not.toContain('secret-refresh-token');
        expect(cipher.decrypt(encrypted)).toEqual(value);
    });

    it('rejects an encryption key that is not 32 bytes', () => {
        expect(() => new AesGcmJsonCipher(randomBytes(16))).toThrow(
            '32-byte encryption key',
        );
    });

    it('rejects missing or malformed base64 runtime keys', () => {
        expect(() => parseOAuthEncryptionKey('not-a-32-byte-key')).toThrow(
            'exactly 32 bytes',
        );
    });
});

describe('Postgres OAuth stores', () => {
    it('hashes state lookup keys and encrypts state payloads', async () => {
        const { pool, query } = makePool();
        const store = new PostgresOAuthStateStore(
            pool,
            new AesGcmJsonCipher(randomBytes(32)),
        );
        const state = {
            iss: 'https://pds.example',
            verifier: 'verifier-secret',
            dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
            authMethod: { method: 'none' as const },
        } as unknown as NodeSavedState;

        await store.set('raw-oauth-state', state);
        await expect(store.get('raw-oauth-state')).resolves.toEqual(state);

        const insertValues = query.mock.calls[0]?.[1] as unknown[];
        expect(insertValues[0]).not.toBe('raw-oauth-state');
        expect(String(insertValues[1])).not.toContain('verifier-secret');
    });

    it('encrypts sessions and records revocation on delete', async () => {
        const { pool, query } = makePool();
        const store = new PostgresOAuthSessionStore(
            pool,
            new AesGcmJsonCipher(randomBytes(32)),
        );
        const session = {
            dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
            authMethod: { method: 'none' as const },
            tokenSet: {
                sub: 'did:plc:alice',
                iss: 'https://pds.example',
                aud: 'did:web:pds.example',
                scope: 'atproto',
                token_type: 'DPoP' as const,
                access_token: 'access-secret',
                refresh_token: 'refresh-secret',
            },
        } as unknown as NodeSavedSession;

        await store.set('did:plc:alice', session);
        await expect(store.get('did:plc:alice')).resolves.toEqual(session);
        await store.del('did:plc:alice');

        expect(
            query.mock.calls.some(call =>
                String(call[0]).includes('UPDATE at_oauth_sessions'),
            ),
        ).toBe(true);
    });
});
