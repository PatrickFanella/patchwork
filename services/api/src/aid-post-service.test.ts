import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryIndexStore } from '@patchwork/shared';

vi.mock('./db/discovery-events.js', () => ({
    createPostgresPool: vi.fn(),
    appendDiscoveryEvents: vi.fn(),
}));

import { ApiDiscoveryQueryService } from './query-service.js';
import {
    createAidPostService,
    createAttachmentService,
    type AttachmentSuccessResponse,
    type AttachmentListResponse,
    type AidPostErrorResponse,
    AttachmentService,
} from './aid-post-service.js';
import {
    appendDiscoveryEvents,
    createPostgresPool,
} from './db/discovery-events.js';

const buildCreateParams = () => {
    return new URLSearchParams({
        authorDid: 'did:example:resident-1',
        title: 'Need groceries for tonight',
        description: 'Requesting pantry support for two households.',
        category: 'food',
        urgency: 'high',
        latitude: '40.7128',
        longitude: '-74.0060',
        precisionKm: '0.5',
        now: '2026-02-28T12:00:00.000Z',
        rkey: 'post-test-001',
    });
};

describe('ApiAidPostService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates an aid post and makes it discoverable in feed queries', async () => {
        const queryService = new ApiDiscoveryQueryService(
            new DiscoveryIndexStore(),
        );
        const service = createAidPostService(queryService, {
            dataSource: 'fixture',
        });

        const createResult =
            await service.createFromParams(buildCreateParams());
        expect(createResult.statusCode).toBe(201);

        const feedResult = queryService.queryFeed(
            new URLSearchParams({
                latitude: '40.7128',
                longitude: '-74.0060',
                radiusKm: '20',
                status: 'open',
                page: '1',
                pageSize: '10',
            }),
        );

        expect(feedResult.statusCode).toBe(200);
        const body = feedResult.body as {
            results: Array<{ uri: string; title: string }>;
        };

        expect(
            body.results.some(item => item.uri.includes('/post-test-001')),
        ).toBe(true);
        expect(
            body.results.some(item => item.title.includes('groceries')),
        ).toBe(true);
    });

    it('returns 400 when required fields are missing', async () => {
        const queryService = new ApiDiscoveryQueryService(
            new DiscoveryIndexStore(),
        );
        const service = createAidPostService(queryService, {
            dataSource: 'fixture',
        });

        const createResult = await service.createFromParams(
            new URLSearchParams({
                title: 'Missing author and coordinates',
            }),
        );

        expect(createResult.statusCode).toBe(400);
        expect(
            (createResult.body as { error: { code: string } }).error.code,
        ).toBe('INVALID_QUERY');
    });

    it('persists normalized events to postgres in postgres mode', async () => {
        const queryService = new ApiDiscoveryQueryService(
            new DiscoveryIndexStore(),
        );
        const pool = { end: vi.fn() } as never;
        vi.mocked(appendDiscoveryEvents).mockResolvedValue(undefined);

        const service = createAidPostService(queryService, {
            dataSource: 'postgres',
            databaseUrl:
                'postgresql://patchwork:patchwork@localhost:5432/patchwork',
            pool,
        });

        const createResult =
            await service.createFromParams(buildCreateParams());

        expect(createResult.statusCode).toBe(201);
        expect(createPostgresPool).not.toHaveBeenCalled();
        expect(appendDiscoveryEvents).toHaveBeenCalledWith(
            pool,
            expect.anything(),
        );
        expect(appendDiscoveryEvents).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when postgres persistence fails and does not index record', async () => {
        const queryService = new ApiDiscoveryQueryService(
            new DiscoveryIndexStore(),
        );
        const pool = { end: vi.fn() } as never;
        vi.mocked(appendDiscoveryEvents).mockRejectedValue(
            new Error('insert failed'),
        );

        const service = createAidPostService(queryService, {
            dataSource: 'postgres',
            databaseUrl:
                'postgresql://patchwork:patchwork@localhost:5432/patchwork',
            pool,
        });

        const createResult =
            await service.createFromParams(buildCreateParams());

        expect(createResult.statusCode).toBe(500);

        const feedResult = queryService.queryFeed(
            new URLSearchParams({
                latitude: '40.7128',
                longitude: '-74.0060',
                radiusKm: '20',
                page: '1',
                pageSize: '10',
            }),
        );

        const body = feedResult.body as {
            results: Array<{ uri: string }>;
        };
        expect(
            body.results.some(item => item.uri.includes('/post-test-001')),
        ).toBe(false);
    });
});

const testPostUri = 'at://did:example:alice/app.patchwork.aid.post/post-001';
const uploaderDid = 'did:example:alice';
const attachmentNow = '2026-03-01T12:00:00.000Z';

