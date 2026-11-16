import { describe, expect, it, vi } from 'vitest';
import { NativeHandoffService, challengeFor, type NativeCompletionStore } from './native-handoff.js';
import type { BrowserSessionRepository } from './session-repository.js';

const callbacks = ['org.example.patchwork://oauth/callback'];
const input = { handle: 'test.example', redirectUri: callbacks[0], state: 's'.repeat(43), codeChallenge: challengeFor('v'.repeat(64)) };
const store = (): NativeCompletionStore => ({ put: vi.fn(async () => undefined), consume: vi.fn(async () => undefined) });
const sessions = { create: vi.fn() } as unknown as BrowserSessionRepository;

describe('native login binding', () => {
    it('requires explicit callback configuration and validates the start contract', () => {
        expect(() => new NativeHandoffService([], store(), sessions).bind(input)).toThrow('not configured');
        const service = new NativeHandoffService(callbacks, store(), sessions);
        expect(() => service.bind({ ...input, codeChallenge: 'plain-verifier' })).toThrow();
        expect(() => service.bind({ ...input, state: 'short' })).toThrow();
        expect(() => service.bind({ ...input, redirectUri: `${callbacks[0]}?next=attacker` })).toThrow();
        for (const callback of ['http://example.test/callback', 'https://user:password@example.test/callback', 'https://example.test/callback#fragment']) {
            expect(() => new NativeHandoffService([callback], store(), sessions)).toThrow();
        }
    });
    it('expires the initiating flow before issuing a completion code', async () => {
        let now = new Date('2026-11-15T12:00:00Z');
        const repository = store();
        const service = new NativeHandoffService(callbacks, repository, sessions, () => now);
        const { binding } = service.bind(input);
        now = new Date(now.getTime() + 10 * 60_000);
        await expect(service.complete('did:plc:fixture', binding)).rejects.toThrow();
        expect(repository.put).not.toHaveBeenCalled();
    });
});
