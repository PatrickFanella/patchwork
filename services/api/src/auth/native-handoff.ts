import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { PublicHttpError } from '../http/error-response.js';
import type { BrowserSessionRepository } from './session-repository.js';

export const nativeLoginSchema = z.object({
    handle: z.string().trim().min(1).max(253),
    redirectUri: z.string().max(2048),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
export const nativeExchangeSchema = z.object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    redirectUri: z.string().max(2048),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
}).strict();
const bindingSchema = nativeLoginSchema.omit({ handle: true }).extend({
    expiresAt: z.number().finite(),
});
export type NativeLoginBinding = z.infer<typeof bindingSchema>;
export const challengeFor = (verifier: string): string =>
    createHash('sha256').update(verifier).digest('base64url');
const codeHash = (code: string) => createHash('sha256').update(code).digest('hex');
const invalid = () => new PublicHttpError(400, 'NATIVE_HANDOFF_INVALID',
    'Native sign-in could not be completed. Start sign-in again.');

export interface NativeCompletionStore {
    put(codeHash: string, did: string, binding: NativeLoginBinding, expiresAt: Date): Promise<void>;
    consume(codeHash: string, challenge: string, redirectUri: string, state: string, now: Date): Promise<string | undefined>;
}

export class PostgresNativeCompletionStore implements NativeCompletionStore {
    constructor(private readonly pool: Pool) {}
    async put(hash: string, did: string, binding: NativeLoginBinding, expiresAt: Date) {
        await this.pool.query(`INSERT INTO native_auth_completions
            (code_hash, did, code_challenge, redirect_uri, app_state, expires_at)
            VALUES ($1,$2,$3,$4,$5,$6)`,
        [hash, did, binding.codeChallenge, binding.redirectUri, binding.state, expiresAt]);
    }
    async consume(hash: string, challenge: string, redirectUri: string, state: string, now: Date) {
        // A single SQL statement makes concurrent exchanges and replay fail closed.
        const result = await this.pool.query<{ did: string }>(`DELETE FROM native_auth_completions
            WHERE code_hash=$1 AND code_challenge=$2 AND redirect_uri=$3
                AND app_state=$4 AND expires_at > $5 RETURNING did`,
        [hash, challenge, redirectUri, state, now]);
        return result.rows[0]?.did;
    }
}

export class NativeHandoffService {
    private readonly callbacks: Set<string>;
    constructor(
        callbacks: string[],
        private readonly store: NativeCompletionStore,
        private readonly sessions: BrowserSessionRepository,
        private readonly now = () => new Date(),
    ) {
        this.callbacks = new Set(callbacks);
        for (const callback of callbacks) {
            const url = new URL(callback);
            if (url.username || url.password || url.search || url.hash ||
                ['http:', 'javascript:', 'data:', 'file:'].includes(url.protocol)) {
                throw new Error('Native callbacks require an exact HTTPS or app-scheme URL without query or fragment.');
            }
        }
    }
    bind(value: unknown) {
        if (!this.callbacks.size) throw new PublicHttpError(503, 'NATIVE_AUTH_UNAVAILABLE', 'Native sign-in is not configured.');
        const parsed = nativeLoginSchema.safeParse(value);
        if (!parsed.success || !this.callbacks.has(parsed.data.redirectUri)) throw invalid();
        const { handle, ...binding } = parsed.data;
        return { handle, binding: { ...binding, expiresAt: this.now().getTime() + 10 * 60_000 } };
    }
    async complete(did: string, value: unknown): Promise<string> {
        const parsed = bindingSchema.safeParse(value);
        const now = this.now();
        if (!parsed.success || !this.callbacks.has(parsed.data.redirectUri) ||
            parsed.data.expiresAt <= now.getTime() || parsed.data.expiresAt > now.getTime() + 10 * 60_000) throw invalid();
        const binding = parsed.data;
        const code = randomBytes(32).toString('base64url');
        await this.store.put(codeHash(code), did, binding, new Date(now.getTime() + 60_000));
        const redirect = new URL(binding.redirectUri);
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', binding.state);
        return redirect.toString();
    }
    async exchange(value: unknown) {
        const parsed = nativeExchangeSchema.safeParse(value);
        if (!parsed.success || !this.callbacks.has(parsed.data.redirectUri)) throw invalid();
        const input = parsed.data;
        const now = this.now();
        const did = await this.store.consume(codeHash(input.code), challengeFor(input.codeVerifier), input.redirectUri, input.state, now);
        if (!did) throw invalid();
        const expiresAt = new Date(now.getTime() + 60 * 60_000);
        // Repository account lock prevents a deletion racing the exchange from recreating a session.
        const sessionToken = await this.sessions.create(did, expiresAt);
        return { tokenType: 'Bearer', sessionToken, expiresAt: expiresAt.toISOString() };
    }
}
