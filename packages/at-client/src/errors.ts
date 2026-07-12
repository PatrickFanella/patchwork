import { ZodError } from 'zod';

export type AtClientErrorCode =
    | 'INVALID_RECORD'
    | 'INVALID_URI'
    | 'REVISION_CONFLICT'
    | 'SESSION_EXPIRED'
    | 'UNAUTHORIZED'
    | 'NOT_FOUND'
    | 'PDS_UNAVAILABLE'
    | 'OAUTH_DENIED'
    | 'OAUTH_STATE_INVALID'
    | 'UPSTREAM_ERROR';

export class AtClientError extends Error {
    readonly code: AtClientErrorCode;
    readonly retryable: boolean;
    readonly cause?: unknown;

    constructor(
        code: AtClientErrorCode,
        message: string,
        options?: { retryable?: boolean; cause?: unknown },
    ) {
        super(message);
        this.name = 'AtClientError';
        this.code = code;
        this.retryable = options?.retryable ?? false;
        this.cause = options?.cause;
    }
}

const readStatus = (error: unknown): number | undefined => {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }

    const candidate = error as {
        status?: unknown;
        statusCode?: unknown;
        response?: { status?: unknown };
    };
    const status =
        candidate.status ?? candidate.statusCode ?? candidate.response?.status;
    return typeof status === 'number' ? status : undefined;
};

const readMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const toAtClientError = (
    error: unknown,
    fallbackMessage: string,
): AtClientError => {
    if (error instanceof AtClientError) {
        return error;
    }

    if (error instanceof ZodError) {
        return new AtClientError('INVALID_RECORD', 'Aid-post validation failed.', {
            cause: error,
        });
    }

    const status = readStatus(error);
    const message = readMessage(error);

    if (/state.?mismatch|invalid.?state|csrf|nonce/i.test(message)) {
        return new AtClientError(
            'OAUTH_STATE_INVALID',
            'The OAuth callback state is stale or invalid.',
            { cause: error },
        );
    }

    if (/access_denied|authorization.?denied|consent.?denied/i.test(message)) {
        return new AtClientError(
            'OAUTH_DENIED',
            'Authorization was denied by the AT Protocol provider.',
            { cause: error },
        );
    }

    if (status === 401 || /invalid.?grant|expired.?session/i.test(message)) {
        return new AtClientError(
            'SESSION_EXPIRED',
            'The AT Protocol session has expired.',
            { cause: error },
        );
    }

    if (status === 403) {
        return new AtClientError(
            'UNAUTHORIZED',
            'The AT Protocol server rejected this operation.',
            { cause: error },
        );
    }

    if (status === 404) {
        return new AtClientError('NOT_FOUND', 'The AT record was not found.', {
            cause: error,
        });
    }

    if (status === 409 || /invalid.?swap|swap.*mismatch/i.test(message)) {
        return new AtClientError(
            'REVISION_CONFLICT',
            'The AT record changed since it was loaded.',
            { cause: error },
        );
    }

    if (
        status === 408 ||
        status === 429 ||
        (status !== undefined && status >= 500) ||
        /timeout|network|fetch failed|unavailable/i.test(message)
    ) {
        return new AtClientError(
            'PDS_UNAVAILABLE',
            'The AT Protocol server is temporarily unavailable.',
            { retryable: true, cause: error },
        );
    }

    return new AtClientError('UPSTREAM_ERROR', fallbackMessage, {
        cause: error,
    });
};
