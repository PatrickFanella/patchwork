import { createHash } from 'node:crypto';
import {
    directoryResourceSchema,
    type DirectoryResourceRecord,
} from '@patchwork/at-lexicons';
import type { DirectoryResourceRecordResult } from '@patchwork/at-client';
import { z } from 'zod';
import type { PublicSubmissionSafetyGate } from '../public-submission-safety.js';
import { PublicHttpError } from '../http/error-response.js';

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
        private readonly safetyGate?: PublicSubmissionSafetyGate,
    ) {}

    async create(
        sessionToken: string,
        input: unknown,
        idempotencyKey?: string,
        actorDid?: string,
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
        if (this.safetyGate) {
            if (!rkey || !actorDid || !idempotencyKey) {
                throw new PublicHttpError(
                    503,
                    'SUBMISSION_SAFETY_UNAVAILABLE',
                    'Publication safety checks are unavailable. Nothing was published.',
                );
            }
            await this.safetyGate.review({
                actorDid,
                subjectUri:
                    `at://${actorDid}/app.patchwork.directory.resource/${rkey}`,
                submissionType: 'directory-resource',
                operation: 'create',
                record: publicRecord as unknown as Record<string, unknown>,
                idempotencyKey:
                    `directory-resource:create:${idempotencyKey}`,
            });
        }
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
        idempotencyKey?: string,
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
        if (this.safetyGate) {
            if (!idempotencyKey) {
                throw new PublicHttpError(
                    503,
                    'SUBMISSION_SAFETY_UNAVAILABLE',
                    'Publication safety checks are unavailable. Nothing was published.',
                );
            }
            await this.safetyGate.review({
                actorDid: command.uri.slice(5).split('/')[0]!,
                subjectUri: command.uri,
                submissionType: 'directory-resource',
                operation: 'update',
                record: publicRecord as unknown as Record<string, unknown>,
                idempotencyKey:
                    `directory-resource:update:${idempotencyKey}`,
            });
        }
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
