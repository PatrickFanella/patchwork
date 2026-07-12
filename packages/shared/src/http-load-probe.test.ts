import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHttpLoadProbe } from './http-load-probe.js';

describe('runHttpLoadProbe', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (request.url === '/failure') {
                response.writeHead(503).end('unavailable');
                return;
            }
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end('{"status":"ok"}');
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('missing address');
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('measures a bounded real HTTP workload', async () => {
        const result = await runHttpLoadProbe({
            baseUrl,
            path: '/health',
            durationMs: 100,
            concurrency: 2,
            requestTimeoutMs: 1_000,
        });

        expect(result.path).toBe('/health');
        expect(result.totalRequests).toBeGreaterThan(1);
        expect(result.successCount).toBe(result.totalRequests);
        expect(result.errorCount).toBe(0);
        expect(result.statusCounts).toEqual({ '200': result.totalRequests });
        expect(result.actualRps).toBeGreaterThan(0);
        expect(result.latency.sampleCount).toBe(result.totalRequests);
        expect(result.latency.p95).toBeGreaterThanOrEqual(0);
    });

    it('counts unexpected HTTP status codes as errors', async () => {
        const result = await runHttpLoadProbe({
            baseUrl,
            path: '/failure',
            durationMs: 50,
            concurrency: 1,
            requestTimeoutMs: 1_000,
        });

        expect(result.errorCount).toBe(result.totalRequests);
        expect(result.successCount).toBe(0);
        expect(result.statusCounts['503']).toBe(result.totalRequests);
    });

    it('paces requests to the configured target rate', async () => {
        const result = await runHttpLoadProbe({
            baseUrl,
            path: '/health',
            durationMs: 200,
            concurrency: 2,
            requestTimeoutMs: 1_000,
            targetRps: 20,
        });

        expect(result.totalRequests).toBeGreaterThanOrEqual(3);
        expect(result.totalRequests).toBeLessThanOrEqual(5);
    });

    it('rejects URLs and paths that could leak credentials or query data', async () => {
        await expect(
            runHttpLoadProbe({
                baseUrl: baseUrl.replace('http://', 'http://user:secret@'),
                path: '/health',
                durationMs: 10,
                concurrency: 1,
                requestTimeoutMs: 100,
            }),
        ).rejects.toThrow('credentials');
        await expect(
            runHttpLoadProbe({
                baseUrl,
                path: '/query/map?latitude=1',
                durationMs: 10,
                concurrency: 1,
                requestTimeoutMs: 100,
            }),
        ).rejects.toThrow('query strings');
    });
});
