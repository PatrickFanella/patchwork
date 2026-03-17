/**
 * Simple synchronous string hash (djb2 + hex) for deterministic ID generation.
 * Browser-safe replacement for node:crypto createHash('sha256').
 */
const simpleHash = (input: string, length: number): string => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(16).padStart(length, '0').slice(0, length);
};
import { recordNsid } from '@patchwork/at-lexicons';
import type { ModerationReviewRequestedEvent } from './contracts.js';
import { deepClone } from './clone.js';
import { atUriSchema, didSchema, isoDateTimeSchema } from './schemas.js';

export type ModerationSubjectType =
    | 'aid-post'
    | 'conversation'
    | 'directory-resource'
    | 'other';

export type ModerationQueueStatus = 'queued' | 'resolved';

export type ModerationVisibilityState = 'visible' | 'delisted' | 'suspended';

export type ModerationAppealState =
    | 'none'
    | 'pending'
    | 'under-review'
    | 'upheld'
    | 'rejected';

export type ModerationPolicyAction =
    | 'delist'
    | 'suspend-visibility'
    | 'restore-visibility'
    | 'open-appeal'
    | 'start-appeal-review'
    | 'resolve-appeal-upheld'
    | 'resolve-appeal-rejected';

export interface ModerationQueueContext {
    reporterDid?: string;
    summary?: string;
    tags?: string[];
}

export interface ModerationQueueItem {
    queueId: string;
    subjectUri: string;
    subjectType: ModerationSubjectType;
    reasons: string[];
    latestReason: string;
    reportCount: number;
    queueStatus: ModerationQueueStatus;
    visibility: ModerationVisibilityState;
    appealState: ModerationAppealState;
    createdAt: string;
    requestedAt: string;
    updatedAt: string;
    context: ModerationQueueContext;
}

export interface ModerationAuditStateSnapshot {
    queueStatus: ModerationQueueStatus;
    visibility: ModerationVisibilityState;
    appealState: ModerationAppealState;
}

export interface ModerationPolicyAuditEntry {
    actionId: string;
    queueId: string;
    subjectUri: string;
    actorDid: string;
    action: ModerationPolicyAction;
    reason: string;
    occurredAt: string;
    idempotencyKey: string;
    previousState: ModerationAuditStateSnapshot;
    nextState: ModerationAuditStateSnapshot;
}

/** Durable queue store interface for moderation queue items. */
export interface ModerationQueueStore {
    /** Persist or update a queue item (upsert by subjectUri). */
    enqueue(item: ModerationQueueItem): void;
    /** Retrieve a queue item by subjectUri, or null if not found. */
    dequeue(subjectUri: string): ModerationQueueItem | null;
    /** Peek at a queue item without removing it. */
    peek(subjectUri: string): ModerationQueueItem | null;
    /** Acknowledge processing of a queue item (mark resolved). */
    ack(subjectUri: string): void;
    /** Negative-acknowledge: re-queue a previously dequeued item. */
    nack(subjectUri: string): void;
    /** List all pending (queued) items. */
    listPending(): ModerationQueueItem[];
    /** List items matching optional filters. */
    listAll(filters?: {
        queueStatus?: ModerationQueueStatus;
        visibility?: ModerationVisibilityState;
        appealState?: ModerationAppealState;
    }): ModerationQueueItem[];
}

/** Audit record stored by the durable audit store. */
export interface ModerationAuditRecord {
    actionId: string;
    queueId: string;
    subjectUri: string;
    actorDid: string;
    action: ModerationPolicyAction;
    reason: string;
    occurredAt: string;
    idempotencyKey: string;
    previousState: ModerationAuditStateSnapshot;
    nextState: ModerationAuditStateSnapshot;
}

/** Durable audit store interface for moderation audit trail. */
export interface ModerationAuditStore {
    /** Record a policy action with idempotency enforcement. */
    recordAction(record: ModerationAuditRecord): void;
    /** Get the full audit trail for a given subjectUri. */
    getAuditTrail(subjectUri: string): ModerationAuditRecord[];
    /** Get all audit records, optionally filtered. */
    getActions(filter?: {
        subjectUri?: string;
        action?: ModerationPolicyAction;
        actorDid?: string;
    }): ModerationAuditRecord[];
    /** Check if an action with the given idempotency key already exists. */
    findByIdempotencyKey(key: string): ModerationAuditRecord | null;
}

