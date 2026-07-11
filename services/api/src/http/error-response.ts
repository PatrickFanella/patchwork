export class PublicHttpError extends Error {
    constructor(
        readonly statusCode: number,
        readonly code: string,
        readonly publicMessage: string,
    ) {
        super(publicMessage);
        this.name = 'PublicHttpError';
    }
}

export interface PublicErrorEnvelope {
    error: {
        code: string;
        message: string;
        requestId: string;
    };
}

export const toPublicError = (
    error: unknown,
    requestId: string,
): { statusCode: number; body: PublicErrorEnvelope } => {
    if (error instanceof PublicHttpError) {
        return {
            statusCode: error.statusCode,
            body: {
                error: {
                    code: error.code,
                    message: error.publicMessage,
                    requestId,
                },
            },
        };
    }
    return {
        statusCode: 500,
        body: {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'The server could not complete the request.',
                requestId,
            },
        },
    };
};

export const ensureRequestId = (response: ServerResponse): string => {
    const current = response.getHeader('x-request-id');
    if (typeof current === 'string') return current;
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    return requestId;
};

export const writeJsonResponse = (
    response: ServerResponse,
    statusCode: number,
    body: unknown,
    extraHeaders: Record<string, string> = {},
): void => {
    const requestId = ensureRequestId(response);
    const renderedBody =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'object' &&
        body.error !== null ?
            { ...body, error: { ...body.error, requestId } }
        :   body;
    response.writeHead(statusCode, {
        'content-type': 'application/json',
        ...extraHeaders,
    });
    response.end(JSON.stringify(renderedBody));
};

export const writePublicError = (
    response: ServerResponse,
    error: unknown,
): void => {
    const rendered = toPublicError(error, ensureRequestId(response));
    writeJsonResponse(response, rendered.statusCode, rendered.body);
};
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
