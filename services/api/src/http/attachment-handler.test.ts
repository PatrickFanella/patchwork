import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { AttachmentService } from '../attachment-service.js';
import { createAttachmentHandler } from './attachment-handler.js';

describe('private attachment HTTP boundary', () => {
    let origin: string;
    const attachmentId = '11111111-1111-4111-8111-111111111111';
    const authorizeUpload = vi.fn();
    const completeUpload = vi.fn();
    const listMine = vi.fn();
    const issueAccess = vi.fn();
    const readSigned = vi.fn();
    const review = vi.fn();
    const service = {
        authorizeUpload,
        completeUpload,
        listMine,
        issueAccess,
        readSigned,
        review,
    } as unknown as AttachmentService;
    const handler = createAttachmentHandler({
        service,
        authenticate: async request => {
            const role =
                request.headers['x-test-role'] === 'admin' ?
                    'admin' as const
                :   'user' as const;
            const did =
                role === 'admin' ?
                    'did:plc:attachment-reviewer'
                :   'did:plc:attachment-owner';
            return {
                sessionToken: 'opaque',
                session: { did },
                principal: {
                    did,
                    role,
                    authorization: createAuthorizationContext(did, role),
                },
            };
        },
    });
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (
                !handler(
                    request,
                    response,
                    new URL(request.url ?? '/', 'http://localhost'),
                )
            ) {
                response.writeHead(404).end();
            }
        });
        await new Promise<void>(resolve =>
            server.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('server did not bind');
        }
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('derives upload ownership from authentication and disables caches', async () => {
        const body = {
            filename: 'evidence.png',
            declaredMime: 'image/png',
            byteSize: 8,
            purpose: 'verification-evidence',
            subjectRef: null,
            actorDid: 'did:plc:hostile-browser',
        };
        authorizeUpload.mockResolvedValueOnce({
            attachment: { id: attachmentId, status: 'authorized' },
            upload: { token: 'private-upload-token' },
        });

        const response = await fetch(`${origin}/attachments/uploads`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });

        expect(response.status).toBe(201);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(authorizeUpload).toHaveBeenCalledWith(
            'did:plc:attachment-owner',
            body,
        );
    });

    it('accepts a bounded binary body without putting the upload token in the URL', async () => {
        const body = Buffer.from('png-body');
        completeUpload.mockResolvedValueOnce({
            attachment: { id: attachmentId, status: 'uploaded' },
        });

        const response = await fetch(
            `${origin}/attachments/uploads/${attachmentId}`,
            {
                method: 'PUT',
                headers: {
                    'content-type': 'image/png',
                    'content-length': String(body.length),
                    'x-patchwork-upload-token': 'private-upload-token',
                },
                body,
            },
        );

        expect(response.status).toBe(200);
        expect(completeUpload).toHaveBeenCalledWith(
            'did:plc:attachment-owner',
            {
                attachmentId,
                uploadToken: 'private-upload-token',
            },
            body,
            'image/png',
        );
    });

    it('keeps review actions capability-gated', async () => {
        const command = {
            attachmentId,
            action: 'quarantine',
            reason: 'Manual review.',
        };
        const denied = await fetch(`${origin}/attachments/review`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(command),
        });
        expect(denied.status).toBe(403);
        expect(review).not.toHaveBeenCalled();

        review.mockResolvedValueOnce({
            attachment: { id: attachmentId, status: 'quarantined' },
        });
        const allowed = await fetch(`${origin}/attachments/review`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-test-role': 'admin',
            },
            body: JSON.stringify(command),
        });
        expect(allowed.status).toBe(200);
        expect(review).toHaveBeenCalledWith(
            'did:plc:attachment-reviewer',
            command,
        );
    });

    it('serves only authenticated signed content with defensive headers', async () => {
        readSigned.mockResolvedValueOnce({
            filename: 'safe.pdf',
            contentType: 'application/pdf',
            body: Buffer.from('%PDF-safe'),
        });

        const response = await fetch(
            `${origin}/attachments/content/${attachmentId}?expires=123&signature=opaque`,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe(
            'private, no-store',
        );
        expect(response.headers.get('x-content-type-options')).toBe(
            'nosniff',
        );
        expect(response.headers.get('content-disposition')).toBe(
            'attachment; filename="safe.pdf"',
        );
        expect(readSigned).toHaveBeenCalledWith(
            'did:plc:attachment-owner',
            attachmentId,
            '123',
            'opaque',
            false,
        );
    });

    it('rejects oversized content lengths before storage', async () => {
        const oversized = await fetch(
            `${origin}/attachments/uploads/${attachmentId}`,
            {
                method: 'PUT',
                headers: {
                    'content-type': 'image/png',
                    'x-patchwork-upload-token': 'token',
                },
                body: Buffer.alloc(10 * 1024 * 1024 + 1),
            },
        );
        expect(oversized.status).toBe(413);
        expect(completeUpload).toHaveBeenCalledTimes(1);
    });
});
