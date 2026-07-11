import { describe, expect, it } from 'vitest';
import { createModerationRuntime } from './moderation-runtime.js';

describe('createModerationRuntime', () => {
    it('refuses in-memory fallback in production', async () => {
        await expect(
            createModerationRuntime({ nodeEnv: 'production' }),
        ).rejects.toThrow('DATABASE_URL is required');
    });

    it('allows an explicitly non-production fixture runtime', async () => {
        const runtime = await createModerationRuntime({ nodeEnv: 'test' });
        expect(runtime.mode).toBe('fixture');
        await runtime.close();
    });
});
