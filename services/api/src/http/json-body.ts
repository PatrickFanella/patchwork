import type { IncomingMessage } from 'node:http';
import { PublicHttpError } from './error-response.js';

export const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024;

const isJsonMediaType = (contentType: string | undefined): boolean => {
    if (!contentType) return false;
    const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
    return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
};

export const readJsonBody = async (
    request: IncomingMessage,
    maxBytes = DEFAULT_MAX_JSON_BODY_BYTES,
): Promise<unknown> => {
    if (!isJsonMediaType(request.headers['content-type'])) {
        throw new PublicHttpError(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'Command bodies must use application/json.',
        );
    }
    const declaredLength = Number(request.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new PublicHttpError(
            413,
            'REQUEST_BODY_TOO_LARGE',
            `The request body exceeds the ${maxBytes}-byte limit.`,
        );
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let settled = false;
        request.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > maxBytes) {
                if (!settled) {
                    settled = true;
                    reject(
                        new PublicHttpError(
                            413,
                            'REQUEST_BODY_TOO_LARGE',
                            `The request body exceeds the ${maxBytes}-byte limit.`,
                        ),
                    );
                }
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (settled) return;
            try {
                settled = true;
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                settled = true;
                reject(
                    new PublicHttpError(
                        400,
                        'MALFORMED_JSON',
                        'The request body is not valid JSON.',
                    ),
                );
            }
        });
        request.on('error', error => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
    });
};
