import { describe, expect, it } from 'vitest';
import {
    buildChatInitiationRequest,
    defaultChatLaunchState,
    defaultConversationViewModel,
    isChatInitiationAllowed,
    reduceConversationState,
    reduceChatLaunchState,
    toChatStatusNotice,
    toMessageStatusIndicator,
    toMessageViewModel,
    type ChatInitiationIntent,
    type MessageViewModel,
} from './chat-ux.js';

const mapIntent: ChatInitiationIntent = {
    aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-map',
    aidPostTitle: 'Need groceries',
    recipientDid: 'did:example:alice',
    initiatedFrom: 'map',
};

const feedIntent: ChatInitiationIntent = {
    aidPostUri: 'at://did:example:alice/app.patchwork.aid.post/post-feed',
    aidPostTitle: 'Need shelter',
    recipientDid: 'did:example:alice',
    initiatedFrom: 'feed',
};

describe('chat ux', () => {
    it('builds initiation payloads from map and feed entry surfaces', () => {
        const mapRequest = buildChatInitiationRequest(
            mapIntent,
            'did:example:helper',
        );
        const feedRequest = buildChatInitiationRequest(
            feedIntent,
            'did:example:helper',
        );

        expect(mapRequest.initiatedFrom).toBe('map');
        expect(feedRequest.initiatedFrom).toBe('feed');
        expect(mapRequest.recipientDid).toBe('did:example:alice');
    });

    it('enforces permission and identity gating for initiation', () => {
        expect(
            isChatInitiationAllowed({
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                hasPermission: true,
            }),
        ).toBe(true);

        expect(
            isChatInitiationAllowed({
                initiatedByDid: 'did:example:alice',
                recipientDid: 'did:example:alice',
                hasPermission: true,
            }),
        ).toBe(false);

        expect(
            isChatInitiationAllowed({
                initiatedByDid: 'did:example:helper',
                recipientDid: 'did:example:alice',
                hasPermission: false,
            }),
        ).toBe(false);
    });

    it('shows explicit fallback notice when recipient capability is missing', () => {
        const submitting = reduceChatLaunchState(defaultChatLaunchState, {
            type: 'submit',
            intent: mapIntent,
        });
        expect(submitting.status).toBe('submitting');

        const successWithFallback = reduceChatLaunchState(submitting, {
            type: 'success',
            intent: mapIntent,
            result: {
                conversationUri:
                    'at://did:example:alice/app.patchwork.conversation.meta/conv-1',
                created: true,
                transportPath: 'manual-fallback',
                fallbackNotice: {
                    code: 'RECIPIENT_CAPABILITY_MISSING',
                    message:
                        'Recipient cannot receive AT-native chat yet. We will use a safe fallback handoff path.',
                    safeForUser: true,
                    transportPath: 'manual-fallback',
                },
            },
        });

        const notice = toChatStatusNotice(successWithFallback);
        expect(notice?.tone).toBe('warning');
        expect(notice?.message).toContain('safe fallback handoff path');
    });

    it('converts failure state into actionable danger notice', () => {
        const failure = reduceChatLaunchState(defaultChatLaunchState, {
            type: 'failure',
            intent: feedIntent,
            errorMessage: 'Unauthorized initiation. Please verify participant access.',
        });

        const notice = toChatStatusNotice(failure);
        expect(notice?.tone).toBe('danger');
        expect(notice?.message).toContain('Unauthorized initiation');
    });
});

// ---------------------------------------------------------------------------
// Issue #122: Conversation UX tests
// ---------------------------------------------------------------------------

const makeMessage = (overrides?: Partial<MessageViewModel>): MessageViewModel => ({
    messageId: 'msg-1',
    senderDid: 'did:example:alice',
    text: 'Hello',
    status: 'sent',
    createdAt: new Date().toISOString(),
    canRetry: false,
    canModerate: true,
    retryCount: 0,
    ...overrides,
});

describe('message view model', () => {
    it('builds view model from raw message data', () => {
        const vm = toMessageViewModel({
            messageId: 'msg-1',
            senderDid: 'did:example:alice',
            text: 'Hi there',
            status: 'sent',
            createdAt: new Date().toISOString(),
            retryCount: 0,
        });

        expect(vm.canRetry).toBe(false);
        expect(vm.canModerate).toBe(true);
    });

    it('marks failed messages as retryable', () => {
        const vm = toMessageViewModel({
            messageId: 'msg-2',
            senderDid: 'did:example:alice',
            text: 'Failed msg',
            status: 'failed',
            createdAt: new Date().toISOString(),
            retryCount: 1,
            failureReason: 'Network error',
        });

        expect(vm.canRetry).toBe(true);
        expect(vm.canModerate).toBe(false);
        expect(vm.failureReason).toBe('Network error');
    });

    it('marks sending messages as non-moderatable', () => {
        const vm = toMessageViewModel({
            messageId: 'msg-3',
            senderDid: 'did:example:alice',
            text: 'Sending...',
            status: 'sending',
            createdAt: new Date().toISOString(),
            retryCount: 0,
        });

        expect(vm.canRetry).toBe(false);
        expect(vm.canModerate).toBe(false);
    });
});

