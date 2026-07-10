import { Agent } from '@atproto/api';
import {
    aidPostSchema,
    recordNsid,
    type AidPostRecord,
} from '@patchwork/at-lexicons';
import { AtClientError, toAtClientError } from './errors.js';
import type { OAuthSessionHandle } from './oauth-client.js';

const COLLECTION = recordNsid.aidPost;
const ALPHA_MINIMUM_PRECISION_KM = 1;

export interface CreateRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    record: AidPostRecord;
}

export interface GetRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
}

export interface PutRecordInput extends CreateRecordInput {
    rkey: string;
    swapRecord: string;
}

export interface DeleteRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
    swapRecord: string;
}

export interface AtRecordTransport {
    did: string;
    createRecord(input: CreateRecordInput): Promise<{ uri: string; cid: string }>;
    getRecord(
        input: GetRecordInput,
    ): Promise<{ uri: string; cid?: string; value: unknown }>;
    putRecord(input: PutRecordInput): Promise<{ uri: string; cid: string }>;
    deleteRecord(input: DeleteRecordInput): Promise<void>;
}

export interface AidPostRecordResult {
    uri: string;
    cid: string;
    record: AidPostRecord;
}

const validateAidPost = (input: unknown): AidPostRecord => {
    const record = aidPostSchema.parse(input);
    if (record.location.precisionKm < ALPHA_MINIMUM_PRECISION_KM) {
        throw new AtClientError(
            'INVALID_RECORD',
            'Public aid-post location precision must be at least one kilometre.',
        );
    }
    return record;
};

const parseAidPostUri = (
    uri: string,
): { repo: string; collection: typeof COLLECTION; rkey: string } => {
    const match = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
    if (!match) {
        throw new AtClientError('INVALID_URI', 'Expected a complete AT record URI.');
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

export class AidPostRecordClient {
    constructor(private readonly transport: AtRecordTransport) {}

    async create(input: unknown): Promise<AidPostRecordResult> {
        try {
            const record = validateAidPost(input);
            const result = await this.transport.createRecord({
                repo: this.transport.did,
                collection: COLLECTION,
                record,
            });
            return { ...result, record };
        } catch (error) {
            throw toAtClientError(error, 'Unable to create the AT aid-post record.');
        }
    }

    async get(uri: string): Promise<AidPostRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const result = await this.transport.getRecord(parsed);
            const record = validateAidPost(result.value);
            if (!result.cid) {
                throw new AtClientError(
                    'UPSTREAM_ERROR',
                    'The PDS response did not include a record CID.',
                );
            }
            return { uri: result.uri, cid: result.cid, record };
        } catch (error) {
            throw toAtClientError(error, 'Unable to read the AT aid-post record.');
        }
    }

    async update(
        uri: string,
        expectedCid: string,
        input: unknown,
    ): Promise<AidPostRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const record = validateAidPost(input);
            const result = await this.transport.putRecord({
                ...parsed,
                record,
                swapRecord: expectedCid,
            });
            return { ...result, record };
        } catch (error) {
            throw toAtClientError(error, 'Unable to update the AT aid-post record.');
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
            throw toAtClientError(error, 'Unable to delete the AT aid-post record.');
        }
    }

    private parseOwnedUri(uri: string): GetRecordInput {
        const parsed = parseAidPostUri(uri);
        if (parsed.repo !== this.transport.did) {
            throw new AtClientError(
                'UNAUTHORIZED',
                'The authenticated DID does not own this aid-post record.',
            );
        }
        return parsed;
    }
}

export const createAgentRecordTransport = (
    session: OAuthSessionHandle,
): AtRecordTransport => {
    const agent = new Agent(session.fetch);

    return {
        did: session.did,
        createRecord: async input => {
            const response = await agent.com.atproto.repo.createRecord(input);
            return response.data;
        },
        getRecord: async input => {
            const response = await agent.com.atproto.repo.getRecord(input);
            return response.data;
        },
        putRecord: async input => {
            const response = await agent.com.atproto.repo.putRecord(input);
            return response.data;
        },
        deleteRecord: async input => {
            await agent.com.atproto.repo.deleteRecord(input);
        },
    };
};
