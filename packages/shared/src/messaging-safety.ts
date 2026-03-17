import {
    recordNsid,
    type ModerationReportRecord,
    validateRecordPayload,
} from '@patchwork/at-lexicons';
import type { ModerationReviewRequestedEvent } from './contracts.js';
import { deepClone } from './clone.js';
import { atUriRecordSchema, didSchema, isoDateTimeSchema } from './schemas.js';

export interface ChatSafetyEvaluationInput {
    senderDid: string;
    recipientDid: string;
    conversationUri: string;
    message: string;
    sentAt?: string;
}

export interface ChatSafetyEvaluation {
    allowed: boolean;
    code:
        | 'OK'
        | 'BLOCKED'
        | 'RATE_LIMITED'
        | 'DUPLICATE_BLOCKED'
        | 'ABUSE_FLAGGED';
    userMessage: string;
    matchedKeywords: string[];
    moderationSignal?: ModerationReviewRequestedEvent;
}

export interface ChatSafetyConfig {
    maxMessagesPerWindow: number;
    windowMs: number;
    duplicateWindowMs: number;
    maxDuplicateMessages: number;
    suspiciousSignalThreshold: number;
    abuseKeywords: readonly string[];
}

export interface ChatSafetyMetrics {
    evaluated: number;
    blockedByRelationship: number;
    rateLimited: number;
    duplicateBlocked: number;
    abuseKeywordFlags: number;
    suspiciousSignals: number;
}

export interface ReportAbuseInput {
    subjectUri: string;
    reporterDid: string;
    reason: ModerationReportRecord['reason'];
    details?: string;
    createdAt?: string;
}

const defaultSafetyConfig: ChatSafetyConfig = {
    maxMessagesPerWindow: 4,
    windowMs: 30_000,
    duplicateWindowMs: 120_000,
    maxDuplicateMessages: 2,
    suspiciousSignalThreshold: 3,
    abuseKeywords: ['scam', 'fraud', 'abuse', 'threat'],
};

const getOrCreateSet = (
    map: Map<string, Set<string>>,
    key: string,
): Set<string> => {
    const value = map.get(key) ?? new Set<string>();
    map.set(key, value);
    return value;
};

export class ChatSafetyControls {
    private readonly blockedParticipants = new Map<string, Set<string>>();
    private readonly mutedConversations = new Map<string, Set<string>>();
    private readonly sendWindows = new Map<string, number[]>();
    private readonly duplicateWindows = new Map<string, number[]>();
    private readonly suspiciousIncidentWindows = new Map<string, number[]>();
    private readonly moderationSignals: ModerationReviewRequestedEvent[] = [];
    private readonly config: ChatSafetyConfig;
    private readonly metrics: ChatSafetyMetrics = {
        evaluated: 0,
        blockedByRelationship: 0,
        rateLimited: 0,
        duplicateBlocked: 0,
        abuseKeywordFlags: 0,
        suspiciousSignals: 0,
    };

    constructor(config: Partial<ChatSafetyConfig> = {}) {
        this.config = {
            ...defaultSafetyConfig,
            ...config,
        };
    }

    blockParticipant(actorDid: string, targetDid: string): void {
        const actor = didSchema.parse(actorDid);
        const target = didSchema.parse(targetDid);
        getOrCreateSet(this.blockedParticipants, actor).add(target);
    }

    muteConversation(actorDid: string, conversationUri: string): void {
        const actor = didSchema.parse(actorDid);
        const uri = atUriRecordSchema.parse(conversationUri);
        getOrCreateSet(this.mutedConversations, actor).add(uri);
    }

    isMuted(actorDid: string, conversationUri: string): boolean {
        const actor = didSchema.parse(actorDid);
        const uri = atUriRecordSchema.parse(conversationUri);
        return this.mutedConversations.get(actor)?.has(uri) ?? false;
    }

