import WebSocket, { type RawData } from 'ws';
import type {
    AtEventHandler,
    AtEventSource,
    EventSourceMetrics,
} from './event-source.js';

interface JetstreamEventSourceOptions {
    url: string;
    collections: readonly string[];
    minReconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
    jitterRatio?: number;
    maxMessageBytes?: number;
    random?: () => number;
    now?: () => number;
}

interface JetstreamCommitFrame {
    did: string;
    time_us: number;
    kind: 'commit';
    commit: {
        rev?: string;
        cid?: string;
        operation: 'create' | 'update' | 'delete';
        collection: string;
        rkey: string;
        record?: unknown;
    };
}

const initialMetrics = (): EventSourceMetrics => ({
    connected: false,
    connectionsTotal: 0,
    reconnectsTotal: 0,
    malformedFramesTotal: 0,
    oversizedFramesTotal: 0,
    duplicateFramesTotal: 0,
    outOfOrderFramesTotal: 0,
    lagMilliseconds: null,
    lastAcknowledgedCursor: null,
});

const isCommitFrame = (value: unknown): value is JetstreamCommitFrame => {
    if (typeof value !== 'object' || value === null) return false;
    const frame = value as Record<string, unknown>;
    if (
        typeof frame.did !== 'string' ||
        !Number.isSafeInteger(frame.time_us) ||
        (frame.time_us as number) < 0 ||
        frame.kind !== 'commit' ||
        typeof frame.commit !== 'object' ||
        frame.commit === null
    ) {
        return false;
    }
    const commit = frame.commit as Record<string, unknown>;
    return (
        ['create', 'update', 'delete'].includes(String(commit.operation)) &&
        typeof commit.collection === 'string' &&
        typeof commit.rkey === 'string' &&
        (commit.operation === 'delete' || commit.record !== undefined)
    );
};

const rawDataBytes = (data: RawData): number =>
    Array.isArray(data) ?
        data.reduce((total, part) => total + part.byteLength, 0)
    :   data.byteLength;

const rawDataText = (data: RawData): string =>
    Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString();

export class JetstreamEventSource implements AtEventSource {
    private readonly collections: ReadonlySet<string>;
    private readonly minReconnectDelayMs: number;
    private readonly maxReconnectDelayMs: number;
    private readonly jitterRatio: number;
    private readonly maxMessageBytes: number;
    private readonly random: () => number;
    private readonly now: () => number;
    private metrics = initialMetrics();
    private socket: WebSocket | null = null;
    private stopped = true;
    private reconnectAttempt = 0;
    private handler: AtEventHandler | null = null;
    private messageChain: Promise<void> = Promise.resolve();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: JetstreamEventSourceOptions) {
        if (options.collections.length === 0) {
            throw new Error('Jetstream requires at least one collection filter.');
        }
        this.collections = new Set(options.collections);
        this.minReconnectDelayMs = options.minReconnectDelayMs ?? 250;
        this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
        this.jitterRatio = options.jitterRatio ?? 0.2;
        this.maxMessageBytes = options.maxMessageBytes ?? 1_048_576;
        this.random = options.random ?? Math.random;
        this.now = options.now ?? Date.now;
    }

    async start(cursor: number | null, onEvent: AtEventHandler): Promise<void> {
        if (!this.stopped) throw new Error('Jetstream source is already running.');
        this.stopped = false;
        this.handler = onEvent;
        this.metrics = initialMetrics();
        this.metrics.lastAcknowledgedCursor = cursor;
        void this.connect(false).catch(() => {
            this.scheduleReconnect();
        });
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const socket = this.socket;
        this.socket = null;
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            const closed = new Promise<void>(resolve =>
                socket.once('close', () => resolve()),
            );
            socket.close(1000, 'shutdown');
            await closed;
        }
        await this.messageChain;
        this.metrics.connected = false;
    }

    getMetrics(): EventSourceMetrics {
        return { ...this.metrics };
    }

    private buildUrl(): string {
        const url = new URL(this.options.url);
        url.searchParams.delete('wantedCollections');
        for (const collection of this.collections) {
            url.searchParams.append('wantedCollections', collection);
        }
        url.searchParams.set('maxMessageSizeBytes', String(this.maxMessageBytes));
        if (this.metrics.lastAcknowledgedCursor !== null) {
            url.searchParams.set(
                'cursor',
                String(this.metrics.lastAcknowledgedCursor),
            );
        }
        return url.toString();
    }

    private connect(isReconnect: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.stopped) {
                resolve();
                return;
            }
            const socket = new WebSocket(this.buildUrl(), {
                maxPayload: this.maxMessageBytes,
            });
            this.socket = socket;
            let opened = false;

            socket.once('open', () => {
                opened = true;
                this.reconnectAttempt = 0;
                this.metrics.connected = true;
                this.metrics.connectionsTotal += 1;
                if (isReconnect) this.metrics.reconnectsTotal += 1;
                resolve();
            });
            socket.on('message', data => {
                this.messageChain = this.messageChain
                    .then(() => this.handleMessage(data))
                    .catch(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.close(1011, 'event processing failed');
                        }
                    });
            });
            socket.once('close', () => {
                if (this.socket === socket) this.socket = null;
                this.metrics.connected = false;
                if (!opened) resolve();
                void this.messageChain.then(() => this.scheduleReconnect());
            });
            socket.once('error', error => {
                if (/max payload size exceeded/i.test(error.message)) {
                    this.metrics.oversizedFramesTotal += 1;
                }
                if (!opened) reject(error);
            });
        });
    }

    private async handleMessage(data: RawData): Promise<void> {
        if (rawDataBytes(data) > this.maxMessageBytes) {
            this.metrics.oversizedFramesTotal += 1;
            return;
        }
        let value: unknown;
        try {
            value = JSON.parse(rawDataText(data));
        } catch {
            this.metrics.malformedFramesTotal += 1;
            return;
        }
        if (!isCommitFrame(value) || !this.collections.has(value.commit.collection)) {
            this.metrics.malformedFramesTotal += 1;
            return;
        }

        const priorCursor = this.metrics.lastAcknowledgedCursor;
        if (priorCursor !== null && value.time_us <= priorCursor) {
            if (value.time_us === priorCursor) {
                this.metrics.duplicateFramesTotal += 1;
            } else {
                this.metrics.outOfOrderFramesTotal += 1;
            }
            return;
        }

        const envelope = {
            seq: value.time_us,
            receivedAt: new Date(value.time_us / 1_000).toISOString(),
            action: value.commit.operation,
            uri: `at://${value.did}/${value.commit.collection}/${value.commit.rkey}`,
            collection: value.commit.collection,
            authorDid: value.did,
            cid: value.commit.cid,
            revision: value.commit.rev,
            record: value.commit.record,
            deleteReason:
                value.commit.operation === 'delete' ? 'deleted-upstream' : undefined,
        };
        await this.handler?.(envelope);
        this.metrics.lastAcknowledgedCursor = value.time_us;
        this.metrics.lagMilliseconds = Math.max(
            0,
            this.now() - value.time_us / 1_000,
        );
    }

    private scheduleReconnect(): void {
        if (this.stopped || this.reconnectTimer) return;
        const base = Math.min(
            this.maxReconnectDelayMs,
            this.minReconnectDelayMs * 2 ** this.reconnectAttempt,
        );
        this.reconnectAttempt += 1;
        const jitter = base * this.jitterRatio * (this.random() * 2 - 1);
        const delay = Math.max(0, Math.round(base + jitter));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect(true).catch(() => this.scheduleReconnect());
        }, delay);
    }
}
