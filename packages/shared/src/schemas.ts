import { z } from 'zod';

export const DID_PATTERN = /^did:[a-z0-9]+:[a-z0-9._:%-]+$/i;

export const AT_URI_PATTERN = /^at:\/\/[^\s]+$/i;

export const AT_URI_RECORD_PATTERN = /^at:\/\/[\w:%.-]+\/[\w.-]+\/[\w.-]+$/i;

export const didSchema = z.string().regex(DID_PATTERN, 'Expected a valid DID');

export const atUriSchema = z
    .string()
    .regex(AT_URI_PATTERN, 'Expected a valid at:// URI');

export const atUriRecordSchema = z
    .string()
    .regex(AT_URI_RECORD_PATTERN, 'Expected a valid AT URI');

export const isoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * Allowed MIME types for attachments.
 */
export const ATTACHMENT_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

/** Maximum attachment size in bytes (10 MB). */
export const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum attachments per post. */
export const ATTACHMENT_MAX_PER_POST = 5;

export const attachmentModerationStatuses = [
    'pending',
    'approved',
    'rejected',
] as const;

export type AttachmentModerationStatus =
    (typeof attachmentModerationStatuses)[number];

export const attachmentSchema = z.object({
    id: z.string().min(1),
    postUri: atUriSchema,
    filename: z.string().min(1).max(255),
    mimeType: z.enum([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
    ]),
    sizeBytes: z.number().int().min(1).max(ATTACHMENT_MAX_SIZE_BYTES),
    url: z.string().url(),
    uploadedBy: didSchema,
    uploadedAt: isoDateTimeSchema,
    moderationStatus: z
        .enum(['pending', 'approved', 'rejected'])
        .default('pending'),
});

export type Attachment = z.infer<typeof attachmentSchema>;
