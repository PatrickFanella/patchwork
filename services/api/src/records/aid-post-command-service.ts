import type { AidPostRecord } from '@patchwork/at-lexicons';
import type { AidPostRecordResult } from '@patchwork/at-client';
import { z } from 'zod';

export interface AidPostClient {
    create(record: unknown): Promise<AidPostRecordResult>;
    get(uri: string): Promise<AidPostRecordResult>;
    update(
        uri: string,
        expectedCid: string,
        record: unknown,
    ): Promise<AidPostRecordResult>;
    delete(uri: string, expectedCid: string): Promise<void>;
}

export type AidPostClientFactory = (
    sessionToken: string,
) => Promise<AidPostClient>;

const uriSchema = z.string().regex(/^at:\/\/[^/]+\/app\.patchwork\.aid\.post\/[^/]+$/);

const mutationReferenceSchema = z.object({
    uri: uriSchema,
    expectedCid: z.string().min(1),
});

const updateCommandSchema = mutationReferenceSchema.extend({
    record: z.unknown(),
});

const closeCommandSchema = mutationReferenceSchema.extend({
    updatedAt: z.string().datetime({ offset: true }),
});

export class AidPostCommandService {
    constructor(private readonly clientFactory: AidPostClientFactory) {}

    async create(
        sessionToken: string,
        record: unknown,
    ): Promise<AidPostRecordResult> {
        const client = await this.clientFactory(sessionToken);
        return client.create(record);
    }

    async get(
        sessionToken: string,
        uri: string,
    ): Promise<AidPostRecordResult> {
        const client = await this.clientFactory(sessionToken);
        return client.get(uriSchema.parse(uri));
    }

    async update(
        sessionToken: string,
        input: unknown,
    ): Promise<AidPostRecordResult> {
        const command = updateCommandSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        return client.update(
            command.uri,
            command.expectedCid,
            command.record,
        );
    }

    async close(
        sessionToken: string,
        input: unknown,
    ): Promise<AidPostRecordResult> {
        const command = closeCommandSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        const current = await client.get(command.uri);
        const closed: AidPostRecord = {
            ...current.record,
            status: 'closed',
            updatedAt: command.updatedAt,
        };
        return client.update(command.uri, command.expectedCid, closed);
    }

    async delete(sessionToken: string, input: unknown): Promise<void> {
        const command = mutationReferenceSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        await client.delete(command.uri, command.expectedCid);
    }
}
