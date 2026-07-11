import type { AidPostRecord } from '@patchwork/at-lexicons';
import { AtClientError, type AidPostRecordResult } from '@patchwork/at-client';
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

export interface AidPostDeletionReconciler {
    reconcileDeletion(command: {
        commandId: string;
        postUri: string;
        actorDid: string;
        occurredAt: string;
        auditRetentionUntil: string;
    }): Promise<unknown>;
}

export interface AidPostLifecycleStatusSource {
    get(postUri: string): Promise<
        | {
              currentStatus: string;
          }
        | undefined
    >;
    recordPublicStatusSync(command: {
        commandId: string;
        postUri: string;
        actorDid: string;
        publicStatus: AidPostRecord['status'];
        publicCid: string;
        occurredAt: string;
        auditRetentionUntil: string;
    }): Promise<unknown>;
}

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

const reconcileStatusCommandSchema = mutationReferenceSchema.extend({
    updatedAt: z.string().datetime({ offset: true }),
});

const toPublicStatus = (
    privateStatus: string,
): AidPostRecord['status'] => {
    switch (privateStatus) {
        case 'open':
        case 'triaged':
            return 'open';
        case 'assigned':
        case 'in_progress':
            return 'in-progress';
        case 'resolved':
            return 'resolved';
        case 'archived':
            return 'closed';
        default:
            throw new AtClientError(
                'UPSTREAM_ERROR',
                `Unsupported private lifecycle status '${privateStatus}'.`,
            );
    }
};

export class AidPostCommandService {
    constructor(
        private readonly clientFactory: AidPostClientFactory,
        private readonly deletionReconciler?: AidPostDeletionReconciler,
        private readonly lifecycleStatusSource?: AidPostLifecycleStatusSource,
    ) {}

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

    async reconcileStatus(
        sessionToken: string,
        input: unknown,
    ): Promise<AidPostRecordResult> {
        const command = reconcileStatusCommandSchema.parse(input);
        const lifecycleStatusSource = this.lifecycleStatusSource;
        if (!lifecycleStatusSource) {
            throw new AtClientError(
                'UPSTREAM_ERROR',
                'Durable lifecycle status reconciliation is unavailable.',
            );
        }
        const workflow = await lifecycleStatusSource.get(command.uri);
        if (!workflow) {
            throw new AtClientError(
                'NOT_FOUND',
                'No durable lifecycle workflow exists for this aid-post.',
            );
        }
        const client = await this.clientFactory(sessionToken);
        const current = await client.get(command.uri);
        const status = toPublicStatus(workflow.currentStatus);
        const result =
            current.record.status === status
                ? current
                : await client.update(command.uri, command.expectedCid, {
                      ...current.record,
                      status,
                      updatedAt: command.updatedAt,
                  });
        const actorDid = command.uri.slice('at://'.length).split('/')[0]!;
        await lifecycleStatusSource.recordPublicStatusSync({
            commandId: `public-status-sync:${command.uri}:${result.cid}`,
            postUri: command.uri,
            actorDid,
            publicStatus: status,
            publicCid: result.cid,
            occurredAt: command.updatedAt,
            auditRetentionUntil: new Date(
                new Date(command.updatedAt).getTime() + 365 * 24 * 60 * 60 * 1000,
            ).toISOString(),
        });
        return result;
    }

    async delete(sessionToken: string, input: unknown): Promise<void> {
        const command = mutationReferenceSchema.parse(input);
        const client = await this.clientFactory(sessionToken);
        await client.delete(command.uri, command.expectedCid);
        if (this.deletionReconciler) {
            const occurredAt = new Date().toISOString();
            const actorDid = command.uri.slice('at://'.length).split('/')[0]!;
            await this.deletionReconciler.reconcileDeletion({
                commandId: `record-delete:${command.uri}:${command.expectedCid}`,
                postUri: command.uri,
                actorDid,
                occurredAt,
                auditRetentionUntil: new Date(
                    new Date(occurredAt).getTime() + 365 * 24 * 60 * 60 * 1000,
                ).toISOString(),
            });
        }
    }
}
