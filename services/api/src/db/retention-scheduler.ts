export interface RetentionSchedulerOptions {
    enforce(): Promise<void>;
    intervalMs: number;
    onError(error: unknown): void;
}

export interface RetentionScheduler {
    stop(): void;
}

export const startRetentionScheduler = (
    options: RetentionSchedulerOptions,
): RetentionScheduler => {
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
