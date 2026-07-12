import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('runtime query-string security guard', () => {
    it('forbids compatibility mutations, credentials, actors, and moderation data in URLs', async () => {
        const entrypoints = await Promise.all([
            readFile(new URL('../index.ts', import.meta.url), 'utf8'),
            readFile(
                new URL(
                    '../../../moderation-worker/src/index.ts',
                    import.meta.url,
                ),
                'utf8',
            ),
        ]);
        const runtime = entrypoints.join('\n');

        expect(runtime).not.toMatch(/FromParams\(requestUrl\.searchParams\)/);
        expect(runtime).not.toMatch(/required\(requestUrl\.searchParams/);
        expect(runtime).not.toMatch(
            /searchParams\.get\('(handle|password|accessJwt|refreshJwt|actorDid|actorRole|idempotencyKey|reason|action)'\)/,
        );
    });
});
