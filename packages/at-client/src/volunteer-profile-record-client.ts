import { Agent } from '@atproto/api';
import {
    decodeVolunteerProfileFromAt,
    encodeVolunteerProfileForAt,
    recordNsid,
    volunteerProfileSchema,
    type VolunteerProfileRecord,
} from '@patchwork/at-lexicons';
import { AtClientError, toAtClientError } from './errors.js';
import type { OAuthSessionHandle } from './oauth-client.js';

const COLLECTION = recordNsid.volunteerProfile;

export interface VolunteerProfileCreateRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    record: VolunteerProfileRecord;
}

export interface VolunteerProfileGetRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
}

export interface VolunteerProfilePutRecordInput
    extends VolunteerProfileCreateRecordInput {
    rkey: string;
    swapRecord?: string;
}

export interface VolunteerProfileDeleteRecordInput {
    repo: string;
    collection: typeof COLLECTION;
    rkey: string;
    swapRecord: string;
}

export interface AtVolunteerProfileTransport {
    did: string;
    createRecord(
        input: VolunteerProfileCreateRecordInput,
    ): Promise<{ uri: string; cid: string }>;
    getRecord(
        input: VolunteerProfileGetRecordInput,
    ): Promise<{ uri: string; cid?: string; value: unknown }>;
    putRecord(
        input: VolunteerProfilePutRecordInput,
    ): Promise<{ uri: string; cid: string }>;
    deleteRecord(input: VolunteerProfileDeleteRecordInput): Promise<void>;
}

export interface VolunteerProfileRecordResult {
    uri: string;
    cid: string;
    record: VolunteerProfileRecord;
}

const parseVolunteerProfileUri = (
    uri: string,
): VolunteerProfileGetRecordInput => {
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

export class VolunteerProfileRecordClient {
    constructor(private readonly transport: AtVolunteerProfileTransport) {}

    async create(
        input: unknown,
        rkey?: string,
    ): Promise<VolunteerProfileRecordResult> {
        try {
            const record = volunteerProfileSchema.parse(input);
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
                'Unable to create the AT volunteer-profile record.',
            );
        }
    }

    async get(uri: string): Promise<VolunteerProfileRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const result = await this.transport.getRecord(parsed);
            const record = volunteerProfileSchema.parse(result.value);
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
                'Unable to read the AT volunteer-profile record.',
            );
        }
    }

    async update(
        uri: string,
        expectedCid: string,
        input: unknown,
    ): Promise<VolunteerProfileRecordResult> {
        try {
            const parsed = this.parseOwnedUri(uri);
            const record = volunteerProfileSchema.parse(input);
            const result = await this.transport.putRecord({
                ...parsed,
                record,
                swapRecord: expectedCid,
            });
            return { ...result, record };
        } catch (error) {
            throw toAtClientError(
                error,
                'Unable to update the AT volunteer-profile record.',
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
                'Unable to delete the AT volunteer-profile record.',
            );
        }
    }

    private parseOwnedUri(uri: string): VolunteerProfileGetRecordInput {
        const parsed = parseVolunteerProfileUri(uri);
        if (parsed.repo !== this.transport.did) {
            throw new AtClientError(
                'UNAUTHORIZED',
                'The authenticated DID does not own this volunteer-profile record.',
            );
        }
        return parsed;
    }
}

export const createAgentVolunteerProfileTransport = (
    session: OAuthSessionHandle,
): AtVolunteerProfileTransport => {
    const agent = new Agent(session.fetch);
    return {
        did: session.did,
        createRecord: async input => {
            const response = await agent.com.atproto.repo.createRecord({
                ...input,
                record: encodeVolunteerProfileForAt(input.record),
                validate: false,
            });
            return response.data;
        },
        getRecord: async input => {
            const response = await agent.com.atproto.repo.getRecord(input);
            return {
                ...response.data,
                value: decodeVolunteerProfileFromAt(response.data.value),
            };
        },
        putRecord: async input => {
            const response = await agent.com.atproto.repo.putRecord({
                ...input,
                record: encodeVolunteerProfileForAt(input.record),
                validate: false,
            });
            return response.data;
        },
        deleteRecord: async input => {
            await agent.com.atproto.repo.deleteRecord(input);
        },
    };
};
