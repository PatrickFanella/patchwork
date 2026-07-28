import { createHash } from 'node:crypto';
import {
    directoryResourceSchema,
    type DirectoryResourceRecord,
} from '@patchwork/at-lexicons';
import type { DirectoryResourceRecordResult } from '@patchwork/at-client';
import { z } from 'zod';

export interface DirectoryResourceClient {
    create(
        record: unknown,
        rkey?: string,
    ): Promise<DirectoryResourceRecordResult>;
    get(uri: string): Promise<DirectoryResourceRecordResult>;
    update(
        uri: string,
        expectedCid: string,
        record: unknown,
    ): Promise<DirectoryResourceRecordResult>;
    delete(uri: string, expectedCid: string): Promise<void>;
}

export type DirectoryResourceClientFactory = (
    sessionToken: string,
) => Promise<DirectoryResourceClient>;

const uriSchema = z
    .string()
    .regex(
        /^at:\/\/did:[^/]+\/app\.patchwork\.directory\.resource\/[^/]+$/,
    );

const mutationReferenceSchema = z.object({
    uri: uriSchema,
    expectedCid: z.string().min(1),
});

const updateCommandSchema = mutationReferenceSchema.extend({
    record: z.unknown(),
});

export class DirectoryResourceCommandService {
    constructor(
        private readonly clientFactory: DirectoryResourceClientFactory,
    ) {}

    async create(
        sessionToken: string,
        input: unknown,
        idempotencyKey?: string,
    ): Promise<DirectoryResourceRecordResult> {
        const record = directoryResourceSchema.parse(input);
        const publicRecord: DirectoryResourceRecord = {
            ...record,
            verificationStatus: 'unverified',
        };
        const client = await this.clientFactory(sessionToken);
        const rkey =
            idempotencyKey ?
                `pw${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 22)}`
            :   undefined;
        return rkey ?
                client.create(publicRecord, rkey)
            :   client.create(publicRecord);
    }

    async get(
        sessionToken: string,
        uri: string,
    ): Promise<DirectoryResourceRecordResult> {
        const parsedUri = uriSchema.parse(uri);
        const client = await this.clientFactory(sessionToken);
        return client.get(parsedUri);
    }

    async update(
        sessionToken: string,
        input: unknown,
    ): Promise<DirectoryResourceRecordResult> {
        const command = updateCommandSchema.parse(input);
        const proposed = directoryResourceSchema.parse(command.record);
        const client = await this.clientFactory(sessionToken);
        const current = await client.get(command.uri);
        const publicRecord: DirectoryResourceRecord = {
            ...proposed,
            createdAt: current.record.createdAt,
            verificationStatus: current.record.verificationStatus,
        };
        return client.update(
            command.uri,
            command.expectedCid,
            publicRecord,
        );
    }

    async delete(sessionToken: string, input: unknown): Promise<void> {
        const command = mutationReferenceSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        await client.delete(command.uri, command.expectedCid);
    }
}
