export type ChatEntrySurface = 'map' | 'feed' | 'detail';

export interface ChatInitiationIntent {
    aidPostUri: string;
    aidPostTitle: string;
    recipientDid: string;
    initiatedFrom: ChatEntrySurface;
}

export interface ChatInitiationRequest {
    aidPostUri: string;
    initiatedByDid: string;
    recipientDid: string;
    initiatedFrom: ChatEntrySurface;
}

export interface ChatFallbackNotice {
    code: 'RECIPIENT_CAPABILITY_MISSING';
    message: string;
    safeForUser: true;
    transportPath: 'resource-fallback' | 'manual-fallback';
}

export interface ChatLaunchSuccess {
    conversationUri: string;
    created: boolean;
    transportPath: 'atproto-direct' | 'resource-fallback' | 'manual-fallback';
    fallbackNotice?: ChatFallbackNotice;
}

export interface ChatLaunchState {
    status: 'idle' | 'submitting' | 'success' | 'error';
    surface?: ChatEntrySurface;
    conversationUri?: string;
    fallbackNotice?: ChatFallbackNotice;
    errorMessage?: string;
}

export type ChatLaunchEvent =
    | {
          type: 'submit';
          intent: ChatInitiationIntent;
      }
    | {
          type: 'success';
          intent: ChatInitiationIntent;
          result: ChatLaunchSuccess;
      }
    | {
          type: 'failure';
          intent: ChatInitiationIntent;
          errorMessage: string;
      }
    | {
          type: 'reset';
      };

export const defaultChatLaunchState: Readonly<ChatLaunchState> = Object.freeze({
    status: 'idle' as const,
});

export const buildChatInitiationRequest = (
    intent: ChatInitiationIntent,
    initiatedByDid: string,
): ChatInitiationRequest => {
    return {
        aidPostUri: intent.aidPostUri,
        initiatedByDid,
        recipientDid: intent.recipientDid,
        initiatedFrom: intent.initiatedFrom,
    };
};

export const isChatInitiationAllowed = (input: {
    initiatedByDid: string;
    recipientDid: string;
    hasPermission: boolean;
}): boolean => {
    if (!input.hasPermission) {
        return false;
    }

    return input.initiatedByDid !== input.recipientDid;
};

export const reduceChatLaunchState = (
    _current: ChatLaunchState,
    event: ChatLaunchEvent,
): ChatLaunchState => {
    if (event.type === 'reset') {
        return { ...defaultChatLaunchState };
    }

    if (event.type === 'submit') {
        return {
            status: 'submitting',
            surface: event.intent.initiatedFrom,
        };
    }

    if (event.type === 'success') {
        return {
            status: 'success',
            surface: event.intent.initiatedFrom,
            conversationUri: event.result.conversationUri,
            fallbackNotice: event.result.fallbackNotice,
        };
    }

    return {
        status: 'error',
        surface: event.intent.initiatedFrom,
        errorMessage: event.errorMessage,
    };
};

// ---------------------------------------------------------------------------
// Message state view model (Issue #122)
// ---------------------------------------------------------------------------

export type MessageStatusDisplay =
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed';

export interface MessageViewModel {
    messageId: string;
    senderDid: string;
    text: string;
    status: MessageStatusDisplay;
    createdAt: string;
    canRetry: boolean;
    canModerate: boolean;
    retryCount: number;
    failureReason?: string;
}

export const toMessageViewModel = (message: {
    messageId: string;
    senderDid: string;
    text: string;
    status: string;
    createdAt: string;
    retryCount: number;
    failureReason?: string;
}): MessageViewModel => ({
    messageId: message.messageId,
    senderDid: message.senderDid,
    text: message.text,
    status: message.status as MessageStatusDisplay,
    createdAt: message.createdAt,
    canRetry: message.status === 'failed',
    canModerate: message.status !== 'sending' && message.status !== 'failed',
    retryCount: message.retryCount,
    failureReason: message.failureReason,
});

// ---------------------------------------------------------------------------
// Conversation view model with pagination
// ---------------------------------------------------------------------------

