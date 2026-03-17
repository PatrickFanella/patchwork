export interface ErrorResultBody {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

export interface ErrorHttpResult {
    statusCode: number;
    body: ErrorResultBody;
}

export const toErrorHttpResult = (
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
): ErrorHttpResult => {
    return {
        statusCode,
        body: {
            error: {
                code,
                message,
                details,
            },
        },
    };
};