export interface EnqueueModerationReviewInput {
    subjectUri: string;
    reason: string;
    requestedAt?: string;
    context?: ModerationQueueContext;
}

export interface ApplyModerationPolicyActionInput {
    subjectUri: string;
    actorDid: string;
    action: ModerationPolicyAction;
    reason: string;
    occurredAt?: string;
    idempotencyKey?: string;
}

export class ModerationPolicyError extends Error {
    constructor(
        readonly code:
            | 'QUEUE_ITEM_NOT_FOUND'
            | 'INVALID_APPEAL_TRANSITION'
            | 'INVALID_POLICY_INPUT'
            | 'IDEMPOTENT_ACTION_EXISTS',
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ModerationPolicyError';
    }
}

const parseAtUriCollection = (subjectUri: string): string | null => {
    const parsed = /^at:\/\/[^/]+\/([^/]+)\/[^/]+$/i.exec(subjectUri);
    return parsed?.[1] ?? null;
};

const subjectTypeFromUri = (subjectUri: string): ModerationSubjectType => {
    const collection = parseAtUriCollection(subjectUri);

    if (collection === recordNsid.aidPost) {
        return 'aid-post';
    }
    if (collection === recordNsid.conversationMeta) {
        return 'conversation';
    }
    if (collection === recordNsid.directoryResource) {
        return 'directory-resource';
    }

    return 'other';
};

const toQueueId = (subjectUri: string): string => {
    return simpleHash(subjectUri, 20);
};

const toAuditId = (
    queueId: string,
    action: ModerationPolicyAction,
    occurredAt: string,
    actorDid: string,
): string => {
    return simpleHash(`${queueId}|${action}|${occurredAt}|${actorDid}`, 20);
};

const mergeContext = (
    existing: ModerationQueueContext,
    next: ModerationQueueContext,
): ModerationQueueContext => {
    return {
        reporterDid:
            next.reporterDid?.trim() || existing.reporterDid || undefined,
        summary: next.summary?.trim() || existing.summary || undefined,
        tags:
            next.tags && next.tags.length > 0 ?
                [...new Set(next.tags.map(tag => tag.trim()).filter(Boolean))]
            :   existing.tags,
    };
};

const applyTransition = (
    current: ModerationQueueItem,
    action: ModerationPolicyAction,
): ModerationAuditStateSnapshot => {
    const next: ModerationAuditStateSnapshot = {
        queueStatus: current.queueStatus,
        visibility: current.visibility,
        appealState: current.appealState,
    };

    switch (action) {
        case 'delist':
            next.visibility = 'delisted';
            next.queueStatus = 'resolved';
            break;
        case 'suspend-visibility':
            next.visibility = 'suspended';
            next.queueStatus = 'resolved';
            break;
        case 'restore-visibility':
            next.visibility = 'visible';
            next.queueStatus =
                (
                    current.appealState === 'pending' ||
                    current.appealState === 'under-review'
                ) ?
                    'queued'
                :   'resolved';
            break;
        case 'open-appeal':
            next.appealState = 'pending';
            next.queueStatus = 'queued';
            break;
        case 'start-appeal-review':
            if (current.appealState !== 'pending') {
                throw new ModerationPolicyError(
                    'INVALID_APPEAL_TRANSITION',
                    'Appeal review can only start from pending state.',
                    {
                        subjectUri: current.subjectUri,
                        appealState: current.appealState,
                    },
                );
            }
            next.appealState = 'under-review';
            next.queueStatus = 'queued';
            break;
        case 'resolve-appeal-upheld':
            if (
                current.appealState !== 'under-review' &&
                current.appealState !== 'pending'
            ) {
                throw new ModerationPolicyError(
                    'INVALID_APPEAL_TRANSITION',
                    'Appeal can only be upheld from pending or under-review state.',
                    {
                        subjectUri: current.subjectUri,
                        appealState: current.appealState,
                    },
                );
            }
            next.appealState = 'upheld';
            next.queueStatus = 'resolved';
            break;
        case 'resolve-appeal-rejected':
            if (
                current.appealState !== 'under-review' &&
                current.appealState !== 'pending'
            ) {
                throw new ModerationPolicyError(
                    'INVALID_APPEAL_TRANSITION',
                    'Appeal can only be rejected from pending or under-review state.',
                    {
                        subjectUri: current.subjectUri,
                        appealState: current.appealState,
                    },
                );
            }
            next.appealState = 'rejected';
            next.queueStatus = 'resolved';
            break;
        default:
            throw new ModerationPolicyError(
                'INVALID_POLICY_INPUT',
                `Unsupported moderation action: ${action}`,
                { action },
            );
    }

    return next;
};

