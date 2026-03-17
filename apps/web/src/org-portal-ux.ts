import {
    type OrgMember,
    type OrgPerformanceMetrics,
    type OrgProfile,
    type OrgRole,
    type OrgServiceListing,
    ORG_ROLE_RANK,
} from '@patchwork/shared';

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export type OrgAdminAction =
    | 'invite_member'
    | 'remove_member'
    | 'change_role'
    | 'upsert_service'
    | 'change_service_status'
    | 'view_audit'
    | 'view_metrics';

const VIEWER_ACTIONS: ReadonlySet<OrgAdminAction> = new Set([
    'view_audit',
    'view_metrics',
]);

/**
 * Determines whether the given actor role is allowed to perform the action.
 * Owners and admins can do everything; members can view; viewers can only view.
 */
export const canPerformAction = (
    actorRole: OrgRole,
    action: OrgAdminAction,
): boolean => {
    if (ORG_ROLE_RANK[actorRole] >= ORG_ROLE_RANK['admin']) {
        return true; // owner + admin can do everything
    }
    if (ORG_ROLE_RANK[actorRole] >= ORG_ROLE_RANK['member']) {
        return VIEWER_ACTIONS.has(action); // members can view
    }
    // viewer
    return VIEWER_ACTIONS.has(action);
};

// ---------------------------------------------------------------------------
// Member row view model
// ---------------------------------------------------------------------------

export interface OrgMemberRow {
    did: string;
    handle: string;
    role: OrgRole;
    roleBadge: string;
    joinedAt: string;
    canPromote: boolean;
    canRemove: boolean;
}

export const toMemberRow = (
    member: OrgMember,
    actorRole: OrgRole,
): OrgMemberRow => {
    const isAdmin = ORG_ROLE_RANK[actorRole] >= ORG_ROLE_RANK['admin'];
    return {
        did: member.did,
        handle: member.handle,
        role: member.role,
        roleBadge: ROLE_BADGE_MAP[member.role],
        joinedAt: member.joinedAt,
        canPromote: isAdmin && member.role !== 'owner',
        canRemove: isAdmin && member.role !== 'owner',
    };
};

const ROLE_BADGE_MAP: Record<OrgRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
};

// ---------------------------------------------------------------------------
// Service card view model
// ---------------------------------------------------------------------------

export interface OrgServiceCard {
    serviceId: string;
    name: string;
    category: string;
    status: OrgServiceListing['status'];
    statusIndicator: 'green' | 'yellow' | 'red';
    capacity: number | null;
    constraints: string | null;
    canEdit: boolean;
}

export const toServiceCard = (
    listing: OrgServiceListing,
    actorRole: OrgRole,
): OrgServiceCard => {
    const statusIndicator =
        listing.status === 'active' ? 'green'
        : listing.status === 'paused' ? 'yellow'
        : 'red';

    return {
        serviceId: listing.serviceId,
        name: listing.name,
        category: listing.category,
        status: listing.status,
        statusIndicator,
        capacity: listing.capacity,
        constraints: listing.constraints,
        canEdit: ORG_ROLE_RANK[actorRole] >= ORG_ROLE_RANK['admin'],
    };
};

// ---------------------------------------------------------------------------
// Metrics summary view model
// ---------------------------------------------------------------------------

export interface OrgMetricsSummary {
    requestsHandled: number;
    avgResponseTimeMs: number;
    activeVolunteers: number;
    satisfactionRate: number;
    satisfactionLabel: string;
    responseTrend: 'good' | 'acceptable' | 'slow';
}

export const toMetricsSummary = (
    metrics: OrgPerformanceMetrics,
): OrgMetricsSummary => {
    const satisfactionLabel =
        metrics.satisfactionRate >= 0.9 ? 'Excellent'
        : metrics.satisfactionRate >= 0.7 ? 'Good'
        : metrics.satisfactionRate >= 0.5 ? 'Fair'
        : 'Needs improvement';

    const responseTrend: OrgMetricsSummary['responseTrend'] =
        metrics.avgResponseTimeMs <= 500 ? 'good'
        : metrics.avgResponseTimeMs <= 2000 ? 'acceptable'
        : 'slow';

    return {
        requestsHandled: metrics.requestsHandled,
        avgResponseTimeMs: metrics.avgResponseTimeMs,
        activeVolunteers: metrics.activeVolunteers,
        satisfactionRate: metrics.satisfactionRate,
        satisfactionLabel,
        responseTrend,
    };
};

// ---------------------------------------------------------------------------
// Org dashboard view model
// ---------------------------------------------------------------------------

export interface OrgDashboardViewModel {
    orgDid: string;
    name: string;
    description: string;
    memberCount: number;
    memberRows: OrgMemberRow[];
    serviceCards: OrgServiceCard[];
    metricsSummary: OrgMetricsSummary | null;
}

export const toOrgDashboard = (
    org: OrgProfile,
    actorRole: OrgRole,
    metrics: OrgPerformanceMetrics | null = null,
): OrgDashboardViewModel => ({
    orgDid: org.orgDid,
    name: org.name,
    description: org.description,
    memberCount: org.members.length,
    memberRows: org.members.map(m => toMemberRow(m, actorRole)),
    serviceCards: org.services.map(s => toServiceCard(s, actorRole)),
    metricsSummary: metrics ? toMetricsSummary(metrics) : null,
});
