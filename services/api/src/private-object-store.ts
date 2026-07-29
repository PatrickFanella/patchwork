import { Readable } from 'node:stream';
import { Client } from 'minio';

export interface PrivateObject {
    key: string;
    lastModified: Date;
    size: number;
}

export interface PrivateObjectStore {
    ensureReady(): Promise<void>;
    put(
        key: string,
        body: Buffer,
        contentType: string,
    ): Promise<void>;
    get(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<PrivateObject[]>;
}

const readStream = async (
    stream: Readable,
    maximumBytes: number,
): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maximumBytes) {
            stream.destroy();
            throw new Error('PRIVATE_OBJECT_EXCEEDS_BOUNDARY');
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
};

export class MinioPrivateObjectStore implements PrivateObjectStore {
    private readonly client: Client;

    constructor(
        private readonly bucket: string,
        options: {
            endpoint: string;
            accessKey: string;
            secretKey: string;
            region?: string;
        },
    ) {
        const endpoint = new URL(options.endpoint);
        this.client = new Client({
            endPoint: endpoint.hostname,
            port:
                endpoint.port ?
                    Number(endpoint.port)
                : endpoint.protocol === 'https:' ?
                    443
                :   80,
            useSSL: endpoint.protocol === 'https:',
            accessKey: options.accessKey,
            secretKey: options.secretKey,
            region: options.region,
            pathStyle: true,
        });
    }

    async ensureReady(): Promise<void> {
        if (!(await this.client.bucketExists(this.bucket))) {
            await this.client.makeBucket(this.bucket);
        }
        await this.client.setBucketPolicy(
            this.bucket,
            JSON.stringify({
                Version: '2012-10-17',
                Statement: [],
            }),
        );
    }

    async put(
        key: string,
        body: Buffer,
        contentType: string,
    ): Promise<void> {
        await this.client.putObject(
            this.bucket,
            key,
            body,
            body.length,
            {
                'content-type': contentType,
                'cache-control': 'private, no-store',
            },
        );
    }

    async get(key: string): Promise<Buffer> {
        const stream = await this.client.getObject(this.bucket, key);
        return readStream(stream, 10 * 1024 * 1024 + 1);
    }

    async delete(key: string): Promise<void> {
        await this.client.removeObject(this.bucket, key);
    }

    async list(prefix: string): Promise<PrivateObject[]> {
        const stream = this.client.listObjectsV2(
            this.bucket,
            prefix,
            true,
        );
        const objects: PrivateObject[] = [];
        for await (const item of stream) {
            if (!item.name) continue;
            objects.push({
                key: item.name,
                lastModified: item.lastModified ?? new Date(0),
                size: item.size,
            });
        }
        return objects;
    }
}
