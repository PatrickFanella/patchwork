import {
    ModerationPolicyError,
    ModerationReviewQueue,
    toErrorHttpResult,
    readQueryString,
    requireQueryString,
    type ModerationAppealState,
    type ModerationAuditStore,
    type ModerationPolicyAction,
    type ModerationQueueStatus,
    type ModerationQueueStore,
    type ModerationVisibilityState,
} from '@patchwork/shared';
import { ModerationMetrics } from './metrics.js';

export interface ModerationServiceResult {
    statusCode: number;
    body: unknown;
}

export interface ModerationWorkerServiceOptions {
    queueStore?: ModerationQueueStore;
    auditStore?: ModerationAuditStore;
    metrics?: ModerationMetrics;
}

const requireString = (params: URLSearchParams, key: string): string => {
    return requireQueryString(
        params,
        key,
        missingKey =>
            new ModerationPolicyError(
                'INVALID_POLICY_INPUT',
                `Missing required query parameter: ${missingKey}`,
                { key: missingKey },
            ),
    );
};

const readString = readQueryString;

const toErrorResult = (
    error: unknown,
    fallbackMessage: string,
): ModerationServiceResult => {
    if (error instanceof ModerationPolicyError) {
        const statusCode =
            error.code === 'QUEUE_ITEM_NOT_FOUND' ? 404
            : error.code === 'INVALID_APPEAL_TRANSITION' ? 409
            : 400;

        return toErrorHttpResult(
            statusCode,
            error.code,
            error.message,
            error.details,
        );
    }

    return toErrorHttpResult(400, 'INVALID_POLICY_INPUT', fallbackMessage);
};

const parseQueueStatus = (
    value: string | undefined,
): ModerationQueueStatus | undefined => {
    if (value === 'queued' || value === 'resolved') {
        return value;
    }

    return undefined;
};

const parseVisibility = (
    value: string | undefined,
): ModerationVisibilityState | undefined => {
    if (value === 'visible' || value === 'delisted' || value === 'suspended') {
        return value;
    }

    return undefined;
};

const parseAppealState = (
    value: string | undefined,
): ModerationAppealState | undefined => {
    if (
        value === 'none' ||
        value === 'pending' ||
        value === 'under-review' ||
        value === 'upheld' ||
        value === 'rejected'
    ) {
        return value;
    }

    return undefined;
};

const parsePolicyAction = (
    value: string | undefined,
): ModerationPolicyAction => {
    if (
        value === 'delist' ||
        value === 'suspend-visibility' ||
        value === 'restore-visibility' ||
        value === 'open-appeal' ||
        value === 'start-appeal-review' ||
        value === 'resolve-appeal-upheld' ||
        value === 'resolve-appeal-rejected'
    ) {
        return value;
    }

    throw new ModerationPolicyError(
        'INVALID_POLICY_INPUT',
        `Unsupported policy action: ${value ?? '<missing>'}`,
    );
};

const parseTags = (value: string | undefined): string[] | undefined => {
    if (!value) {
        return undefined;
    }

    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
};

export class ModerationWorkerService {
    private readonly queue: ModerationReviewQueue;
    readonly metrics: ModerationMetrics;

    constructor(options?: ModerationWorkerServiceOptions) {
        this.queue = new ModerationReviewQueue({
            queueStore: options?.queueStore,
            auditStore: options?.auditStore,
        });
        this.metrics = options?.metrics ?? new ModerationMetrics();
    }

