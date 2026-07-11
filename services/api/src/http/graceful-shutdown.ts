import type { Server } from 'node:http';

export interface GracefulShutdownOptions {
    server: Server;
    closeResources(): Promise<void>;
    timeoutMs?: number;
}

export const createGracefulShutdown = (
    options: GracefulShutdownOptions,
): (() => Promise<void>) => {
    let pending: Promise<void> | undefined;

    return () => {
        if (pending) return pending;
        pending = (async () => {
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                await new Promise<void>((resolve, reject) => {
                    timeout = setTimeout(() => {
                        options.server.closeAllConnections();
                    }, options.timeoutMs ?? 30_000);
                    timeout.unref();
                    options.server.close(error =>
                        error ? reject(error) : resolve(),
                    );
                });
            } finally {
                if (timeout) clearTimeout(timeout);
                await options.closeResources();
            }
        })();
        return pending;
    };
};
