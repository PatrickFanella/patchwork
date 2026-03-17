import { describe, expect, it } from 'vitest';
import { createFixtureChatService } from './chat-service.js';

const CONVO_URI =
    'at://did:example:alice/app.patchwork.conversation.meta/conv-test1';

describe('ApiChatService - message features (Issue #122)', () => {
    describe('POST /chat/message/send', () => {
        it('sends a message and returns it with sent status', () => {
            const service = createFixtureChatService();
            const result = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Hello, can I help?',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                message: {
                    messageId: string;
                    status: string;
                    text: string;
                    senderDid: string;
                    sequenceNumber: number;
                };
            };
            expect(body.message.status).toBe('sent');
            expect(body.message.text).toBe('Hello, can I help?');
            expect(body.message.senderDid).toBe('did:example:alice');
            expect(body.message.sequenceNumber).toBeGreaterThan(0);
        });

        it('returns 400 when required fields are missing', () => {
            const service = createFixtureChatService();
            const result = service.sendMessageFromParams(
                new URLSearchParams({ conversationUri: CONVO_URI }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('assigns sequential sequence numbers', () => {
            const service = createFixtureChatService();
            const r1 = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'First',
                }),
            );
            const r2 = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:bob',
                    text: 'Second',
                }),
            );

            const b1 = r1.body as { message: { sequenceNumber: number } };
            const b2 = r2.body as { message: { sequenceNumber: number } };
            expect(b2.message.sequenceNumber).toBeGreaterThan(
                b1.message.sequenceNumber,
            );
        });
    });

    describe('PUT /chat/message/status', () => {
        it('updates message status to delivered', () => {
            const service = createFixtureChatService();
            const sendResult = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Test message',
                }),
            );
            const messageId = (
                sendResult.body as { message: { messageId: string } }
            ).message.messageId;

            const updateResult = service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId,
                    status: 'delivered',
                }),
            );

            expect(updateResult.statusCode).toBe(200);
            const body = updateResult.body as {
                message: { status: string };
            };
            expect(body.message.status).toBe('delivered');
        });

        it('updates message status to read', () => {
            const service = createFixtureChatService();
            const sendResult = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Read test',
                }),
            );
            const messageId = (
                sendResult.body as { message: { messageId: string } }
            ).message.messageId;

            const updateResult = service.updateMessageStatusFromParams(
                new URLSearchParams({ messageId, status: 'read' }),
            );

            expect(updateResult.statusCode).toBe(200);
            const body = updateResult.body as {
                message: { status: string };
            };
            expect(body.message.status).toBe('read');
        });

        it('marks message as failed with failure reason', () => {
            const service = createFixtureChatService();
            const sendResult = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Will fail',
                }),
            );
            const messageId = (
                sendResult.body as { message: { messageId: string } }
            ).message.messageId;

            const updateResult = service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId,
                    status: 'failed',
                    failureReason: 'Network timeout',
                }),
            );

            expect(updateResult.statusCode).toBe(200);
            const body = updateResult.body as {
                message: { status: string; failureReason: string };
            };
            expect(body.message.status).toBe('failed');
            expect(body.message.failureReason).toBe('Network timeout');
        });

        it('returns 400 for invalid status', () => {
            const service = createFixtureChatService();
            const result = service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId: 'msg-nonexistent',
                    status: 'invalid-status',
                }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('returns 404 for nonexistent message', () => {
            const service = createFixtureChatService();
            const result = service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId: 'msg-nonexistent',
                    status: 'delivered',
                }),
            );
            expect(result.statusCode).toBe(404);
        });
    });

    describe('GET /chat/messages (paginated history)', () => {
        it('returns empty history for new conversation', () => {
            const service = createFixtureChatService();
            const result = service.getConversationHistoryFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                messages: unknown[];
                total: number;
                hasMore: boolean;
            };
            expect(body.messages).toHaveLength(0);
            expect(body.total).toBe(0);
            expect(body.hasMore).toBe(false);
        });

        it('returns messages in deterministic order', () => {
            const service = createFixtureChatService();

            service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'First',
                }),
            );
            service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:bob',
                    text: 'Second',
                }),
            );
            service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Third',
                }),
            );

            const result = service.getConversationHistoryFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                messages: Array<{
                    text: string;
                    sequenceNumber: number;
                }>;
                total: number;
            };
            expect(body.total).toBe(3);
            expect(body.messages[0]?.text).toBe('First');
            expect(body.messages[1]?.text).toBe('Second');
            expect(body.messages[2]?.text).toBe('Third');
            // Sequence numbers are strictly increasing
            expect(body.messages[1]!.sequenceNumber).toBeGreaterThan(
                body.messages[0]!.sequenceNumber,
            );
            expect(body.messages[2]!.sequenceNumber).toBeGreaterThan(
                body.messages[1]!.sequenceNumber,
            );
        });

        it('paginates using cursor', () => {
            const service = createFixtureChatService();

            for (let i = 1; i <= 5; i++) {
                service.sendMessageFromParams(
                    new URLSearchParams({
                        conversationUri: CONVO_URI,
                        senderDid: 'did:example:alice',
                        text: `Message ${i}`,
                    }),
                );
            }

            // First page: limit=2
            const page1 = service.getConversationHistoryFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    limit: '2',
                }),
            );

            expect(page1.statusCode).toBe(200);
            const body1 = page1.body as {
                messages: Array<{ text: string }>;
                nextCursor: string;
                hasMore: boolean;
                total: number;
            };
            expect(body1.messages).toHaveLength(2);
            expect(body1.hasMore).toBe(true);
            expect(body1.nextCursor).toBeDefined();
            expect(body1.total).toBe(5);

            // Second page
            const page2 = service.getConversationHistoryFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    limit: '2',
                    cursor: body1.nextCursor,
                }),
            );

            const body2 = page2.body as {
                messages: Array<{ text: string }>;
                nextCursor: string;
                hasMore: boolean;
            };
            expect(body2.messages).toHaveLength(2);
            expect(body2.hasMore).toBe(true);

            // Third page (last message)
            const page3 = service.getConversationHistoryFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    limit: '2',
                    cursor: body2.nextCursor,
                }),
            );

            const body3 = page3.body as {
                messages: Array<{ text: string }>;
                hasMore: boolean;
            };
            expect(body3.messages).toHaveLength(1);
            expect(body3.hasMore).toBe(false);
        });

        it('isolates messages by conversation', () => {
            const service = createFixtureChatService();
            const convo2 =
                'at://did:example:bob/app.patchwork.conversation.meta/conv-test2';

            service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'In convo 1',
                }),
            );
            service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: convo2,
                    senderDid: 'did:example:bob',
                    text: 'In convo 2',
                }),
            );

            const result1 = service.getConversationHistoryFromParams(
                new URLSearchParams({ conversationUri: CONVO_URI }),
            );
            const result2 = service.getConversationHistoryFromParams(
                new URLSearchParams({ conversationUri: convo2 }),
            );

            const body1 = result1.body as { total: number };
            const body2 = result2.body as { total: number };
            expect(body1.total).toBe(1);
            expect(body2.total).toBe(1);
        });
    });

    describe('POST /chat/message/retry', () => {
        it('retries a failed message successfully', () => {
            const service = createFixtureChatService();

            // Send a message
            const sendResult = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Will fail then retry',
                }),
            );
            const messageId = (
                sendResult.body as { message: { messageId: string } }
            ).message.messageId;

            // Mark it as failed
            service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId,
                    status: 'failed',
                    failureReason: 'Timeout',
                }),
            );

            // Retry
            const retryResult = service.retryMessageFromParams(
                new URLSearchParams({ messageId }),
            );

            expect(retryResult.statusCode).toBe(200);
            const body = retryResult.body as {
                message: {
                    status: string;
                    retryCount: number;
                    failureReason: undefined;
                };
                retried: boolean;
            };
            expect(body.retried).toBe(true);
            expect(body.message.status).toBe('sent');
            expect(body.message.retryCount).toBe(1);
            expect(body.message.failureReason).toBeUndefined();
        });

        it('returns 400 when trying to retry a non-failed message', () => {
            const service = createFixtureChatService();

            const sendResult = service.sendMessageFromParams(
                new URLSearchParams({
                    conversationUri: CONVO_URI,
                    senderDid: 'did:example:alice',
                    text: 'Already sent',
                }),
            );
            const messageId = (
                sendResult.body as { message: { messageId: string } }
            ).message.messageId;

            const retryResult = service.retryMessageFromParams(
                new URLSearchParams({ messageId }),
            );
            expect(retryResult.statusCode).toBe(400);
        });

        it('returns 400 for nonexistent message', () => {
            const service = createFixtureChatService();
            const result = service.retryMessageFromParams(
                new URLSearchParams({ messageId: 'msg-nonexistent' }),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    describe('full message lifecycle', () => {
        it('send -> deliver -> read maintains deterministic order', () => {
            const service = createFixtureChatService();

            // Send 3 messages
            const ids: string[] = [];
            for (let i = 0; i < 3; i++) {
                const result = service.sendMessageFromParams(
                    new URLSearchParams({
                        conversationUri: CONVO_URI,
                        senderDid: 'did:example:alice',
                        text: `Message ${i}`,
                    }),
                );
                ids.push(
                    (result.body as { message: { messageId: string } })
                        .message.messageId,
                );
            }

            // Mark first as delivered, second as read
            service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId: ids[0]!,
                    status: 'delivered',
                }),
            );
            service.updateMessageStatusFromParams(
                new URLSearchParams({
                    messageId: ids[1]!,
                    status: 'read',
                }),
            );

            // Fetch history and verify ordering is preserved
            const history = service.getConversationHistoryFromParams(
                new URLSearchParams({ conversationUri: CONVO_URI }),
            );

            const body = history.body as {
                messages: Array<{ status: string; text: string }>;
            };
            expect(body.messages).toHaveLength(3);
            expect(body.messages[0]?.status).toBe('delivered');
            expect(body.messages[1]?.status).toBe('read');
            expect(body.messages[2]?.status).toBe('sent');
        });
    });
});
