import type {
    ModerationAuditRecord,
    ModerationPolicyAction,
    ModerationQueueItem,
    ModerationQueueStatus,
    ModerationVisibilityState,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Moderator roles and permissions
// ---------------------------------------------------------------------------

export type ModeratorRole = 'junior_mod' | 'senior_mod' | 'lead_mod' | 'admin';

export type ModeratorAction =
    | 'view_queue'
    | 'triage'
    | 'policy_action'
    | 'escalation_review'
    | 'bulk_action'
    | 'manage_moderators';

const ROLE_PERMISSIONS: Readonly<Record<ModeratorRole, readonly ModeratorAction[]>> = {
    junior_mod: ['view_queue', 'triage'],
    senior_mod: ['view_queue', 'triage', 'policy_action'],
    lead_mod: ['view_queue', 'triage', 'policy_action', 'escalation_review', 'bulk_action'],
    admin: ['view_queue', 'triage', 'policy_action', 'escalation_review', 'bulk_action', 'manage_moderators'],
};

export interface ModeratorPermissions {
    role: ModeratorRole;
    allowed: readonly ModeratorAction[];
}

export const getPermissions = (role: ModeratorRole): ModeratorPermissions => ({
    role,
    allowed: ROLE_PERMISSIONS[role],
});

export const canPerformModAction = (
    role: ModeratorRole,
    action: ModeratorAction,
): boolean => {
    return ROLE_PERMISSIONS[role].includes(action);
};

// ---------------------------------------------------------------------------
// Queue triage view model
// ---------------------------------------------------------------------------

export type QueueSortField = 'updatedAt' | 'reportCount' | 'createdAt';

export interface QueueTriageFilters {
    status?: ModerationQueueStatus;
    priority?: 'high' | 'normal';
    category?: string;
    searchText?: string;
}

export interface QueueTriageViewModel {
    items: readonly ModerationQueueItem[];
    filters: QueueTriageFilters;
    sortField: QueueSortField;
    totalCount: number;
    selectedIds: readonly string[];
}

const isHighPriority = (item: ModerationQueueItem): boolean =>
    item.reportCount >= 3 ||
    item.visibility === 'suspended' ||
    item.appealState === 'pending' ||
    item.appealState === 'under-review';

export const toQueueTriageView = (
    items: readonly ModerationQueueItem[],
    filters: QueueTriageFilters,
    _role: ModeratorRole,
    sortField: QueueSortField = 'updatedAt',
): QueueTriageViewModel => {
    let filtered = [...items];

    if (filters.status) {
        filtered = filtered.filter(item => item.queueStatus === filters.status);
    }

    if (filters.priority === 'high') {
        filtered = filtered.filter(isHighPriority);
    } else if (filters.priority === 'normal') {
        filtered = filtered.filter(item => !isHighPriority(item));
    }

    if (filters.category) {
        filtered = filtered.filter(item => item.subjectType === filters.category);
    }

    if (filters.searchText) {
        const needle = filters.searchText.toLowerCase();
        filtered = filtered.filter(
            item =>
                item.subjectUri.toLowerCase().includes(needle) ||
                item.latestReason.toLowerCase().includes(needle),
        );
    }

    filtered.sort((left, right) => {
        if (sortField === 'reportCount') {
            return right.reportCount - left.reportCount;
        }
        if (sortField === 'createdAt') {
            return Date.parse(right.createdAt) - Date.parse(left.createdAt);
        }
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });

    return {
        items: filtered,
        filters,
        sortField,
        totalCount: filtered.length,
        selectedIds: [],
    };
};

// ---------------------------------------------------------------------------
// Policy action view model
// ---------------------------------------------------------------------------

export interface PolicyActionViewModel {
    subjectUri: string;
    availableActions: readonly ModerationPolicyAction[];
    canEscalate: boolean;
    requiresReason: boolean;
}

const JUNIOR_ACTIONS: readonly ModerationPolicyAction[] = [];
const SENIOR_ACTIONS: readonly ModerationPolicyAction[] = [
    'delist',
    'suspend-visibility',
    'restore-visibility',
];
const LEAD_ACTIONS: readonly ModerationPolicyAction[] = [
    ...SENIOR_ACTIONS,
    'open-appeal',
    'start-appeal-review',
    'resolve-appeal-upheld',
    'resolve-appeal-rejected',
];

const actionsForRole = (role: ModeratorRole): readonly ModerationPolicyAction[] => {
    switch (role) {
        case 'junior_mod':
            return JUNIOR_ACTIONS;
        case 'senior_mod':
            return SENIOR_ACTIONS;
        case 'lead_mod':
        case 'admin':
            return LEAD_ACTIONS;
    }
};

export const toPolicyActionView = (
    item: ModerationQueueItem,
    role: ModeratorRole,
): PolicyActionViewModel => ({
    subjectUri: item.subjectUri,
    availableActions: actionsForRole(role),
    canEscalate: role === 'junior_mod' || role === 'senior_mod',
    requiresReason: true,
});

// ---------------------------------------------------------------------------
// Audit timeline view model
// ---------------------------------------------------------------------------

export interface AuditTimelineEntry {
    actionId: string;
    action: ModerationPolicyAction;
    actorDid: string;
    reason: string;
    occurredAt: string;
    previousVisibility: ModerationVisibilityState;
    nextVisibility: ModerationVisibilityState;
}

export interface AuditTimelineViewModel {
    subjectUri: string | undefined;
    entries: readonly AuditTimelineEntry[];
    totalCount: number;
}

export const toAuditTimeline = (
    records: readonly ModerationAuditRecord[],
    subjectUri?: string,
): AuditTimelineViewModel => {
    const sorted = [...records].sort(
        (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
    );

    const entries: AuditTimelineEntry[] = sorted.map(record => ({
        actionId: record.actionId,
        action: record.action,
        actorDid: record.actorDid,
        reason: record.reason,
        occurredAt: record.occurredAt,
        previousVisibility: record.previousState.visibility,
        nextVisibility: record.nextState.visibility,
    }));

    return {
        subjectUri,
        entries,
        totalCount: entries.length,
    };
};

// ---------------------------------------------------------------------------
// Top-level moderation console view model
// ---------------------------------------------------------------------------

export interface QueueStats {
    queueDepth: number;
    pendingCount: number;
    avgWaitSeconds: number;
    errorCount: number;
}

export interface ModConsoleViewModel {
    stats: QueueStats;
    triage: QueueTriageViewModel;
    selectedItemAudit: AuditTimelineViewModel | null;
    role: ModeratorRole;
    permissions: ModeratorPermissions;
}

export const toModConsoleView = (
    queueItems: readonly ModerationQueueItem[],
    auditRecords: readonly ModerationAuditRecord[],
    stats: QueueStats,
    role: ModeratorRole,
    filters: QueueTriageFilters = {},
): ModConsoleViewModel => {
    const triage = toQueueTriageView(queueItems, filters, role);

    const firstItem = triage.items[0];
    const selectedItemAudit =
        firstItem ?
            toAuditTimeline(
                auditRecords.filter(record => record.subjectUri === firstItem.subjectUri),
                firstItem.subjectUri,
            )
        :   null;

    return {
        stats,
        triage,
        selectedItemAudit,
        role,
        permissions: getPermissions(role),
    };
};
