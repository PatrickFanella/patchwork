import { ZodError } from 'zod';
import {
    ChatFlowError,
    ChatSafetyControls,
    ConversationMetadataStore,
    ConversationMessageStore,
    DeterministicRoutingAssistant,
    buildPhase5RoutingFixtures,
    createPostLinkedChatContext,
    toErrorHttpResult,
    readQueryString,
    requireQueryString,
    type AidPostRecord,
    type ChatInitiationSurface,
    type MessageStatus,
    type RecipientTransportCapability,
} from '@patchwork/shared';

export interface ApiChatRouteResult {
    statusCode: number;
    body: unknown;
}

interface ApiChatErrorResponse {
    error: {
        code:
            | 'INVALID_QUERY'
            | 'UNAUTHORIZED'
            | 'INVALID_CONTEXT'
            | 'UNSUPPORTED_SCENARIO';
        message: string;
        details?: Record<string, unknown>;
    };
}

const requireString = (params: URLSearchParams, key: string): string => {
    return requireQueryString(
        params,
        key,
        missingKey =>
            new ChatFlowError(
                'INVALID_CONTEXT',
                `Missing required field: ${missingKey}`,
            ),
    );
};

const readString = readQueryString;

const parseInitiationSurface = (
    value: string | undefined,
): ChatInitiationSurface => {
    if (value === 'map' || value === 'feed' || value === 'detail') {
        return value;
    }

    return 'detail';
};

const parseAidCategory = (
    value: string | undefined,
): AidPostRecord['category'] => {
    if (
        value === 'food' ||
        value === 'shelter' ||
        value === 'medical' ||
        value === 'transport' ||
        value === 'childcare' ||
        value === 'other'
    ) {
        return value;
    }

    return 'other';
};

const parseUrgency = (value: string | undefined): AidPostRecord['urgency'] => {
    if (
        value === 'low' ||
        value === 'medium' ||
        value === 'high' ||
        value === 'critical'
    ) {
        return value;
    }

    return 'medium';
};