const validAttachment = {
    postUri: testPostUri,
    filename: 'photo.jpg',
    mimeType: 'image/jpeg' as const,
    sizeBytes: 500_000,
    url: 'https://cdn.example.com/uploads/photo.jpg',
    uploadedBy: uploaderDid,
    now: attachmentNow,
};

describe('AttachmentService', () => {
    let service: AttachmentService;

    beforeEach(() => {
        service = createAttachmentService();
    });

    describe('addAttachment', () => {
        it('adds a valid attachment to a post', async () => {
            const result = await service.addAttachment(validAttachment);

            expect(result.statusCode).toBe(201);
            const body = result.body as AttachmentSuccessResponse;
            expect(body.attachment.filename).toBe('photo.jpg');
            expect(body.attachment.mimeType).toBe('image/jpeg');
            expect(body.attachment.postUri).toBe(testPostUri);
            expect(body.attachment.id).toMatch(/^att-/);
        });

        it('auto-approves non-flagged attachments via moderation scan', async () => {
            const result = await service.addAttachment(validAttachment);
            const body = result.body as AttachmentSuccessResponse;
            expect(body.attachment.moderationStatus).toBe('approved');
        });

        it('rejects flagged attachments via moderation scan', async () => {
            const result = await service.addAttachment({
                ...validAttachment,
                filename: 'flagged-content.jpg',
            });

            expect(result.statusCode).toBe(201);
            const body = result.body as AttachmentSuccessResponse;
            expect(body.attachment.moderationStatus).toBe('rejected');
        });

        it('rejects unsupported MIME types', async () => {
            const result = await service.addAttachment({
                ...validAttachment,
                mimeType: 'application/zip',
            });

            expect(result.statusCode).toBe(400);
        });

        it('rejects oversized files', async () => {
            const result = await service.addAttachment({
                ...validAttachment,
                sizeBytes: 20 * 1024 * 1024, // 20 MB
            });

            expect(result.statusCode).toBe(400);
        });

        it('enforces max attachments per post', async () => {
            for (let i = 0; i < 5; i++) {
                const result = await service.addAttachment({
                    ...validAttachment,
                    filename: `photo-${i}.jpg`,
                });
                expect(result.statusCode).toBe(201);
            }

            // 6th attachment should fail
            const result = await service.addAttachment({
                ...validAttachment,
                filename: 'photo-extra.jpg',
            });

            expect(result.statusCode).toBe(400);
            const body = result.body as AidPostErrorResponse;
            expect(body.error.code).toBe('ATTACHMENT_LIMIT_EXCEEDED');
        });

        it('accepts PDF files', async () => {
            const result = await service.addAttachment({
                ...validAttachment,
                filename: 'receipt.pdf',
                mimeType: 'application/pdf',
            });

            expect(result.statusCode).toBe(201);
            const body = result.body as AttachmentSuccessResponse;
            expect(body.attachment.mimeType).toBe('application/pdf');
        });
    });

    describe('getAttachments', () => {
        it('returns empty list for a post with no attachments', () => {
            const result = service.getAttachments(testPostUri);
            expect(result.statusCode).toBe(200);
            const body = result.body as AttachmentListResponse;
            expect(body.attachments).toEqual([]);
            expect(body.total).toBe(0);
        });

        it('returns all attachments for a post', async () => {
            await service.addAttachment(validAttachment);
            await service.addAttachment({
                ...validAttachment,
                filename: 'receipt.pdf',
                mimeType: 'application/pdf',
            });

            const result = service.getAttachments(testPostUri);
            const body = result.body as AttachmentListResponse;
            expect(body.attachments).toHaveLength(2);
            expect(body.total).toBe(2);
        });
    });

    describe('getAttachmentsFromParams', () => {
        it('queries from URL search params', async () => {
            await service.addAttachment(validAttachment);

            const result = service.getAttachmentsFromParams(
                new URLSearchParams({ postUri: testPostUri }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as AttachmentListResponse;
            expect(body.attachments).toHaveLength(1);
        });

        it('returns 400 when postUri is missing', () => {
            const result = service.getAttachmentsFromParams(
                new URLSearchParams({}),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    describe('updateModerationStatus', () => {
        it('updates moderation status of an attachment', async () => {
            const addResult = await service.addAttachment(validAttachment);
            const attachment = (addResult.body as AttachmentSuccessResponse)
                .attachment;

            const updateResult = service.updateModerationStatus(
                attachment.id,
                'rejected',
            );

            expect(updateResult).toBeDefined();
            expect(updateResult!.statusCode).toBe(200);
            const body = updateResult!.body as AttachmentSuccessResponse;
            expect(body.attachment.moderationStatus).toBe('rejected');
        });

        it('returns undefined for unknown attachment id', () => {
            const result = service.updateModerationStatus(
                'att-nonexistent',
                'approved',
            );
            expect(result).toBeUndefined();
        });
    });
});