export interface ConversationViewModel {
    conversationUri: string;
    messages: MessageViewModel[];
    nextCursor?: string;
    hasMore: boolean;
    isLoadingMore: boolean;
    total: number;
}

export const defaultConversationViewModel: Readonly<ConversationViewModel> =
    Object.freeze({
        conversationUri: '',
        messages: [],
        hasMore: false,
        isLoadingMore: false,
        total: 0,
    });

export type ConversationEvent =
    | { type: 'load-page'; messages: MessageViewModel[]; nextCursor?: string; hasMore: boolean; total: number }
    | { type: 'load-more-start' }
    | { type: 'load-more-complete'; messages: MessageViewModel[]; nextCursor?: string; hasMore: boolean }
    | { type: 'message-status-changed'; messageId: string; status: MessageStatusDisplay; failureReason?: string }
    | { type: 'message-retry-success'; messageId: string; status: MessageStatusDisplay }
    | { type: 'new-message'; message: MessageViewModel };

export const reduceConversationState = (
    current: ConversationViewModel,
    event: ConversationEvent,
): ConversationViewModel => {
    switch (event.type) {
        case 'load-page':
            return {
                ...current,
                messages: event.messages,
                nextCursor: event.nextCursor,
                hasMore: event.hasMore,
                total: event.total,
                isLoadingMore: false,
            };

        case 'load-more-start':
            return {
                ...current,
                isLoadingMore: true,
            };

        case 'load-more-complete':
            return {
                ...current,
                messages: [...current.messages, ...event.messages],
                nextCursor: event.nextCursor,
                hasMore: event.hasMore,
                isLoadingMore: false,
            };

        case 'message-status-changed':
            return {
                ...current,
                messages: current.messages.map(message =>
                    message.messageId === event.messageId
                        ? {
                              ...message,
                              status: event.status,
                              canRetry: event.status === 'failed',
                              canModerate:
                                  event.status !== 'sending' &&
                                  event.status !== 'failed',
                              failureReason: event.failureReason,
                          }
                        : message,
                ),
            };

        case 'message-retry-success':
            return {
                ...current,
                messages: current.messages.map(message =>
                    message.messageId === event.messageId
                        ? {
                              ...message,
                              status: event.status,
                              canRetry: false,
                              canModerate: true,
                              retryCount: message.retryCount + 1,
                              failureReason: undefined,
                          }
                        : message,
                ),
            };

        case 'new-message':
            return {
                ...current,
                messages: [...current.messages, event.message],
                total: current.total + 1,
            };
    }
};

// ---------------------------------------------------------------------------
// Message status indicator
// ---------------------------------------------------------------------------

export interface MessageStatusIndicator {
    icon: 'clock' | 'check' | 'double-check' | 'eye' | 'x-circle';
    label: string;
    tone: 'neutral' | 'success' | 'danger';
}

export const toMessageStatusIndicator = (
    status: MessageStatusDisplay,
): MessageStatusIndicator => {
    switch (status) {
        case 'sending':
            return { icon: 'clock', label: 'Sending...', tone: 'neutral' };
        case 'sent':
            return { icon: 'check', label: 'Sent', tone: 'neutral' };
        case 'delivered':
            return { icon: 'double-check', label: 'Delivered', tone: 'success' };
        case 'read':
            return { icon: 'eye', label: 'Read', tone: 'success' };
        case 'failed':
            return { icon: 'x-circle', label: 'Failed to send', tone: 'danger' };
    }
};

export interface ChatStatusNotice {
    tone: 'success' | 'warning' | 'danger';
    message: string;
}

export const toChatStatusNotice = (
    state: ChatLaunchState,
): ChatStatusNotice | undefined => {
    if (state.status === 'error' && state.errorMessage) {
        return {
            tone: 'danger',
            message: state.errorMessage,
        };
    }

    if (state.status === 'success' && state.fallbackNotice) {
        return {
            tone: 'warning',
            message: state.fallbackNotice.message,
        };
    }

    if (state.status === 'success' && state.conversationUri) {
        return {
            tone: 'success',
            message: `Chat ready: ${state.conversationUri}`,
        };
    }

    return undefined;
};
