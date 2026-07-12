export interface ModerationRetentionSchedulerOptions {
    enforce(): Promise<void>;
    intervalMs: number;
    onError(error: unknown): void;
}

export const startModerationRetentionScheduler = (
    options: ModerationRetentionSchedulerOptions,
): { stop(): void } => {
    let running = false;
    let stopped = false;
    const run = async (): Promise<void> => {
        if (running || stopped) return;
        running = true;
        try {
            await options.enforce();
        } catch (error) {
            options.onError(error);
        } finally {
            running = false;
        }
    };
    const interval = setInterval(() => void run(), options.intervalMs);
    interval.unref();
    void run();
    return {
        stop: () => {
            stopped = true;
            clearInterval(interval);
        },
    };
};
