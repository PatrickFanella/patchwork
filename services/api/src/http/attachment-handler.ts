import type { IncomingMessage, ServerResponse } from 'node:http';
import { ATTACHMENT_MAX_SIZE_BYTES } from '@patchwork/shared';
import {
    AuthorizationError,
    requireCapability,
} from '../authorization-guard.js';
import type { AttachmentService } from '../attachment-service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { readJsonBody } from './json-body.js';
import {
    PublicHttpError,
    writeJsonResponse,
    writePublicError,
} from './error-response.js';

const attachmentPath =
    /^\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const uploadPath =
    /^\/attachments\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const contentPath =
    /^\/attachments\/content\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export const isAttachmentRoute = (
    request: IncomingMessage,
    requestUrl: URL,
): boolean =>
    (request.method === 'GET' && requestUrl.pathname === '/attachments') ||
    (request.method === 'POST' &&
        [
            '/attachments/uploads',
            '/attachments/access',
            '/attachments/review',
        ].includes(requestUrl.pathname)) ||
    (request.method === 'PUT' && uploadPath.test(requestUrl.pathname)) ||
    (request.method === 'DELETE' &&
        attachmentPath.test(requestUrl.pathname)) ||
    (request.method === 'GET' && contentPath.test(requestUrl.pathname));

const readAttachmentBody = async (
    request: IncomingMessage,
): Promise<Buffer> => {
    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (
        !Number.isInteger(declaredLength) ||
        declaredLength < 1 ||
        declaredLength > ATTACHMENT_MAX_SIZE_BYTES
    ) {
        throw new PublicHttpError(
            413,
            'ATTACHMENT_SIZE_INVALID',
            'The attachment must be between one byte and 10 MB.',
        );
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > ATTACHMENT_MAX_SIZE_BYTES) {
            request.destroy();
            throw new PublicHttpError(
                413,
                'ATTACHMENT_TOO_LARGE',
                'The attachment exceeds the 10 MB limit.',
            );
        }
        chunks.push(buffer);
    }
    if (total !== declaredLength) {
        throw new PublicHttpError(
            400,
            'ATTACHMENT_LENGTH_MISMATCH',
            'The attachment body length is invalid.',
        );
    }
    return Buffer.concat(chunks, total);
};

const canReviewAttachments = (
    authenticated: AuthenticatedRequest,
): boolean => {
    try {
        requireCapability(
            authenticated.principal.authorization,
            'attachment:review',
        );
        return true;
    } catch {
        return false;
    }
};

export const createAttachmentHandler = (dependencies: {
    service: AttachmentService;
    authenticate(
        request: IncomingMessage,
    ): Promise<AuthenticatedRequest>;
}) => (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
): boolean => {
    if (!isAttachmentRoute(request, requestUrl)) return false;
    void (async () => {
        try {
            response.setHeader('cache-control', 'no-store');
            const authenticated = await dependencies.authenticate(request);
            const actorDid = authenticated.principal.did;
            const canReview = canReviewAttachments(authenticated);
            const contentMatch = contentPath.exec(requestUrl.pathname);
            if (request.method === 'GET' && contentMatch?.[1]) {
                const content = await dependencies.service.readSigned(
                    actorDid,
                    contentMatch[1],
                    requestUrl.searchParams.get('expires') ?? '',
                    requestUrl.searchParams.get('signature') ?? '',
                    canReview,
                );
                const filename = content.filename.replaceAll(
                    /["\r\n]/g,
                    '_',
                );
                response.writeHead(200, {
                    'content-type': content.contentType,
                    'content-length': String(content.body.length),
                    'content-disposition':
                        `attachment; filename="${filename}"`,
                    'cache-control': 'private, no-store',
                    'x-content-type-options': 'nosniff',
                });
                response.end(content.body);
                return;
            }
            if (
                request.method === 'GET' &&
                requestUrl.pathname === '/attachments'
            ) {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.listMine(actorDid),
                );
                return;
            }
            const uploadMatch = uploadPath.exec(requestUrl.pathname);
            if (request.method === 'PUT' && uploadMatch?.[1]) {
                const uploadToken =
                    request.headers['x-patchwork-upload-token'];
                const body = await readAttachmentBody(request);
                const result = await dependencies.service.completeUpload(
                    actorDid,
                    {
                        attachmentId: uploadMatch[1],
                        uploadToken:
                            typeof uploadToken === 'string' ?
                                uploadToken
                            :   '',
                    },
                    body,
                    request.headers['content-type'],
                );
                writeJsonResponse(response, 200, result);
                return;
            }
            const deleteMatch = attachmentPath.exec(
                requestUrl.pathname,
            );
            if (request.method === 'DELETE' && deleteMatch?.[1]) {
                writeJsonResponse(
                    response,
                    202,
                    await dependencies.service.deleteOwn(actorDid, {
                        attachmentId: deleteMatch[1],
                    }),
                );
                return;
            }
            const command = await readJsonBody(request);
            if (requestUrl.pathname === '/attachments/uploads') {
                writeJsonResponse(
                    response,
                    201,
                    await dependencies.service.authorizeUpload(
                        actorDid,
                        command,
                    ),
                );
                return;
            }
            if (requestUrl.pathname === '/attachments/access') {
                writeJsonResponse(
                    response,
                    200,
                    await dependencies.service.issueAccess(
                        actorDid,
                        command,
                        canReview,
                    ),
                );
                return;
            }
            requireCapability(
                authenticated.principal.authorization,
                'attachment:review',
            );
            writeJsonResponse(
                response,
                200,
                await dependencies.service.review(actorDid, command),
            );
        } catch (error) {
            if (error instanceof AuthorizationError) {
                writeJsonResponse(response, error.statusCode, {
                    error: {
                        code: error.code,
                        message:
                            'The required attachment review capability is missing.',
                    },
                });
                return;
            }
            writePublicError(response, error);
        }
    })();
    return true;
};
