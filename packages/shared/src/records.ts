const randomUUID = (): string => globalThis.crypto.randomUUID();
import { z } from 'zod';
import {
    type AidPostRecord,
    type RecordByNsid,
    recordNsid,
    type RecordNsid,
    validateRecordPayload,
} from '@patchwork/at-lexicons';
import { deepClone } from './clone.js';
import { didSchema, isoDateTimeSchema } from './schemas.js';

export type RecordWriteErrorCode =
    | 'VALIDATION_FAILED'
    | 'NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'TOMBSTONED'
    | 'CONFLICT';

export class RecordWriteError extends Error {
    constructor(
        readonly code: RecordWriteErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'RecordWriteError';
    }
}

export interface TombstoneRecord {
    $type: 'app.patchwork.system.tombstone';
    uri: string;
    collection: RecordNsid;
    deletedByDid: string;
    reason: string;
    deletedAt: string;
    previousVersion: number;
}

export interface StoredRecord<N extends RecordNsid = RecordNsid> {
    uri: string;
    collection: N;
    authorDid: string;
    value: RecordByNsid[N];
    version: number;
    createdAt: string;
    updatedAt: string;
    lifecycle: 'active' | 'tombstoned';
    tombstone?: TombstoneRecord;
}

export interface CreateRecordInput<N extends RecordNsid = RecordNsid> {
    collection: N;
    authorDid: string;
    value: unknown;
    rkey?: string;
}

export interface UpdateRecordInput {
    uri: string;
    updatedByDid: string;
    value: unknown;
}

export interface DeleteRecordInput {
    uri: string;
    deletedByDid: string;
    reason?: string;
}

export type RecordMutationEvent =
    | {
          type: 'record.created';
          occurredAt: string;
          uri: string;
          collection: RecordNsid;
          version: number;
          value: RecordByNsid[RecordNsid];
      }
    | {
          type: 'record.updated';
          occurredAt: string;
          uri: string;
          collection: RecordNsid;
          version: number;
          value: RecordByNsid[RecordNsid];
      }
    | {
          type: 'record.deleted';
          occurredAt: string;
          uri: string;
          collection: RecordNsid;
          version: number;
          tombstone: TombstoneRecord;
      };

const recordNsidEnumValues = [
    recordNsid.aidPost,
    recordNsid.volunteerProfile,
    recordNsid.conversationMeta,
    recordNsid.moderationReport,
    recordNsid.directoryResource,
] as const;

const mutationEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('record.created'),
        occurredAt: isoDateTimeSchema,
        uri: z.string().regex(/^at:\/\//),
        collection: z.enum(recordNsidEnumValues),
        version: z.number().int().positive(),
        value: z.unknown(),
    }),
    z.object({
        type: z.literal('record.updated'),
        occurredAt: isoDateTimeSchema,
        uri: z.string().regex(/^at:\/\//),
        collection: z.enum(recordNsidEnumValues),
        version: z.number().int().positive(),
        value: z.unknown(),
    }),
    z.object({
        type: z.literal('record.deleted'),
        occurredAt: isoDateTimeSchema,
        uri: z.string().regex(/^at:\/\//),
        collection: z.enum(recordNsidEnumValues),
        version: z.number().int().positive(),
        tombstone: z.object({
            $type: z.literal('app.patchwork.system.tombstone'),
            uri: z.string().regex(/^at:\/\//),
            collection: z.enum(recordNsidEnumValues),
            deletedByDid: didSchema,
            reason: z.string().min(1).max(200),
            deletedAt: isoDateTimeSchema,
            previousVersion: z.number().int().positive(),
        }),
    }),
]);

const aidPostTransitionMap: Record<string, Set<string>> = {
    open: new Set(['open', 'in-progress', 'resolved', 'closed']),
    'in-progress': new Set(['in-progress', 'resolved', 'closed']),
    resolved: new Set(['resolved', 'closed']),
    closed: new Set(['closed']),
};

const buildAtUri = (
    authorDid: string,
    collection: RecordNsid,
    rkey: string,
): string => {
    return `at://${authorDid}/${collection}/${rkey}`;
};

export class AtRecordRepository {
    private readonly records = new Map<string, StoredRecord<RecordNsid>>();
    private readonly mutationEvents: RecordMutationEvent[] = [];

    createRecord<N extends RecordNsid>(
        input: CreateRecordInput<N>,
    ): StoredRecord<N> {
        const authorDid = didSchema.parse(input.authorDid);

        const now = new Date().toISOString();
        const rkey = input.rkey ?? randomUUID();
        const uri = buildAtUri(authorDid, input.collection, rkey);

        const existing = this.records.get(uri);
        if (existing?.lifecycle === 'active') {
            throw new RecordWriteError(
                'CONFLICT',
                'Record URI already exists.',
                { uri },
            );
        }

        if (existing?.lifecycle === 'tombstoned') {
            throw new RecordWriteError(
                'TOMBSTONED',
                'Cannot recreate a tombstoned record URI.',
                { uri },
            );
        }

        let validated: RecordByNsid[N];
        try {
            validated = validateRecordPayload(input.collection, input.value);
        } catch (error) {
            throw new RecordWriteError(
                'VALIDATION_FAILED',
                'Record payload failed schema validation.',
                {
                    collection: input.collection,
                    cause: error instanceof Error ? error.message : 'unknown',
                },
            );
        }

        const record: StoredRecord<N> = {
            uri,
            collection: input.collection,
            authorDid,
            value: validated,
            version: 1,
            createdAt: now,
            updatedAt: now,
            lifecycle: 'active',
        };

        this.records.set(uri, record as StoredRecord<RecordNsid>);
        this.mutationEvents.push({
            type: 'record.created',
            occurredAt: now,
            uri,
            collection: input.collection,
            version: 1,
            value: validated as RecordByNsid[RecordNsid],
        });

        return this.cloneRecord(record);
    }

    updateRecord(input: UpdateRecordInput): StoredRecord<RecordNsid> {
        const updatedByDid = didSchema.parse(input.updatedByDid);
        const existing = this.records.get(input.uri);

        if (!existing) {
            throw new RecordWriteError('NOT_FOUND', 'Record not found.', {
                uri: input.uri,
            });
        }

        if (existing.lifecycle === 'tombstoned') {
            throw new RecordWriteError(
                'TOMBSTONED',
                'Cannot update a tombstoned record.',
                {
                    uri: input.uri,
                    tombstone: existing.tombstone,
                },
            );
        }

        let validated: RecordByNsid[RecordNsid];
        try {
            validated = validateRecordPayload(
                existing.collection,
                input.value,
            ) as RecordByNsid[RecordNsid];
        } catch (error) {
            throw new RecordWriteError(
                'VALIDATION_FAILED',
                'Record payload failed schema validation.',
                {
                    collection: existing.collection,
                    cause: error instanceof Error ? error.message : 'unknown',
                },
            );
        }

        if (existing.collection === recordNsid.aidPost) {
            const previousStatus = (existing.value as AidPostRecord).status;
            const nextStatus = (validated as AidPostRecord).status;
            if (!aidPostTransitionMap[previousStatus]?.has(nextStatus)) {
                throw new RecordWriteError(
                    'INVALID_TRANSITION',
                    'Aid post status transition is not allowed.',
                    {
                        previousStatus,
                        nextStatus,
                        uri: input.uri,
                        updatedByDid,
                    },
                );
            }
        }

        const updatedAt = new Date().toISOString();
        const nextVersion = existing.version + 1;

        const next: StoredRecord<RecordNsid> = {
            ...existing,
            value: validated,
            version: nextVersion,
            updatedAt,
        };

        this.records.set(input.uri, next);

        this.mutationEvents.push({
            type: 'record.updated',
            occurredAt: updatedAt,
            uri: input.uri,
            collection: existing.collection,
            version: nextVersion,
            value: validated,
        });

        return this.cloneRecord(next);
    }

    deleteRecord(input: DeleteRecordInput): TombstoneRecord {
        const deletedByDid = didSchema.parse(input.deletedByDid);
        const existing = this.records.get(input.uri);

        if (!existing) {
            throw new RecordWriteError('NOT_FOUND', 'Record not found.', {
                uri: input.uri,
            });
        }

        if (existing.lifecycle === 'tombstoned' && existing.tombstone) {
            return { ...existing.tombstone };
        }

        const deletedAt = new Date().toISOString();

        const tombstone: TombstoneRecord = {
            $type: 'app.patchwork.system.tombstone',
            uri: input.uri,
            collection: existing.collection,
            deletedByDid,
            reason: input.reason?.trim() || 'deleted-by-author',
            deletedAt,
            previousVersion: existing.version,
        };

        const nextVersion = existing.version + 1;

        this.records.set(input.uri, {
            ...existing,
            version: nextVersion,
            updatedAt: deletedAt,
            lifecycle: 'tombstoned',
            tombstone,
        });

        this.mutationEvents.push({
            type: 'record.deleted',
            occurredAt: deletedAt,
            uri: input.uri,
            collection: existing.collection,
            version: nextVersion,
            tombstone,
        });

        return { ...tombstone };
    }

    getRecord(uri: string): StoredRecord<RecordNsid> | null {
        const record = this.records.get(uri);
        return record ? this.cloneRecord(record) : null;
    }

    getActiveRecord(uri: string): StoredRecord<RecordNsid> | null {
        const record = this.records.get(uri);
        if (!record || record.lifecycle === 'tombstoned') {
            return null;
        }

        return this.cloneRecord(record);
    }

    listMutationEvents(): RecordMutationEvent[] {
        return this.mutationEvents.map(event => deepClone(event));
    }

    serializeMutationEvent(event: RecordMutationEvent): string {
        return JSON.stringify(event);
    }

    deserializeMutationEvent(payload: string): RecordMutationEvent {
        return mutationEventSchema.parse(
            JSON.parse(payload),
        ) as RecordMutationEvent;
    }

    private cloneRecord<N extends RecordNsid>(
        record: StoredRecord<N>,
    ): StoredRecord<N> {
        return deepClone(record);
    }
}
