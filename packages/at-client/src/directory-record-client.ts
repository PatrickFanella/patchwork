import { Agent } from '@atproto/api';
import {
    decodeDirectoryResourceFromAt,
    directoryResourceSchema,
    encodeDirectoryResourceForAt,
    recordNsid,
    type DirectoryResourceRecord,
} from '@patchwork/at-lexicons';
import { AtClientError, toAtClientError } from './errors.js';
import type { OAuthSessionHandle } from './oauth-client.js';

const COLLECTION = recordNsid.directoryResource;
const ALPHA_MINIMUM_PRECISION_KM = 1;

export interface DirectoryCreateRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    record: DirectoryResourceRecord;
}

export interface DirectoryGetRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
}

export interface DirectoryPutRecordInput extends DirectoryCreateRecordInput {
    rkey: string;
    swapRecord?: string;
}

export interface DirectoryDeleteRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
    swapRecord: string;
}

export interface AtDirectoryRecordTransport {
    did: string;
    createRecord(
        input: DirectoryCreateRecordInput,
    ): Promise<{ uri: string; cid: string }>;
    getRecord(
        input: DirectoryGetRecordInput,
    ): Promise<{ uri: string; cid?: string; value: unknown }>;
    putRecord(
        input: DirectoryPutRecordInput,
    ): Promise<{ uri: string; cid: string }>;
    deleteRecord(input: DirectoryDeleteRecordInput): Promise<void>;
}

export interface DirectoryResourceRecordResult {
    uri: string;
    cid: string;
    record: DirectoryResourceRecord;
}

const validateDirectoryResource = (
    input: unknown,
): DirectoryResourceRecord => {
    const record = directoryResourceSchema.parse(input);
    if (
        record.location &&
        record.location.precisionKm < ALPHA_MINIMUM_PRECISION_KM
    ) {
        throw new AtClientError(
            'INVALID_RECORD',
            'Public directory location precision must be at least one kilometre.',
        );
    }
    return record;
};

const parseDirectoryResourceUri = (
    uri: string,
): DirectoryGetRecordInput => {
    const match = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
    if (!match) {
        throw new AtClientError(
            'INVALID_URI',
            'Expected a complete AT record URI.',
        );
    }
    const [, repo, collection, rkey] = match;
    if (!repo || collection !== COLLECTION || !rkey) {
        throw new AtClientError(
            'INVALID_URI',
            `Expected an ${COLLECTION} AT record URI.`,
        );
    }
    return { repo, collection: COLLECTION, rkey };
};

export class DirectoryResourceRecordClient {
    constructor(private readonly transport: AtDirectoryRecordTransport) {}

    async create(
        input: unknown,
        rkey?: string,
    ): Promise<DirectoryResourceRecordResult> {
        try {
            const record = validateDirectoryResource(input);
            const createInput = {
                repo: this.transport.did,
                collection: COLLECTION,
                record,
            };
            const result =
                rkey ?
                    await this.transport.putRecord({ ...createInput, rkey })
                :   await this.transport.createRecord(createInput);
            return { ...result, record };
        } catch (error) {
            throw toAtClientError(
                error,
                'Unable to create the AT directory-resource record.',
            );
        }
    }

    async get(uri: string): Promise<DirectoryResourceRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const result = await this.transport.getRecord(parsed);
            const record = validateDirectoryResource(result.value);
            if (!result.cid) {
                throw new AtClientError(
                    'UPSTREAM_ERROR',
                    'The PDS response did not include a record CID.',
                );
            }
            return { uri: result.uri, cid: result.cid, record };
        } catch (error) {
            throw toAtClientError(
                error,
                'Unable to read the AT directory-resource record.',
            );
        }
    }

    async update(
        uri: string,
        expectedCid: string,
        input: unknown,
    ): Promise<DirectoryResourceRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const record = validateDirectoryResource(input);
            const result = await this.transport.putRecord({
                ...parsed,
                record,
                swapRecord: expectedCid,
            });
            return { ...result, record };
        } catch (error) {
            throw toAtClientError(
                error,
                'Unable to update the AT directory-resource record.',
            );
        }
    }

    async delete(uri: string, expectedCid: string): Promise<void> {
        try {
            const parsed = this.parseOwnedUri(uri);
            await this.transport.deleteRecord({
                ...parsed,
                swapRecord: expectedCid,
            });
        } catch (error) {
            throw toAtClientError(
                error,
                'Unable to delete the AT directory-resource record.',
            );
        }
    }

    private parseOwnedUri(uri: string): DirectoryGetRecordInput {
        const parsed = parseDirectoryResourceUri(uri);
        if (parsed.repo !== this.transport.did) {
            throw new AtClientError(
                'UNAUTHORIZED',
                'The authenticated DID does not own this directory-resource record.',
            );
        }
        return parsed;
    }
}

export const createAgentDirectoryRecordTransport = (
    session: OAuthSessionHandle,
): AtDirectoryRecordTransport => {
    const agent = new Agent(session.fetch);
    return {
        did: session.did,
        createRecord: async input => {
            const response = await agent.com.atproto.repo.createRecord({
                ...input,
                record: encodeDirectoryResourceForAt(input.record),
                validate: false,
            });
            return response.data;
        },
        getRecord: async input => {
            const response = await agent.com.atproto.repo.getRecord(input);
            return {
                ...response.data,
                value: decodeDirectoryResourceFromAt(response.data.value),
            };
        },
        putRecord: async input => {
            const response = await agent.com.atproto.repo.putRecord({
                ...input,
                record: encodeDirectoryResourceForAt(input.record),
                validate: false,
            });
            return response.data;
        },
        deleteRecord: async input => {
            await agent.com.atproto.repo.deleteRecord(input);
        },
    };
};
