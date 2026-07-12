import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRetentionScheduler } from './retention-scheduler.js';

describe('retention scheduler', () => {
    afterEach(() => vi.useRealTimers());

    it('runs immediately, repeats without overlap, and stops cleanly', async () => {
        vi.useFakeTimers();
        let releaseFirst!: () => void;
        const enforce = vi
            .fn<() => Promise<void>>()
            .mockImplementationOnce(
                () => new Promise<void>(resolve => (releaseFirst = resolve)),
            )
            .mockResolvedValue(undefined);
        const onError = vi.fn();

        const scheduler = startRetentionScheduler({
            enforce,
            intervalMs: 1_000,
            onError,
        });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(enforce).toHaveBeenCalledOnce();

        releaseFirst();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(enforce).toHaveBeenCalledTimes(2);

        scheduler.stop();
        await vi.advanceTimersByTimeAsync(2_000);
        expect(enforce).toHaveBeenCalledTimes(2);
        expect(onError).not.toHaveBeenCalled();
    });
});
