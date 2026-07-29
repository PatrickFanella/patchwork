import { PublicHttpError } from './error-response.js';

export interface ModerationGatewayOptions {
    baseUrl: string;
    serviceToken: string;
    fetchImpl?: typeof fetch;
}

export interface ModerationGatewayResult {
    statusCode: number;
    body: unknown;
}

export interface ModerationGateway {
    command(input: {
        path: string;
        actorDid: string;
        body: unknown;
    }): Promise<ModerationGatewayResult>;
    readQueue(actorDid: string): Promise<ModerationGatewayResult>;
    reviewSubmission(input: {
        actorDid: string;
        body: unknown;
    }): Promise<ModerationGatewayResult>;
}

export const createModerationGateway = (
    options: ModerationGatewayOptions,
): ModerationGateway => {
    const fetchImpl = options.fetchImpl ?? fetch;
    const request = async (
        path: string,
        actorDid: string,
        method: 'GET' | 'POST',
        body?: unknown,
    ): Promise<ModerationGatewayResult> => {
        const response = await fetchImpl(new URL(path, options.baseUrl), {
            method,
            headers: {
                authorization: `Bearer ${options.serviceToken}`,
                'x-patchwork-actor-did': actorDid,
                ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
            },
            ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        });
        const responseBody = await response.json().catch(() => undefined);
        if (responseBody === undefined) {
            throw new PublicHttpError(
                502,
                'MODERATION_SERVICE_INVALID_RESPONSE',
                'The moderation service returned an invalid response.',
            );
        }
        return { statusCode: response.status, body: responseBody };
    };

    return {
        command: input => {
            const record =
                typeof input.body === 'object' && input.body !== null ?
                    { ...(input.body as Record<string, unknown>) }
                :   {};
            delete record['actorDid'];
            delete record['actorRole'];
            return request(input.path, input.actorDid, 'POST', record);
        },
        readQueue: actorDid =>
            request('/moderation/queue', actorDid, 'GET'),
        reviewSubmission: input =>
            request(
                '/moderation/submissions/review',
                input.actorDid,
                'POST',
                input.body,
            ),
    };
};
