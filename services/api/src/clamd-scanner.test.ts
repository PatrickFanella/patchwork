import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamdMalwareScanner } from './clamd-scanner.js';

describe('ClamdMalwareScanner', () => {
    let server: Server | undefined;

    afterEach(async () => {
        if (!server) return;
        await new Promise<void>((resolve, reject) =>
            server!.close(error => (error ? reject(error) : resolve())),
        );
        server = undefined;
    });

    const listen = async (response: string): Promise<number> => {
        server = createServer(socket => {
            let received = Buffer.alloc(0);
            socket.on('data', chunk => {
                received = Buffer.concat([received, chunk]);
                if (
                    received.length >= 4 &&
                    received.subarray(-4).equals(Buffer.alloc(4))
                ) {
                    socket.end(response);
                }
            });
        });
        await new Promise<void>(resolve =>
            server!.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('test clamd server did not bind');
        }
        return address.port;
    };

    it('streams bytes with the clamd INSTREAM protocol and accepts clean content', async () => {
        const port = await listen('stream: OK\0');
        await expect(
            new ClamdMalwareScanner('127.0.0.1', port).scan(
                Buffer.from('safe attachment'),
            ),
        ).resolves.toEqual({
            verdict: 'clean',
            signature: null,
            scannerVersion: null,
        });
    });

    it('returns the bounded malware signature from a FOUND response', async () => {
        const port = await listen('stream: Eicar-Signature FOUND\0');
        await expect(
            new ClamdMalwareScanner('127.0.0.1', port).scan(
                Buffer.from('unsafe attachment'),
            ),
        ).resolves.toMatchObject({
            verdict: 'malware',
            signature: 'Eicar-Signature',
        });
    });
});