export const toIdempotencyKey = (
    queueId: string,
    action: ModerationPolicyAction,
    occurredAt: string,
    actorDid: string,
): string => {
    return simpleHash(`idem|${queueId}|${action}|${occurredAt}|${actorDid}`, 32);
};

export interface ModerationReviewQueueOptions {
    queueStore?: ModerationQueueStore;
    auditStore?: ModerationAuditStore;
}

export class ModerationReviewQueue {
    private readonly queueBySubject = new Map<string, ModerationQueueItem>();
    private readonly auditTrail: ModerationPolicyAuditEntry[] = [];
    private readonly queueStore: ModerationQueueStore | null;
    private readonly auditStore: ModerationAuditStore | null;

    constructor(options?: ModerationReviewQueueOptions) {
        this.queueStore = options?.queueStore ?? null;
        this.auditStore = options?.auditStore ?? null;
    }

    enqueueReview(input: EnqueueModerationReviewInput): ModerationQueueItem {
        const subjectUri = atUriSchema.parse(input.subjectUri);
        const reason = input.reason.trim();
        if (reason.length === 0) {
            throw new ModerationPolicyError(
                'INVALID_POLICY_INPUT',
                'Moderation reason is required.',
                { subjectUri },
            );
        }

        const requestedAt = isoDateTimeSchema.parse(
            input.requestedAt ?? new Date().toISOString(),
        );

        const existing =
            this.queueStore?.peek(subjectUri) ??
            this.queueBySubject.get(subjectUri) ??
            null;
        if (existing) {
            const next: ModerationQueueItem = {
                ...existing,
                reasons:
                    existing.reasons.includes(reason) ?
                        [...existing.reasons]
                    :   [...existing.reasons, reason],
                latestReason: reason,
                reportCount: existing.reportCount + 1,
                queueStatus: 'queued',
                requestedAt,
                updatedAt: requestedAt,
                context: mergeContext(existing.context, input.context ?? {}),
            };
            this.queueBySubject.set(subjectUri, next);
            this.queueStore?.enqueue(next);
            return deepClone(next);
        }

        const created: ModerationQueueItem = {
            queueId: toQueueId(subjectUri),
            subjectUri,
            subjectType: subjectTypeFromUri(subjectUri),
            reasons: [reason],
            latestReason: reason,
            reportCount: 1,
            queueStatus: 'queued',
            visibility: 'visible',
            appealState: 'none',
            createdAt: requestedAt,
            requestedAt,
            updatedAt: requestedAt,
            context: mergeContext({}, input.context ?? {}),
        };

        this.queueBySubject.set(subjectUri, created);
        this.queueStore?.enqueue(created);
        return deepClone(created);
    }

    enqueueSignal(
        signal: ModerationReviewRequestedEvent,
        context: ModerationQueueContext = {},
    ): ModerationQueueItem {
        return this.enqueueReview({
            subjectUri: signal.subjectUri,
            reason: signal.reason,
            requestedAt: signal.requestedAt,
            context,
        });
    }