describe('message status indicator', () => {
    it('returns clock icon for sending', () => {
        const indicator = toMessageStatusIndicator('sending');
        expect(indicator.icon).toBe('clock');
        expect(indicator.tone).toBe('neutral');
    });

    it('returns check icon for sent', () => {
        const indicator = toMessageStatusIndicator('sent');
        expect(indicator.icon).toBe('check');
    });

    it('returns double-check for delivered', () => {
        const indicator = toMessageStatusIndicator('delivered');
        expect(indicator.icon).toBe('double-check');
        expect(indicator.tone).toBe('success');
    });

    it('returns eye icon for read', () => {
        const indicator = toMessageStatusIndicator('read');
        expect(indicator.icon).toBe('eye');
        expect(indicator.tone).toBe('success');
    });

    it('returns x-circle icon for failed', () => {
        const indicator = toMessageStatusIndicator('failed');
        expect(indicator.icon).toBe('x-circle');
        expect(indicator.tone).toBe('danger');
    });
});

describe('conversation state reducer', () => {
    it('loads initial page of messages', () => {
        const messages = [
            makeMessage({ messageId: 'msg-1', text: 'First' }),
            makeMessage({ messageId: 'msg-2', text: 'Second' }),
        ];
        const next = reduceConversationState(defaultConversationViewModel, {
            type: 'load-page',
            messages,
            nextCursor: '2',
            hasMore: true,
            total: 5,
        });

        expect(next.messages).toHaveLength(2);
        expect(next.hasMore).toBe(true);
        expect(next.nextCursor).toBe('2');
        expect(next.total).toBe(5);
    });

    it('sets loading state on load-more-start', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [makeMessage()],
        };
        const next = reduceConversationState(vm, {
            type: 'load-more-start',
        });
        expect(next.isLoadingMore).toBe(true);
    });

    it('appends messages on load-more-complete', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [makeMessage({ messageId: 'msg-1' })],
            isLoadingMore: true,
        };
        const next = reduceConversationState(vm, {
            type: 'load-more-complete',
            messages: [makeMessage({ messageId: 'msg-2', text: 'More' })],
            hasMore: false,
        });

        expect(next.messages).toHaveLength(2);
        expect(next.isLoadingMore).toBe(false);
        expect(next.hasMore).toBe(false);
    });

    it('updates individual message status', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [
                makeMessage({ messageId: 'msg-1', status: 'sent' }),
                makeMessage({ messageId: 'msg-2', status: 'sent' }),
            ],
        };
        const next = reduceConversationState(vm, {
            type: 'message-status-changed',
            messageId: 'msg-1',
            status: 'delivered',
        });

        expect(next.messages[0]?.status).toBe('delivered');
        expect(next.messages[1]?.status).toBe('sent');
    });

    it('updates message to failed with reason', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [makeMessage({ messageId: 'msg-1', status: 'sent' })],
        };
        const next = reduceConversationState(vm, {
            type: 'message-status-changed',
            messageId: 'msg-1',
            status: 'failed',
            failureReason: 'Timeout',
        });

        expect(next.messages[0]?.status).toBe('failed');
        expect(next.messages[0]?.canRetry).toBe(true);
        expect(next.messages[0]?.failureReason).toBe('Timeout');
    });

    it('handles message retry success', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [
                makeMessage({
                    messageId: 'msg-1',
                    status: 'failed',
                    canRetry: true,
                    retryCount: 0,
                }),
            ],
        };
        const next = reduceConversationState(vm, {
            type: 'message-retry-success',
            messageId: 'msg-1',
            status: 'sent',
        });

        expect(next.messages[0]?.status).toBe('sent');
        expect(next.messages[0]?.canRetry).toBe(false);
        expect(next.messages[0]?.retryCount).toBe(1);
    });

    it('appends new message at the end', () => {
        const vm = {
            ...defaultConversationViewModel,
            messages: [makeMessage({ messageId: 'msg-1' })],
            total: 1,
        };
        const next = reduceConversationState(vm, {
            type: 'new-message',
            message: makeMessage({ messageId: 'msg-2', text: 'New!' }),
        });

        expect(next.messages).toHaveLength(2);
        expect(next.messages[1]?.text).toBe('New!');
        expect(next.total).toBe(2);
    });
});