const toErrorResult = (
    error: unknown,
    fallbackMessage: string,
): ApiChatRouteResult => {
    if (error instanceof ChatFlowError) {
        const code: ApiChatErrorResponse['error']['code'] =
            error.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED'
            : error.code === 'INVALID_CONTEXT' ? 'INVALID_CONTEXT'
            : 'INVALID_QUERY';

        return toErrorHttpResult(
            code === 'UNAUTHORIZED' ? 403 : 400,
            code,
            error.message,
            error.details,
        );
    }

    if (error instanceof ZodError) {
        return toErrorHttpResult(
            400,
            'INVALID_QUERY',
            'Input validation failed.',
            {
                issues: error.issues.map(issue => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            },
        );
    }

    return toErrorHttpResult(400, 'INVALID_QUERY', fallbackMessage);
};

const fixtureCapabilities = new Map<string, RecipientTransportCapability>([
    [
        'did:example:alice',
        {
            recipientDid: 'did:example:alice',
            supportsAtprotoChat: true,
            fallbackChannels: ['manual-review'],
            detectedAt: '2026-02-26T16:00:00.000Z',
        },
    ],
    [
        'did:example:resource-fallback',
        {
            recipientDid: 'did:example:resource-fallback',
            supportsAtprotoChat: false,
            fallbackChannels: ['url', 'manual-review'],
            detectedAt: '2026-02-26T16:00:00.000Z',
        },
    ],
]);

const validMessageStatuses = new Set<string>([
    'sending',
    'sent',
    'delivered',
    'read',
    'failed',
]);

export class ApiChatService {
    private readonly routingAssistant = new DeterministicRoutingAssistant();
    private readonly metadataStore = new ConversationMetadataStore();
    private readonly safetyControls = new ChatSafetyControls();
    private readonly messageStore = new ConversationMessageStore();

    initiateFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const initiatedByDid = requireString(params, 'initiatedByDid');
            const recipientDid = requireString(params, 'recipientDid');
            const aidPostUri = requireString(params, 'aidPostUri');
            const initiatedFrom = parseInitiationSurface(
                readString(params, 'initiatedFrom'),
            );

            const allowInitiation =
                readString(params, 'allowInitiation') !== 'false';
            const allowedParticipants = readString(
                params,
                'allowedParticipants',
            )
                ?.split(',')
                .map(value => value.trim())
                .filter(Boolean);

            const chat = createPostLinkedChatContext({
                aidPostUri,
                initiatedByDid,
                recipientDid,
                initiatedFrom,
                allowInitiation,
                allowedParticipantDids: allowedParticipants,
                now: readString(params, 'now'),
            });

            const routing = this.routingAssistant.decide({
                aidPostUri,
                requesterDid: initiatedByDid,
                aidCategory: parseAidCategory(readString(params, 'category')),
                urgency: parseUrgency(readString(params, 'urgency')),
                postAuthorDid: recipientDid,
                volunteerCandidates: [],
                resourceCandidates: [],
                now: readString(params, 'now'),
            });

            const existing = this.metadataStore.getConversation(
                chat.conversationUri,
            );
            const persisted = this.metadataStore.upsertConversation({
                chat,
                routingDecision: routing,
                recipientCapability: this.resolveCapability(
                    recipientDid,
                    readString(params, 'supportsAtprotoChat'),
                    readString(params, 'now'),
                ),
                updatedAt: readString(params, 'now'),
            });

            return {
                statusCode: 200,
                body: {
                    conversationUri: persisted.conversationUri,
                    created: existing === null,
                    transportPath: persisted.transportPath,
                    fallbackNotice: persisted.fallbackNotice,
                    requestContext: persisted.requestContext,
                },
            };
        } catch (error) {
            return toErrorResult(
                error,
                'Failed to initiate chat conversation.',
            );
        }
    }

    routeScenarioFromParams(params: URLSearchParams): ApiChatRouteResult {
        const scenario = readString(params, 'scenario') ?? 'post-author-direct';
        const fixture = buildPhase5RoutingFixtures().find(
            item => item.id === scenario,
        );

        if (!fixture) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'UNSUPPORTED_SCENARIO',
                        message: `Unsupported routing scenario: ${scenario}`,
                    },
                } satisfies ApiChatErrorResponse,
            };
        }

        const decision = this.routingAssistant.decide(fixture.input);
        return {
            statusCode: 200,
            body: {
                scenario,
                decision,
            },
        };
    }

    listConversationsFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const aidPostUri = requireString(params, 'aidPostUri');
            const conversations = this.metadataStore.listForAidPost(aidPostUri);

            return {
                statusCode: 200,
                body: {
                    total: conversations.length,
                    results: conversations,
                },
            };
        } catch (error) {
            return toErrorResult(
                error,
                'Failed to list conversation metadata.',
            );
        }
    }

    evaluateSafetyFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const result = this.safetyControls.evaluateOutboundMessage({
                senderDid: requireString(params, 'senderDid'),
                recipientDid: requireString(params, 'recipientDid'),
                conversationUri: requireString(params, 'conversationUri'),
                message: requireString(params, 'message'),
                sentAt: readString(params, 'sentAt'),
            });

            return {
                statusCode: 200,
                body: result,
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to evaluate safety policy.');
        }
    }

    blockFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const actorDid = requireString(params, 'actorDid');
            const targetDid = requireString(params, 'targetDid');
            this.safetyControls.blockParticipant(actorDid, targetDid);
            return {
                statusCode: 200,
                body: {
                    ok: true,
                    action: 'block',
                    actorDid,
                    targetDid,
                },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to block participant.');
        }
    }

    muteFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const actorDid = requireString(params, 'actorDid');
            const conversationUri = requireString(params, 'conversationUri');
            this.safetyControls.muteConversation(actorDid, conversationUri);
            return {
                statusCode: 200,
                body: {
                    ok: true,
                    action: 'mute',
                    actorDid,
                    conversationUri,
                },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to mute conversation.');
        }
    }

    reportFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const result = this.safetyControls.reportAbuse({
                subjectUri: requireString(params, 'subjectUri'),
                reporterDid: requireString(params, 'reporterDid'),
                reason:
                    (readString(params, 'reason') as
                        | 'spam'
                        | 'abuse'
                        | 'fraud'
                        | 'other'
                        | undefined) ?? 'other',
                details: readString(params, 'details'),
                createdAt: readString(params, 'createdAt'),
            });

            return {
                statusCode: 200,
                body: result,
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to submit moderation report.');
        }
    }

    drainModerationSignals(): ApiChatRouteResult {
        return {
            statusCode: 200,
            body: {
                total: this.safetyControls.drainModerationSignals().length,
            },
        };
    }

    safetyMetrics(): ApiChatRouteResult {
        return {
            statusCode: 200,
            body: {
                metrics: this.safetyControls.getMetrics(),
            },
        };
    }

    // -----------------------------------------------------------------
    // POST /chat/message/send - send a message in a conversation
    // -----------------------------------------------------------------

    sendMessageFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const conversationUri = requireString(params, 'conversationUri');
            const senderDid = requireString(params, 'senderDid');
            const text = requireString(params, 'text');
            const messageId = readString(params, 'messageId');
            const createdAt = readString(params, 'createdAt');

            const message = this.messageStore.addMessage({
                conversationUri,
                senderDid,
                text,
                messageId: messageId ?? undefined,
                createdAt: createdAt ?? undefined,
            });

            return {
                statusCode: 200,
                body: { message },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to send message.');
        }
    }

    // -----------------------------------------------------------------
    // PUT /chat/message/status - update message delivery/read status
    // -----------------------------------------------------------------

    updateMessageStatusFromParams(
        params: URLSearchParams,
    ): ApiChatRouteResult {
        try {
            const messageId = requireString(params, 'messageId');
            const statusValue = requireString(params, 'status');
            const failureReason = readString(params, 'failureReason');

            if (!validMessageStatuses.has(statusValue)) {
                return toErrorHttpResult(
                    400,
                    'INVALID_QUERY',
                    `Invalid message status: ${statusValue}. Must be one of: sending, sent, delivered, read, failed.`,
                );
            }

            const updated = this.messageStore.updateMessageStatus(
                messageId,
                statusValue as MessageStatus,
                failureReason ?? undefined,
            );

            if (!updated) {
                return toErrorHttpResult(
                    404,
                    'INVALID_QUERY',
                    `Message not found: ${messageId}`,
                );
            }

            return {
                statusCode: 200,
                body: { message: updated },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to update message status.');
        }
    }

    // -----------------------------------------------------------------
    // GET /chat/messages - paginated conversation history
    // -----------------------------------------------------------------

    getConversationHistoryFromParams(
        params: URLSearchParams,
    ): ApiChatRouteResult {
        try {
            const conversationUri = requireString(params, 'conversationUri');
            const cursor = readString(params, 'cursor');
            const limitStr = readString(params, 'limit');
            const limit = limitStr ? Number.parseInt(limitStr, 10) : 20;

            if (Number.isNaN(limit) || limit < 1) {
                return toErrorHttpResult(
                    400,
                    'INVALID_QUERY',
                    'Limit must be a positive integer.',
                );
            }

            const result = this.messageStore.getConversationHistory(
                conversationUri,
                { cursor, limit },
            );

            return {
                statusCode: 200,
                body: result,
            };
        } catch (error) {
            return toErrorResult(
                error,
                'Failed to retrieve conversation history.',
            );
        }
    }

    // -----------------------------------------------------------------
    // POST /chat/message/retry - retry a failed message
    // -----------------------------------------------------------------

    retryMessageFromParams(params: URLSearchParams): ApiChatRouteResult {
        try {
            const messageId = requireString(params, 'messageId');

            const retried = this.messageStore.retryMessage(messageId);
            if (!retried) {
                return toErrorHttpResult(
                    400,
                    'INVALID_QUERY',
                    `Message not found or not in failed state: ${messageId}`,
                );
            }

            return {
                statusCode: 200,
                body: { message: retried, retried: true },
            };
        } catch (error) {
            return toErrorResult(error, 'Failed to retry message.');
        }
    }

    // -----------------------------------------------------------------
    // Test-only: message store accessor
    // -----------------------------------------------------------------

    getMessageStoreForTesting(): ConversationMessageStore {
        return this.messageStore;
    }

    private resolveCapability(
        recipientDid: string,
        explicitFlag: string | undefined,
        now: string | undefined,
    ): RecipientTransportCapability {
        const fixture = fixtureCapabilities.get(recipientDid);
        if (fixture) {
            return {
                ...fixture,
                detectedAt: now ?? fixture.detectedAt,
            };
        }

        if (explicitFlag === 'true' || explicitFlag === 'false') {
            return {
                recipientDid,
                supportsAtprotoChat: explicitFlag === 'true',
                fallbackChannels: ['manual-review'],
                detectedAt: now ?? new Date().toISOString(),
            };
        }

        return {
            recipientDid,
            supportsAtprotoChat: false,
            fallbackChannels: ['manual-review'],
            detectedAt: now ?? new Date().toISOString(),
        };
    }
}

export const createFixtureChatService = (): ApiChatService => {
    return new ApiChatService();
};
