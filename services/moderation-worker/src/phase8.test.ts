import { describe, expect, it } from 'vitest';
import {
    CONTRACT_VERSION,
    MODERATION_LOG_RETENTION_DAYS,
    PHASE8_MODERATION_EVENT,
    redactLogData,
} from '@patchwork/shared';
import { createFixtureModerationWorkerService } from './moderation-service.js';

describe('P8.1 moderation worker contract test matrix', () => {
    describe('moderation queue contract compliance', () => {
        it('enqueues a subject matching the ModerationReviewRequestedEvent contract shape', () => {
            const service = createFixtureModerationWorkerService();
            const result = service.enqueueFromParams(
                new URLSearchParams({
                    subjectUri: PHASE8_MODERATION_EVENT.subjectUri,
                    reason: PHASE8_MODERATION_EVENT.reason,
                    requestedAt: PHASE8_MODERATION_EVENT.requestedAt,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                item: { subjectUri: string; reason: string };
            };
            expect(body.item.subjectUri).toBe(
                PHASE8_MODERATION_EVENT.subjectUri,
            );
        });

        it('applies policy actions following the contract-defined state machine', () => {
            const service = createFixtureModerationWorkerService();
            const subjectUri =
                'at://did:example:p8/app.patchwork.aid.post/p8-mod-post';

            service.enqueueFromParams(
                new URLSearchParams({
                    subjectUri,
                    reason: 'user-report:spam',
                    requestedAt: '2026-02-27T00:00:00.000Z',
                }),
            );

            const delisted = service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri,
                    actorDid: 'did:example:p8-mod',
                    action: 'delist',
                    reason: 'Duplicate spam content',
                    occurredAt: '2026-02-27T00:01:00.000Z',
                }),
            );

            expect(delisted.statusCode).toBe(200);

            const state = service.getStateFromParams(
                new URLSearchParams({ subjectUri }),
            );
            expect(state.statusCode).toBe(200);
            const stateBody = state.body as {
                item: { visibility: string };
            };
            expect(stateBody.item.visibility).toBe('delisted');
        });

        it('accumulates audit trail entries for each policy action', () => {
            const service = createFixtureModerationWorkerService();
            const subjectUri =
                'at://did:example:p8/app.patchwork.conversation.meta/p8-conv';

            service.enqueueFromParams(
                new URLSearchParams({
                    subjectUri,
                    reason: 'abuse-keyword:threat',
                    requestedAt: '2026-02-27T00:00:00.000Z',
                }),
            );

            service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri,
                    actorDid: 'did:example:p8-mod',
                    action: 'suspend-visibility',
                    reason: 'Threatening language',
                    occurredAt: '2026-02-27T00:01:00.000Z',
                }),
            );

            service.applyPolicyFromParams(
                new URLSearchParams({
                    subjectUri,
                    actorDid: 'did:example:p8-mod',
                    action: 'open-appeal',
                    reason: 'User filed appeal',
                    occurredAt: '2026-02-27T00:02:00.000Z',
                }),
            );

            const audit = service.listAuditFromParams(
                new URLSearchParams({ subjectUri }),
            );
            expect(audit.statusCode).toBe(200);
            const auditBody = audit.body as { total: number };
            expect(auditBody.total).toBe(2);
        });
    });

    describe('privacy constraints on moderation data', () => {
        it('log retention constant matches the documented 7-day policy', () => {
            expect(MODERATION_LOG_RETENTION_DAYS).toBe(7);
        });

        it('redacts DID and URI fields from moderation log payloads', () => {
            const logPayload = {
                reporterDid: 'did:example:p8-mod',
                subjectUri:
                    'at://did:example:p8-alice/app.patchwork.aid.post/p8-post-a',
                reason: 'spam',
                occurredAt: '2026-02-27T00:01:00.000Z',
            };

            const redacted = redactLogData(logPayload) as Record<
                string,
                unknown
            >;
            expect(redacted.reporterDid).toBe('did:[redacted]');
            expect(typeof redacted.subjectUri).toBe('string');
            expect(String(redacted.subjectUri)).not.toContain('p8-alice');
        });
    });

    describe('contract version', () => {
        it('CONTRACT_VERSION is defined and phase-tagged', () => {
            expect(CONTRACT_VERSION).toBeDefined();
            expect(CONTRACT_VERSION).toContain('phase');
        });
    });
});
