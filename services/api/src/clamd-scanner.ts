import { createConnection } from 'node:net';

export interface MalwareScanResult {
    verdict: 'clean' | 'malware' | 'uncertain';
    signature: string | null;
    scannerVersion: string | null;
}

export interface MalwareScanner {
    scan(body: Buffer): Promise<MalwareScanResult>;
}

const parseResponse = (response: string): MalwareScanResult => {
    const normalized = response.replaceAll('\0', '').trim();
    if (normalized.endsWith('OK')) {
        return {
            verdict: 'clean',
            signature: null,
            scannerVersion: null,
        };
    }
    const found = /:\s+(.+)\s+FOUND$/.exec(normalized);
    if (found?.[1]) {
        return {
            verdict: 'malware',
            signature: found[1].slice(0, 200),
            scannerVersion: null,
        };
    }
    return {
        verdict: 'uncertain',
        signature: null,
        scannerVersion: null,
    };
};

export class ClamdMalwareScanner implements MalwareScanner {
    constructor(
        private readonly host: string,
        private readonly port: number,
        private readonly timeoutMs = 30_000,
    ) {}

    scan(body: Buffer): Promise<MalwareScanResult> {
        return new Promise((resolve, reject) => {
            const socket = createConnection({
                host: this.host,
                port: this.port,
            });
            const response: Buffer[] = [];
            const timeout = setTimeout(() => {
                socket.destroy(new Error('CLAMD_SCAN_TIMEOUT'));
            }, this.timeoutMs);
            const finish = (error?: Error) => {
                clearTimeout(timeout);
                if (error) reject(error);
                else resolve(parseResponse(Buffer.concat(response).toString()));
            };
            socket.once('error', finish);
            socket.on('data', chunk => response.push(Buffer.from(chunk)));
            socket.once('end', () => finish());
            socket.once('connect', () => {
                socket.write('zINSTREAM\0');
                for (
                    let offset = 0;
                    offset < body.length;
                    offset += 64 * 1024
                ) {
                    const chunk = body.subarray(
                        offset,
                        Math.min(offset + 64 * 1024, body.length),
                    );
                    const length = Buffer.allocUnsafe(4);
                    length.writeUInt32BE(chunk.length);
                    socket.write(length);
                    socket.write(chunk);
                }
                socket.write(Buffer.alloc(4));
            });
        });
    }
}
