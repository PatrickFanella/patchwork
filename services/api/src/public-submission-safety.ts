import { PublicHttpError } from './http/error-response.js';
import type { ModerationGateway } from './http/moderation-gateway.js';

export interface PublicSubmissionSafetyGate {
    review(input: {
        actorDid: string;
        subjectUri: string;
        submissionType:
            | 'aid-post'
            | 'directory-resource'
            | 'volunteer-profile';
        operation: 'create' | 'update';
        record: Record<string, unknown>;
        attachmentIds?: string[];
        idempotencyKey: string;
    }): Promise<void>;
}

export const createPublicSubmissionSafetyGate = (
    gateway: ModerationGateway,
): PublicSubmissionSafetyGate => ({
    review: async input => {
        let response;
        try {
            response = await gateway.reviewSubmission({
                actorDid: input.actorDid,
                body: input,
            });
        } catch {
            throw new PublicHttpError(
                503,
                'SUBMISSION_SAFETY_UNAVAILABLE',
                'Publication safety checks are unavailable. Nothing was published.',
            );
        }
        const body =
            response.body &&
            typeof response.body === 'object' &&
            !Array.isArray(response.body) ?
                response.body as Record<string, unknown>
            :   {};
        const review =
            body['review'] &&
            typeof body['review'] === 'object' &&
            !Array.isArray(body['review']) ?
                body['review'] as Record<string, unknown>
            :   {};
        if (response.statusCode === 200 && review['decision'] === 'accepted') {
            return;
        }
        if (response.statusCode === 422) {
            const code =
                typeof review['userReasonCode'] === 'string' ?
                    review['userReasonCode']
                :   'SUBMISSION_REVIEW_REQUIRED';
            const message =
                typeof review['userMessage'] === 'string' ?
                    review['userMessage']
                :   'The submission was held for safety review.';
            throw new PublicHttpError(422, code, message);
        }
        throw new PublicHttpError(
            503,
            'SUBMISSION_SAFETY_UNAVAILABLE',
            'Publication safety checks are unavailable. Nothing was published.',
        );
    },
});
