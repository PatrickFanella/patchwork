import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OAuthAdapter } from '@patchwork/at-client';
import { AtAuthService } from './at-auth-service.js';
import { NativeHandoffService, PostgresNativeCompletionStore, challengeFor } from './native-handoff.js';
import { PostgresBrowserSessionRepository } from './session-repository.js';
import { createNativeAuthHandler } from '../http/native-auth-handler.js';
import { completeOAuthResponse } from '../http/oauth-completion.js';
import { writePublicError } from '../http/error-response.js';
import { authenticateRequest, unauthorizedWhenSessionExpired } from '../http/authenticated-request.js';

const did = 'did:plc:native-handoff-test';
const callback = 'org.example.patchwork://oauth/callback';
const verifier = 'v'.repeat(64);
const state = 's'.repeat(43);

describe('native handoff HTTP caller with real PostgreSQL session storage', () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const sessions = new PostgresBrowserSessionRepository(pool);
    let now = new Date();
    const handoff = new NativeHandoffService([callback], new PostgresNativeCompletionStore(pool), sessions, () => now);
    let appState: string | undefined;
    const oauth: OAuthAdapter = {
        authorize: vi.fn(async (_handle, value) => { appState = value; return new URL('https://provider.example/authorize'); }),
        callback: vi.fn(async () => {
            const value = appState; appState = undefined;
            if (!value) throw new Error('invalid state');
            return { state: value, session: { did, fetch: vi.fn() } };
        }),
        restore: vi.fn(async () => ({ did, fetch: vi.fn() })),
        revoke: vi.fn(async () => undefined),
    };
    const auth = new AtAuthService(oauth, sessions, handoff);
    const handler = createNativeAuthHandler(auth, handoff);
    let server: Server;
    let origin: string;
    beforeAll(async () => {
        await pool.query('DELETE FROM account_deactivations WHERE did_hash = encode(sha256($1::bytea), \'hex\')', [Buffer.from(did)]);
        // Seed the provider-owned session prerequisite; no real provider credentials are involved.
        await pool.query(`INSERT INTO at_oauth_sessions(did, encrypted_payload) VALUES ($1,'test-ciphertext') ON CONFLICT (did) DO UPDATE SET revoked_at=NULL`, [did]);
        server = createServer((request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost');
            if (handler(request, response, url)) return;
            if (url.pathname === '/oauth/callback') {
                void completeOAuthResponse(auth, url.searchParams, response, 'https://web.example', true)
                    .catch(error => writePublicError(response, error));
                return;
            }
            response.writeHead(404).end();
        });
        server.listen(0, '127.0.0.1'); await once(server, 'listening');
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('address');
        origin = `http://127.0.0.1:${address.port}`;
    });
    afterAll(async () => {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await pool.query('DELETE FROM native_auth_completions WHERE did=$1', [did]);
        await pool.query('DELETE FROM patchwork_browser_sessions WHERE did=$1', [did]);
        await pool.query('DELETE FROM at_oauth_sessions WHERE did=$1', [did]);
        await pool.end();
    });
    const post = (path: string, body: unknown, headers = {}) => fetch(`${origin}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const complete = async () => {
        const start = await post('/auth/native/start', { handle: 'test.example', redirectUri: callback, state, codeChallenge: challengeFor(verifier) });
        expect(start.status).toBe(200);
        expect(await start.json()).toEqual({ authorizationUrl: 'https://provider.example/authorize' });
        const response = await fetch(`${origin}/oauth/callback?code=provider-code`, { redirect: 'manual' });
        expect(response.status).toBe(302);
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(response.headers.get('cache-control')).toBe('no-store');
        const location = new URL(response.headers.get('location')!);
        expect(location.searchParams.get('state')).toBe(state);
        expect(location.searchParams.has('sessionToken')).toBe(false);
        return location.searchParams.get('code')!;
    };
    const exchange = (code: string, overrides = {}) => post('/auth/native/exchange', {
        code, codeVerifier: verifier, redirectUri: callback, state, ...overrides,
    });
    it('completes the caller flow, rejects binding mismatches and replay, and uses existing refresh/logout', async () => {
        const code = await complete();
        for (const override of [{ codeVerifier: 'x'.repeat(64) }, { state: 'x'.repeat(43) }, { redirectUri: 'org.example.other://oauth/callback' }]) {
            expect((await exchange(code, override)).status).toBe(400);
        }
        const results = await Promise.all([exchange(code), exchange(code)]);
        expect(results.map(result => result.status).sort()).toEqual([200, 400]);
        const success = results.find(result => result.status === 200)!;
        const body = await success.json() as { tokenType: string; sessionToken: string; expiresAt: string };
        expect(body.tokenType).toBe('Bearer');
        expect(Date.parse(body.expiresAt) - now.getTime()).toBe(60 * 60_000);
        expect(success.headers.get('set-cookie')).toBeNull();
        expect(JSON.stringify(body)).not.toMatch(/accessJwt|refreshJwt|encrypted_payload|provider-code/);
        const request = { headers: { authorization: `Bearer ${body.sessionToken}` } };
        const deps = { resolveSession: unauthorizedWhenSessionExpired(token => auth.current(token)), resolveRole: async () => 'user' as const };
        expect((await authenticateRequest(request, deps)).principal.did).toBe(did);
        await expect(auth.refresh(body.sessionToken)).resolves.toMatchObject({ did });
        await expect(authenticateRequest({ headers: { ...request.headers, cookie: 'patchwork_session=another-session' } }, deps)).rejects.toMatchObject({ code: 'CONFLICTING_AUTHENTICATION' });
        await auth.logout(body.sessionToken);
        await expect(authenticateRequest(request, deps)).rejects.toMatchObject({ statusCode: 401 });
        expect((await exchange(code)).status).toBe(400);
    });
    it('keeps browser completion cookies and sanitized landing behavior', async () => {
        await auth.beginLogin('test.example', '/feed?code=sensitive&filter=food');
        const response = await fetch(`${origin}/oauth/callback?code=browser-provider-code`, { redirect: 'manual' });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://web.example/auth/callback?returnTo=%2Ffeed%3Ffilter%3Dfood');
        expect(response.headers.get('set-cookie')).toContain('patchwork_session=');
        expect(response.headers.get('set-cookie')).toContain('patchwork_csrf=');
        expect(response.headers.get('set-cookie')).toContain('HttpOnly');
        expect(response.headers.get('set-cookie')).toContain('Secure');
    });
    it('rejects expired completions, arbitrary redirects, malformed inputs and browser credentials', async () => {
        now = new Date();
        const code = await complete(); now = new Date(now.getTime() + 60_001);
        expect((await exchange(code)).status).toBe(400);
        expect((await post('/auth/native/start', { handle: 'test.example', redirectUri: 'https://attacker.example', state, codeChallenge: challengeFor(verifier) })).status).toBe(400);
        expect((await post('/auth/native/exchange', {})).status).toBe(400);
        expect((await post('/auth/native/start', {}, { cookie: 'patchwork_session=browser-session' })).status).toBe(401);
        expect((await post('/auth/native/exchange', {}, { authorization: 'Bearer existing' })).status).toBe(401);
        now = new Date();
    });
});
