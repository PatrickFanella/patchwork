import { describe, expect, it, vi } from 'vitest';
import type { ModerationGateway } from './http/moderation-gateway.js';
import { createPublicSubmissionSafetyGate } from './public-submission-safety.js';

const gateway = (
    result: Awaited<ReturnType<ModerationGateway['reviewSubmission']>>,
): ModerationGateway => ({
    command: vi.fn(),
    readQueue: vi.fn(),
    reviewSubmission: vi.fn().mockResolvedValue(result),
});

const input = {
    actorDid: 'did:plc:alice',
    subjectUri: 'at://did:plc:alice/app.patchwork.aid.post/one',
    submissionType: 'aid-post' as const,
    operation: 'create' as const,
    record: { title: 'Meal delivery' },
    idempotencyKey: 'submission-one',
};

describe('public submission safety gate', () => {
    it('allows only an explicit accepted decision', async () => {
        const service = createPublicSubmissionSafetyGate(gateway({
            statusCode: 200,
            body: { review: { decision: 'accepted' } },
        }));
        await expect(service.review(input)).resolves.toBeUndefined();
    });

    it('returns the stable user-safe quarantine reason', async () => {
        const service = createPublicSubmissionSafetyGate(gateway({
            statusCode: 422,
            body: {
                review: {
                    decision: 'quarantined',
                    userReasonCode: 'SENSITIVE_DATA_REVIEW',
                    userMessage: 'The submission was held for safety review.',
                },
            },
        }));
        await expect(service.review(input)).rejects.toMatchObject({
            statusCode: 422,
            code: 'SENSITIVE_DATA_REVIEW',
            publicMessage: 'The submission was held for safety review.',
        });
    });

    it.each([
        ['transport failure', 'throw'],
        ['invalid success response', 'invalid'],
        ['provider error', 'provider'],
    ])('fails closed on %s', async (_label, mode) => {
        const service =
            mode === 'throw' ?
                createPublicSubmissionSafetyGate({
                    ...gateway({ statusCode: 200, body: {} }),
                    reviewSubmission: vi.fn().mockRejectedValue(new Error('offline')),
                })
            : mode === 'provider' ?
                createPublicSubmissionSafetyGate(gateway({
                    statusCode: 500,
                    body: { error: { code: 'AUTOMATION_FAILED' } },
                }))
            :   createPublicSubmissionSafetyGate(gateway({
                    statusCode: 200,
                    body: { review: { decision: 'quarantined' } },
                }));
        await expect(service.review(input)).rejects.toMatchObject({
            statusCode: 503,
            code: 'SUBMISSION_SAFETY_UNAVAILABLE',
        });
    });
});
