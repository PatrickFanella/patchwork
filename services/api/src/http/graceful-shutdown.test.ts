import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from './graceful-shutdown.js';

describe('graceful API shutdown', () => {
    it('stops accepting connections, drains active work, and closes resources once', async () => {
        let releaseRequest!: () => void;
        const requestReleased = new Promise<void>(resolve => {
            releaseRequest = resolve;
        });
        let markStarted!: () => void;
        const requestStarted = new Promise<void>(resolve => {
            markStarted = resolve;
        });
        const server = createServer((_request, response) => {
            markStarted();
            void requestReleased.then(() => response.end('complete'));
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('missing address');
        const origin = `http://127.0.0.1:${address.port}`;
        const closeResources = vi.fn(async () => undefined);
        const shutdown = createGracefulShutdown({ server, closeResources });

        const activeResponse = fetch(origin);
        await requestStarted;
        const firstShutdown = shutdown();
        const secondShutdown = shutdown();

        expect(firstShutdown).toBe(secondShutdown);
        expect(server.listening).toBe(false);
        expect(closeResources).not.toHaveBeenCalled();
        await expect(fetch(origin)).rejects.toThrow();

        releaseRequest();
        await expect(activeResponse.then(response => response.text())).resolves.toBe(
            'complete',
        );
        await firstShutdown;
        expect(closeResources).toHaveBeenCalledOnce();
    });
});