    applyPolicyAction(
        input: ApplyModerationPolicyActionInput,
    ): ModerationQueueItem {
        const subjectUri = atUriSchema.parse(input.subjectUri);
        const actorDid = didSchema.parse(input.actorDid);
        const reason = input.reason.trim();

        if (reason.length === 0) {
            throw new ModerationPolicyError(
                'INVALID_POLICY_INPUT',
                'Policy action reason is required.',
                { subjectUri },
            );
        }

        const current =
            this.queueStore?.peek(subjectUri) ??
            this.queueBySubject.get(subjectUri) ??
            null;
        if (!current) {
            throw new ModerationPolicyError(
                'QUEUE_ITEM_NOT_FOUND',
                'Moderation queue item not found.',
                { subjectUri },
            );
        }

        const occurredAt = isoDateTimeSchema.parse(
            input.occurredAt ?? new Date().toISOString(),
        );

        const idempotencyKey =
            input.idempotencyKey ??
            toIdempotencyKey(current.queueId, input.action, occurredAt, actorDid);

        // Idempotency check: if an action with this key already exists, return current state
        if (this.auditStore) {
            const existing = this.auditStore.findByIdempotencyKey(idempotencyKey);
            if (existing) {
                const currentItem =
                    this.queueStore?.peek(subjectUri) ??
                    this.queueBySubject.get(subjectUri) ??
                    null;
                return deepClone(currentItem ?? current);
            }
        } else {
            const existing = this.auditTrail.find(
                entry => entry.idempotencyKey === idempotencyKey,
            );
            if (existing) {
                return deepClone(current);
            }
        }

        const previousState: ModerationAuditStateSnapshot = {
            queueStatus: current.queueStatus,
            visibility: current.visibility,
            appealState: current.appealState,
        };

        const nextState = applyTransition(current, input.action);

        const updated: ModerationQueueItem = {
            ...current,
            ...nextState,
            updatedAt: occurredAt,
        };

        this.queueBySubject.set(subjectUri, updated);
        this.queueStore?.enqueue(updated);

        const auditEntry: ModerationPolicyAuditEntry = {
            actionId: toAuditId(
                updated.queueId,
                input.action,
                occurredAt,
                actorDid,
            ),
            queueId: updated.queueId,
            subjectUri,
            actorDid,
            action: input.action,
            reason,
            occurredAt,
            idempotencyKey,
            previousState,
            nextState,
        };

        this.auditTrail.push(auditEntry);
        this.auditStore?.recordAction({
            actionId: auditEntry.actionId,
            queueId: auditEntry.queueId,
            subjectUri: auditEntry.subjectUri,
            actorDid: auditEntry.actorDid,
            action: auditEntry.action,
            reason: auditEntry.reason,
            occurredAt: auditEntry.occurredAt,
            idempotencyKey: auditEntry.idempotencyKey,
            previousState: auditEntry.previousState,
            nextState: auditEntry.nextState,
        });

        return deepClone(updated);
    }

    getState(subjectUri: string): ModerationQueueItem | null {
        const normalizedSubjectUri = atUriSchema.parse(subjectUri);
        const found =
            this.queueStore?.peek(normalizedSubjectUri) ??
            this.queueBySubject.get(normalizedSubjectUri) ??
            null;
        return found ? deepClone(found) : null;
    }

    listQueue(filters?: {
        queueStatus?: ModerationQueueStatus;
        visibility?: ModerationVisibilityState;
        appealState?: ModerationAppealState;
    }): ModerationQueueItem[] {
        const items =
            this.queueStore ?
                this.queueStore.listAll(filters)
            :   [...this.queueBySubject.values()];

        return items
            .filter(item => {
                if (
                    filters?.queueStatus &&
                    item.queueStatus !== filters.queueStatus
                ) {
                    return false;
                }
                if (
                    filters?.visibility &&
                    item.visibility !== filters.visibility
                ) {
                    return false;
                }
                if (
                    filters?.appealState &&
                    item.appealState !== filters.appealState
                ) {
                    return false;
                }
                return true;
            })
            .sort((left, right) => {
                const byUpdatedAt =
                    Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
                if (byUpdatedAt !== 0) {
                    return byUpdatedAt;
                }
                return left.queueId.localeCompare(right.queueId);
            })
            .map(entry => deepClone(entry));
    }

    listAuditTrail(subjectUri?: string): ModerationPolicyAuditEntry[] {
        const normalizedSubjectUri =
            subjectUri ? atUriSchema.parse(subjectUri) : undefined;

        const entries =
            this.auditStore && normalizedSubjectUri ?
                this.auditStore.getAuditTrail(normalizedSubjectUri)
            : this.auditStore ?
                this.auditStore.getActions()
            :   this.auditTrail;

        return entries
            .filter(entry => {
                if (!normalizedSubjectUri) {
                    return true;
                }
                return entry.subjectUri === normalizedSubjectUri;
            })
            .sort((left, right) => {
                const byOccurredAt =
                    Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
                if (byOccurredAt !== 0) {
                    return byOccurredAt;
                }
                return left.actionId.localeCompare(right.actionId);
            })
            .map(entry => deepClone(entry));
    }
}
