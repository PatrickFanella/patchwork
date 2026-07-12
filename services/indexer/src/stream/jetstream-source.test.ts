import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { JetstreamEventSource } from './jetstream-source.js';

const aidPostCollection = 'app.patchwork.aid.post';

const commitFrame = (cursor: number, rkey: string) => ({
    did: 'did:plc:alice',
    time_us: cursor,
    kind: 'commit',
    commit: {
        rev: `rev-${cursor}`,
        operation: 'create',
        collection: aidPostCollection,
        rkey,
        cid: `cid-${cursor}`,
        record: {
            $type: aidPostCollection,
            version: '1.0.0',
            title: 'Food support needed',
            description: 'Shelf-stable groceries requested.',
            category: 'food',
            urgency: 'high',
            status: 'open',
            location: {
                latitude: 41.88,
                longitude: -87.63,
                precisionKm: 3,
            },
            createdAt: '2026-07-11T12:00:00.000Z',
        },
    },
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
    const deadline = Date.now() + 2_000;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error('Timed out waiting for stream behavior.');
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
};

describe('JetstreamEventSource', () => {
    const sources: JetstreamEventSource[] = [];
    const servers: WebSocketServer[] = [];

    afterEach(async () => {
        await Promise.all(sources.map(source => source.stop()));
        await Promise.all(
            servers.map(
                server =>
                    new Promise<void>(resolve => server.close(() => resolve())),
            ),
        );
    });

    it('reconnects from the last acknowledged Jetstream cursor', async () => {
        const server = new WebSocketServer({ port: 0 });
        servers.push(server);
        await once(server, 'listening');

        const address = server.address();
        if (typeof address === 'string' || address === null) {
            throw new Error('Expected a TCP WebSocket address.');
        }

        const connectionUrls: string[] = [];
        let connectionCount = 0;
        server.on('connection', (socket, request) => {
            connectionCount += 1;
            connectionUrls.push(request.url ?? '');
            socket.send(
                JSON.stringify(
                    connectionCount === 1 ?
                        commitFrame(100, 'first')
                    :   commitFrame(101, 'second'),
                ),
            );
            if (connectionCount === 1) {
                socket.close();
            }
        });

        const received: unknown[] = [];
        const source = new JetstreamEventSource({
            url: `ws://127.0.0.1:${address.port}/subscribe`,
            collections: [aidPostCollection],
            minReconnectDelayMs: 5,
            maxReconnectDelayMs: 10,
            jitterRatio: 0,
        });
        sources.push(source);

        await source.start(99, async event => {
            received.push(event);
        });

        await waitFor(() => received.length === 2);

        expect(connectionUrls).toHaveLength(2);
        expect(new URL(connectionUrls[0]!, 'ws://localhost').searchParams.get('cursor')).toBe('99');
        expect(new URL(connectionUrls[1]!, 'ws://localhost').searchParams.get('cursor')).toBe('100');
        expect(
            new URL(connectionUrls[0]!, 'ws://localhost').searchParams.getAll(
                'wantedCollections',
            ),
        ).toEqual([aidPostCollection]);
        expect(received).toEqual([
            expect.objectContaining({
                seq: 100,
                action: 'create',
                uri: `at://did:plc:alice/${aidPostCollection}/first`,
                collection: aidPostCollection,
                cid: 'cid-100',
                revision: 'rev-100',
            }),
            expect.objectContaining({
                seq: 101,
                action: 'create',
                uri: `at://did:plc:alice/${aidPostCollection}/second`,
                collection: aidPostCollection,
            }),
        ]);
    });

    it('rejects oversized frames and reports them without delivery', async () => {
        const server = new WebSocketServer({ port: 0 });
        servers.push(server);
        await once(server, 'listening');
        const address = server.address();
        if (typeof address === 'string' || address === null) {
            throw new Error('Expected a TCP WebSocket address.');
        }
        server.once('connection', socket => socket.send('x'.repeat(128)));

        const received: unknown[] = [];
        const source = new JetstreamEventSource({
            url: `ws://127.0.0.1:${address.port}/subscribe`,
            collections: [aidPostCollection],
            maxMessageBytes: 32,
            minReconnectDelayMs: 1_000,
            maxReconnectDelayMs: 1_000,
        });
        sources.push(source);
        await source.start(null, async event => {
            received.push(event);
        });

        await waitFor(() => source.getMetrics().oversizedFramesTotal === 1);
        expect(received).toEqual([]);
    });

    it('ignores duplicate, out-of-order, and malformed frames', async () => {
        const server = new WebSocketServer({ port: 0 });
        servers.push(server);
        await once(server, 'listening');
        const address = server.address();
        if (typeof address === 'string' || address === null) {
            throw new Error('Expected a TCP WebSocket address.');
        }
        server.once('connection', socket => {
            socket.send(JSON.stringify(commitFrame(200, 'accepted')));
            socket.send(JSON.stringify(commitFrame(200, 'duplicate')));
            socket.send(JSON.stringify(commitFrame(199, 'old')));
            socket.send('{not-json');
        });

        const received: unknown[] = [];
        const source = new JetstreamEventSource({
            url: `ws://127.0.0.1:${address.port}/subscribe`,
            collections: [aidPostCollection],
        });
        sources.push(source);
        await source.start(null, async event => {
            received.push(event);
        });

        await waitFor(() => source.getMetrics().malformedFramesTotal === 1);
        expect(received).toHaveLength(1);
        expect(source.getMetrics()).toMatchObject({
            duplicateFramesTotal: 1,
            outOfOrderFramesTotal: 1,
            lastAcknowledgedCursor: 200,
        });
    });

    it('stops without reconnecting after the active socket closes', async () => {
        const server = new WebSocketServer({ port: 0 });
        servers.push(server);
        await once(server, 'listening');
        const address = server.address();
        if (typeof address === 'string' || address === null) {
            throw new Error('Expected a TCP WebSocket address.');
        }
        let connections = 0;
        server.on('connection', () => {
            connections += 1;
        });

        const source = new JetstreamEventSource({
            url: `ws://127.0.0.1:${address.port}/subscribe`,
            collections: [aidPostCollection],
            minReconnectDelayMs: 5,
            maxReconnectDelayMs: 5,
        });
        sources.push(source);
        await source.start(null, async () => undefined);
        await waitFor(() => connections === 1);
        await source.stop();
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(connections).toBe(1);
        expect(source.getMetrics().connected).toBe(false);
    });

    it('reconnects without advancing the cursor when event processing fails', async () => {
        const server = new WebSocketServer({ port: 0 });
        servers.push(server);
        await once(server, 'listening');
        const address = server.address();
        if (typeof address === 'string' || address === null) {
            throw new Error('Expected a TCP WebSocket address.');
        }
        const cursors: Array<string | null> = [];
        server.on('connection', (socket, request) => {
            cursors.push(
                new URL(request.url ?? '/', 'ws://localhost').searchParams.get(
                    'cursor',
                ),
            );
            socket.send(JSON.stringify(commitFrame(300, 'retry')));
        });

        let attempts = 0;
        const source = new JetstreamEventSource({
            url: `ws://127.0.0.1:${address.port}/subscribe`,
            collections: [aidPostCollection],
            minReconnectDelayMs: 5,
            maxReconnectDelayMs: 5,
            jitterRatio: 0,
        });
        sources.push(source);
        await source.start(299, async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('database unavailable');
        });

        await waitFor(() => attempts === 2);
        expect(cursors).toEqual(['299', '299']);
        expect(source.getMetrics().lastAcknowledgedCursor).toBe(300);
    });
});