    evaluateOutboundMessage(
        input: ChatSafetyEvaluationInput,
    ): ChatSafetyEvaluation {
        const senderDid = didSchema.parse(input.senderDid);
        const recipientDid = didSchema.parse(input.recipientDid);
        const conversationUri = atUriRecordSchema.parse(input.conversationUri);
        const sentAt = isoDateTimeSchema.parse(
            input.sentAt ?? new Date().toISOString(),
        );
        this.metrics.evaluated += 1;

        const senderBlockedRecipient =
            this.blockedParticipants.get(senderDid)?.has(recipientDid) ?? false;
        const recipientBlockedSender =
            this.blockedParticipants.get(recipientDid)?.has(senderDid) ?? false;

        if (senderBlockedRecipient || recipientBlockedSender) {
            this.metrics.blockedByRelationship += 1;
            this.trackSuspiciousIncident(
                senderDid,
                conversationUri,
                sentAt,
                'participant-block',
            );
            return {
                allowed: false,
                code: 'BLOCKED',
                userMessage:
                    'Message cannot be sent because one participant has blocked the other.',
                matchedKeywords: [],
            };
        }

        const nowMs = Date.parse(sentAt);
        const normalizedMessage = input.message.trim().toLowerCase();

        const duplicateKey = `${senderDid}:${conversationUri}:${normalizedMessage}`;
        const duplicateWindow = (
            this.duplicateWindows.get(duplicateKey) ?? []
        ).filter(
            timestamp => nowMs - timestamp <= this.config.duplicateWindowMs,
        );

        if (duplicateWindow.length >= this.config.maxDuplicateMessages) {
            this.duplicateWindows.set(duplicateKey, duplicateWindow);
            this.metrics.duplicateBlocked += 1;
            this.trackSuspiciousIncident(
                senderDid,
                conversationUri,
                sentAt,
                'duplicate-burst',
            );
            return {
                allowed: false,
                code: 'DUPLICATE_BLOCKED',
                userMessage:
                    'Repeated duplicate messages were blocked to prevent spam.',
                matchedKeywords: [],
            };
        }

        duplicateWindow.push(nowMs);
        this.duplicateWindows.set(duplicateKey, duplicateWindow);

        const activeWindow = (this.sendWindows.get(senderDid) ?? []).filter(
            timestamp => nowMs - timestamp <= this.config.windowMs,
        );

        if (activeWindow.length >= this.config.maxMessagesPerWindow) {
            this.sendWindows.set(senderDid, activeWindow);
            this.metrics.rateLimited += 1;
            this.trackSuspiciousIncident(
                senderDid,
                conversationUri,
                sentAt,
                'rate-limit-burst',
            );
            return {
                allowed: false,
                code: 'RATE_LIMITED',
                userMessage:
                    'You are sending messages too quickly. Please wait before trying again.',
                matchedKeywords: [],
            };
        }

        activeWindow.push(nowMs);
        this.sendWindows.set(senderDid, activeWindow);
        const matchedKeywords = this.config.abuseKeywords.filter(keyword =>
            normalizedMessage.includes(keyword.toLowerCase()),
        );

        if (matchedKeywords.length > 0) {
            this.metrics.abuseKeywordFlags += 1;
            const moderationSignal: ModerationReviewRequestedEvent = {
                type: 'moderation.review.requested',
                subjectUri: conversationUri,
                reason: `abuse-keyword:${matchedKeywords.join(',')}`,
                requestedAt: sentAt,
            };

            this.moderationSignals.push(moderationSignal);
            this.trackSuspiciousIncident(
                senderDid,
                conversationUri,
                sentAt,
                'abuse-keyword',
            );
            return {
                allowed: true,
                code: 'ABUSE_FLAGGED',
                userMessage:
                    'Message sent, but flagged for safety review due to policy keywords.',
                matchedKeywords,
                moderationSignal,
            };
        }

        return {
            allowed: true,
            code: 'OK',
            userMessage: 'Message sent.',
            matchedKeywords: [],
        };
    }

    reportAbuse(input: ReportAbuseInput): {
        reportRecord: ModerationReportRecord;
        moderationSignal: ModerationReviewRequestedEvent;
    } {
        const subjectUri = atUriRecordSchema.parse(input.subjectUri);
        const reporterDid = didSchema.parse(input.reporterDid);
        const createdAt = isoDateTimeSchema.parse(
            input.createdAt ?? new Date().toISOString(),
        );

        const recordCandidate = {
            $type: recordNsid.moderationReport,
            version: '1.0.0',
            subjectUri,
            reporterDid,
            reason: input.reason,
            details: input.details?.trim() || undefined,
            createdAt,
        } satisfies ModerationReportRecord;

        const reportRecord = validateRecordPayload(
            recordNsid.moderationReport,
            recordCandidate,
        );

        const moderationSignal: ModerationReviewRequestedEvent = {
            type: 'moderation.review.requested',
            subjectUri,
            reason: `user-report:${reportRecord.reason}`,
            requestedAt: createdAt,
        };

        this.moderationSignals.push(moderationSignal);
        return { reportRecord, moderationSignal };
    }

    drainModerationSignals(): ModerationReviewRequestedEvent[] {
        const signals = [...this.moderationSignals].map(signal =>
            deepClone(signal),
        );
        this.moderationSignals.length = 0;
        return signals;
    }

    getMetrics(): ChatSafetyMetrics {
        return deepClone(this.metrics);
    }

    private trackSuspiciousIncident(
        senderDid: string,
        conversationUri: string,
        sentAt: string,
        reason: string,
    ): void {
        const nowMs = Date.parse(sentAt);
        const observationWindowMs = Math.max(
            this.config.windowMs,
            this.config.duplicateWindowMs,
        );

        const activeWindow = (
            this.suspiciousIncidentWindows.get(senderDid) ?? []
        ).filter(timestamp => nowMs - timestamp <= observationWindowMs);

        activeWindow.push(nowMs);
        this.suspiciousIncidentWindows.set(senderDid, activeWindow);

        if (activeWindow.length < this.config.suspiciousSignalThreshold) {
            return;
        }

        this.metrics.suspiciousSignals += 1;
        this.moderationSignals.push({
            type: 'moderation.review.requested',
            subjectUri: conversationUri,
            reason: `suspicious-pattern:${reason}`,
            requestedAt: sentAt,
        });

        this.suspiciousIncidentWindows.set(senderDid, []);
    }
}
