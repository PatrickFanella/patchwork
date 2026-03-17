import { describe, expect, it } from 'vitest';
import { createFixtureChatService } from './chat-service.js';

describe('api phase 7 anti-spam + moderation signal hardening', () => {
    it('blocks repeated duplicate chat payloads and emits suspicious pattern signal', () => {
        const service = createFixtureChatService();

        for (let index = 0; index < 5; index += 1) {
            service.evaluateSafetyFromParams(
                new URLSearchParams({
                    senderDid: 'did:example:spammer',
                    recipientDid: 'did:example:target',
                    conversationUri:
                        'at://did:example:target/app.patchwork.conversation.meta/conv-spam',
                    message: 'buy now buy now',
                    sentAt: `2026-02-27T04:00:0${index}.000Z`,
                }),
            );
        }

        const drained = service.drainModerationSignals();
        expect(drained.statusCode).toBe(200);
        expect(drained.body).toMatchObject({
            total: 1,
        });

        const metrics = service.safetyMetrics();
        expect(metrics.statusCode).toBe(200);
        expect(metrics.body).toMatchObject({
            metrics: {
                evaluated: 5,
                duplicateBlocked: 3,
                suspiciousSignals: 1,
            },
        });
    });

    it('reports duplicate-block response code once duplicate threshold is exceeded', () => {
        const service = createFixtureChatService();

        service.evaluateSafetyFromParams(
            new URLSearchParams({
                senderDid: 'did:example:sender',
                recipientDid: 'did:example:target',
                conversationUri:
                    'at://did:example:target/app.patchwork.conversation.meta/conv-dupe',
                message: 'same payload',
                sentAt: '2026-02-27T04:05:00.000Z',
            }),
        );
        service.evaluateSafetyFromParams(
            new URLSearchParams({
                senderDid: 'did:example:sender',
                recipientDid: 'did:example:target',
                conversationUri:
                    'at://did:example:target/app.patchwork.conversation.meta/conv-dupe',
                message: 'same payload',
                sentAt: '2026-02-27T04:05:01.000Z',
            }),
        );

        const third = service.evaluateSafetyFromParams(
            new URLSearchParams({
                senderDid: 'did:example:sender',
                recipientDid: 'did:example:target',
                conversationUri:
                    'at://did:example:target/app.patchwork.conversation.meta/conv-dupe',
                message: 'same payload',
                sentAt: '2026-02-27T04:05:02.000Z',
            }),
        );

        expect(third.statusCode).toBe(200);
        expect(third.body).toMatchObject({
            allowed: false,
            code: 'DUPLICATE_BLOCKED',
        });
    });
});