    enqueueFromParams(params: URLSearchParams): ModerationServiceResult {
        try {
            const subjectUri = requireString(params, 'subjectUri');
            const item = this.queue.enqueueReview({
                subjectUri,
                reason: requireString(params, 'reason'),
                requestedAt: readString(params, 'requestedAt'),
                context: {
                    reporterDid: readString(params, 'reporterDid'),
                    summary: readString(params, 'summary'),
                    tags: parseTags(readString(params, 'tags')),
                },
            });

            this.metrics.recordEnqueue(subjectUri);

            return {
                statusCode: 200,
                body: {
                    item,
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to enqueue moderation review.');
        }
    }

    listQueueFromParams(params: URLSearchParams): ModerationServiceResult {
        try {
            const items = this.queue.listQueue({
                queueStatus: parseQueueStatus(readString(params, 'status')),
                visibility: parseVisibility(readString(params, 'visibility')),
                appealState: parseAppealState(
                    readString(params, 'appealState'),
                ),
            });

            return {
                statusCode: 200,
                body: {
                    total: items.length,
                    results: items,
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to list moderation queue.');
        }
    }

    applyPolicyFromParams(params: URLSearchParams): ModerationServiceResult {
        try {
            const action = parsePolicyAction(readString(params, 'action'));
            const subjectUri = requireString(params, 'subjectUri');
            const item = this.queue.applyPolicyAction({
                subjectUri,
                actorDid: requireString(params, 'actorDid'),
                action,
                reason: requireString(params, 'reason'),
                occurredAt: readString(params, 'occurredAt'),
                idempotencyKey: readString(params, 'idempotencyKey'),
            });

            this.metrics.recordAction(action);
            this.metrics.recordDequeue(subjectUri);

            return {
                statusCode: 200,
                body: {
                    item,
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(
                error,
                'Failed to apply moderation policy action.',
            );
        }
    }

    getStateFromParams(params: URLSearchParams): ModerationServiceResult {
        try {
            const subjectUri = requireString(params, 'subjectUri');
            const item = this.queue.getState(subjectUri);

            return {
                statusCode: item ? 200 : 404,
                body:
                    item ?
                        { item }
                    :   {
                            error: {
                                code: 'QUEUE_ITEM_NOT_FOUND',
                                message: 'Moderation state not found.',
                                details: { subjectUri },
                            },
                        },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to fetch moderation state.');
        }
    }

    listAuditFromParams(params: URLSearchParams): ModerationServiceResult {
        try {
            const subjectUri = readString(params, 'subjectUri');
            const entries = this.queue.listAuditTrail(subjectUri);

            return {
                statusCode: 200,
                body: {
                    total: entries.length,
                    results: entries,
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(
                error,
                'Failed to list moderation audit trail.',
            );
        }
    }

    getQueueStats(): ModerationServiceResult {
        try {
            const allItems = this.queue.listQueue();
            const pendingItems = allItems.filter(
                item => item.queueStatus === 'queued',
            );

            const now = Date.now();
            let totalWaitMs = 0;
            for (const item of pendingItems) {
                totalWaitMs += now - Date.parse(item.requestedAt);
            }

            const avgWaitSeconds =
                pendingItems.length > 0 ?
                    totalWaitMs / pendingItems.length / 1000
                :   0;

            return {
                statusCode: 200,
                body: {
                    queueDepth: allItems.length,
                    pendingCount: pendingItems.length,
                    avgWaitSeconds: Math.round(avgWaitSeconds * 100) / 100,
                    errorCount: this.metrics.getErrorCount(),
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to get queue stats.');
        }
    }

    bulkTriage(
        subjectUris: string[],
        action: ModerationPolicyAction,
        actorDid: string,
        reason: string,
    ): ModerationServiceResult {
        try {
            const results: Array<{ subjectUri: string; success: boolean; error?: string }> = [];

            for (const subjectUri of subjectUris) {
                try {
                    const result = this.applyPolicyFromParams(
                        new URLSearchParams({
                            subjectUri,
                            actorDid,
                            action,
                            reason,
                        }),
                    );
                    results.push({
                        subjectUri,
                        success: result.statusCode === 200,
                        error: result.statusCode !== 200 ? 'Action failed' : undefined,
                    });
                } catch {
                    results.push({ subjectUri, success: false, error: 'Unexpected error' });
                }
            }

            return {
                statusCode: 200,
                body: {
                    processed: results.length,
                    succeeded: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length,
                    results,
                },
            };
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to perform bulk triage.');
        }
    }

    escalateItem(
        subjectUri: string,
        actorDid: string,
        reason: string,
    ): ModerationServiceResult {
        try {
            // Verify the item exists by getting its state
            const stateResult = this.getStateFromParams(
                new URLSearchParams({ subjectUri }),
            );
            if (stateResult.statusCode === 404) {
                return stateResult;
            }

            // Record escalation as an audit trail entry via open-appeal action
            // if the item is not already in an appeal state, escalate to appeal
            const item = (stateResult.body as { item: { appealState: string } }).item;

            if (item.appealState === 'none') {
                return this.applyPolicyFromParams(
                    new URLSearchParams({
                        subjectUri,
                        actorDid,
                        action: 'open-appeal',
                        reason: `[ESCALATION] ${reason}`,
                    }),
                );
            }

            if (item.appealState === 'pending') {
                return this.applyPolicyFromParams(
                    new URLSearchParams({
                        subjectUri,
                        actorDid,
                        action: 'start-appeal-review',
                        reason: `[ESCALATION] ${reason}`,
                    }),
                );
            }

            // Already under review or resolved; return current state
            return stateResult;
        } catch (error) {
            this.metrics.recordError();
            return toErrorResult(error, 'Failed to escalate item.');
        }
    }
}

export const createFixtureModerationWorkerService = (
    options?: ModerationWorkerServiceOptions,
): ModerationWorkerService => {
    return new ModerationWorkerService(options);
};
