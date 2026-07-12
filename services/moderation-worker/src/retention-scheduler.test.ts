import { afterEach, describe, expect, it, vi } from 'vitest';
import { startModerationRetentionScheduler } from './retention-scheduler.js';

describe('moderation retention scheduler', () => {
    afterEach(() => vi.useRealTimers());

    it('runs immediately, prevents overlap, reports failure, and stops', async () => {
        vi.useFakeTimers();
        let rejectFirst!: (error: Error) => void;
        const enforce = vi
            .fn<() => Promise<void>>()
            .mockImplementationOnce(
                () => new Promise<void>((_, reject) => (rejectFirst = reject)),
            )
            .mockResolvedValue(undefined);
        const onError = vi.fn();
        const scheduler = startModerationRetentionScheduler({
            enforce,
            intervalMs: 1_000,
            onError,
        });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(enforce).toHaveBeenCalledOnce();
        rejectFirst(new Error('database unavailable'));
        await vi.advanceTimersByTimeAsync(1_000);
        expect(onError).toHaveBeenCalledOnce();
        expect(enforce).toHaveBeenCalledTimes(2);

        scheduler.stop();
        await vi.advanceTimersByTimeAsync(2_000);
        expect(enforce).toHaveBeenCalledTimes(2);
    });
});
