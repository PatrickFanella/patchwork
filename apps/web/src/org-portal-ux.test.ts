import { describe, expect, it } from 'vitest';
import type {
    OrgMember,
    OrgPerformanceMetrics,
    OrgProfile,
    OrgServiceListing,
} from '@patchwork/shared';
import {
    canPerformAction,
    toMemberRow,
    toMetricsSummary,
    toOrgDashboard,
    toServiceCard,
} from './org-portal-ux.js';

const OWNER_DID = 'did:example:owner';
const NOW = '2026-03-01T00:00:00.000Z';

const makeOrg = (overrides: Partial<OrgProfile> = {}): OrgProfile => ({
    orgDid: 'did:org:test',
    name: 'Test Org',
    description: 'A test organisation',
    members: [
        {
            did: OWNER_DID,
            handle: 'owner',
            role: 'owner',
            joinedAt: NOW,
            invitedBy: OWNER_DID,
        },
    ],
    services: [],
    createdAt: NOW,
    ...overrides,
});

const makeMember = (overrides: Partial<OrgMember> = {}): OrgMember => ({
    did: 'did:example:member',
    handle: 'member-handle',
    role: 'member',
    joinedAt: NOW,
    invitedBy: OWNER_DID,
    ...overrides,
});

const makeService = (overrides: Partial<OrgServiceListing> = {}): OrgServiceListing => ({
    serviceId: 'svc-1',
    name: 'Food Bank',
    category: 'food',
    status: 'active',
    capacity: 100,
    constraints: null,
    ...overrides,
});

const makeMetrics = (overrides: Partial<OrgPerformanceMetrics> = {}): OrgPerformanceMetrics => ({
    requestsHandled: 42,
    avgResponseTimeMs: 350,
    activeVolunteers: 5,
    satisfactionRate: 0.95,
    ...overrides,
});

// ---------------------------------------------------------------------------
// canPerformAction
// ---------------------------------------------------------------------------

describe('canPerformAction', () => {
    it('owner can perform all actions', () => {
        expect(canPerformAction('owner', 'invite_member')).toBe(true);
        expect(canPerformAction('owner', 'remove_member')).toBe(true);
        expect(canPerformAction('owner', 'change_role')).toBe(true);
        expect(canPerformAction('owner', 'upsert_service')).toBe(true);
        expect(canPerformAction('owner', 'change_service_status')).toBe(true);
        expect(canPerformAction('owner', 'view_audit')).toBe(true);
        expect(canPerformAction('owner', 'view_metrics')).toBe(true);
    });

    it('admin can perform all actions', () => {
        expect(canPerformAction('admin', 'invite_member')).toBe(true);
        expect(canPerformAction('admin', 'remove_member')).toBe(true);
        expect(canPerformAction('admin', 'view_audit')).toBe(true);
    });

    it('member can only view', () => {
        expect(canPerformAction('member', 'invite_member')).toBe(false);
        expect(canPerformAction('member', 'remove_member')).toBe(false);
        expect(canPerformAction('member', 'view_audit')).toBe(true);
        expect(canPerformAction('member', 'view_metrics')).toBe(true);
    });

    it('viewer can only view', () => {
        expect(canPerformAction('viewer', 'invite_member')).toBe(false);
        expect(canPerformAction('viewer', 'upsert_service')).toBe(false);
        expect(canPerformAction('viewer', 'view_audit')).toBe(true);
        expect(canPerformAction('viewer', 'view_metrics')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// toMemberRow
// ---------------------------------------------------------------------------

describe('toMemberRow', () => {
    it('returns a member row with correct role badge', () => {
        const row = toMemberRow(makeMember(), 'admin');
        expect(row.handle).toBe('member-handle');
        expect(row.roleBadge).toBe('Member');
        expect(row.canPromote).toBe(true);
        expect(row.canRemove).toBe(true);
    });

    it('shows correct badge for each role', () => {
        expect(toMemberRow(makeMember({ role: 'owner' }), 'owner').roleBadge).toBe('Owner');
        expect(toMemberRow(makeMember({ role: 'admin' }), 'owner').roleBadge).toBe('Admin');
        expect(toMemberRow(makeMember({ role: 'viewer' }), 'owner').roleBadge).toBe('Viewer');
    });

    it('disables promote/remove for owner member', () => {
        const row = toMemberRow(makeMember({ role: 'owner' }), 'admin');
        expect(row.canPromote).toBe(false);
        expect(row.canRemove).toBe(false);
    });

    it('disables actions when actor is not admin', () => {
        const row = toMemberRow(makeMember(), 'member');
        expect(row.canPromote).toBe(false);
        expect(row.canRemove).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// toServiceCard
// ---------------------------------------------------------------------------

describe('toServiceCard', () => {
    it('returns green indicator for active service', () => {
        const card = toServiceCard(makeService({ status: 'active' }), 'admin');
        expect(card.statusIndicator).toBe('green');
        expect(card.canEdit).toBe(true);
    });

    it('returns yellow indicator for paused service', () => {
        const card = toServiceCard(makeService({ status: 'paused' }), 'admin');
        expect(card.statusIndicator).toBe('yellow');
    });

    it('returns red indicator for discontinued service', () => {
        const card = toServiceCard(makeService({ status: 'discontinued' }), 'admin');
        expect(card.statusIndicator).toBe('red');
    });

    it('disables editing for non-admin', () => {
        const card = toServiceCard(makeService(), 'viewer');
        expect(card.canEdit).toBe(false);
    });

    it('includes capacity and constraints', () => {
        const card = toServiceCard(
            makeService({ capacity: 50, constraints: 'weekdays only' }),
            'admin',
        );
        expect(card.capacity).toBe(50);
        expect(card.constraints).toBe('weekdays only');
    });
});

// ---------------------------------------------------------------------------
// toMetricsSummary
// ---------------------------------------------------------------------------

describe('toMetricsSummary', () => {
    it('labels excellent satisfaction', () => {
        const summary = toMetricsSummary(makeMetrics({ satisfactionRate: 0.95 }));
        expect(summary.satisfactionLabel).toBe('Excellent');
    });

    it('labels good satisfaction', () => {
        const summary = toMetricsSummary(makeMetrics({ satisfactionRate: 0.75 }));
        expect(summary.satisfactionLabel).toBe('Good');
    });

    it('labels fair satisfaction', () => {
        const summary = toMetricsSummary(makeMetrics({ satisfactionRate: 0.55 }));
        expect(summary.satisfactionLabel).toBe('Fair');
    });

    it('labels needs improvement for low satisfaction', () => {
        const summary = toMetricsSummary(makeMetrics({ satisfactionRate: 0.3 }));
        expect(summary.satisfactionLabel).toBe('Needs improvement');
    });

    it('identifies good response trend', () => {
        const summary = toMetricsSummary(makeMetrics({ avgResponseTimeMs: 200 }));
        expect(summary.responseTrend).toBe('good');
    });

    it('identifies acceptable response trend', () => {
        const summary = toMetricsSummary(makeMetrics({ avgResponseTimeMs: 1500 }));
        expect(summary.responseTrend).toBe('acceptable');
    });

    it('identifies slow response trend', () => {
        const summary = toMetricsSummary(makeMetrics({ avgResponseTimeMs: 5000 }));
        expect(summary.responseTrend).toBe('slow');
    });
});

// ---------------------------------------------------------------------------
// toOrgDashboard
// ---------------------------------------------------------------------------

describe('toOrgDashboard', () => {
    it('builds a complete dashboard view model', () => {
        const org = makeOrg({
            members: [
                makeMember({ did: OWNER_DID, handle: 'owner', role: 'owner' }),
                makeMember({ did: 'did:example:member-a', handle: 'alice', role: 'member' }),
            ],
            services: [makeService()],
        });

        const dashboard = toOrgDashboard(org, 'owner', makeMetrics());
        expect(dashboard.name).toBe('Test Org');
        expect(dashboard.memberCount).toBe(2);
        expect(dashboard.memberRows).toHaveLength(2);
        expect(dashboard.serviceCards).toHaveLength(1);
        expect(dashboard.metricsSummary).not.toBeNull();
        expect(dashboard.metricsSummary!.satisfactionLabel).toBe('Excellent');
    });

    it('returns null metrics when none provided', () => {
        const dashboard = toOrgDashboard(makeOrg(), 'owner');
        expect(dashboard.metricsSummary).toBeNull();
    });

    it('reflects actor role in member row actions', () => {
        const org = makeOrg({
            members: [
                makeMember({ did: OWNER_DID, handle: 'owner', role: 'owner' }),
                makeMember({ did: 'did:example:member-a', handle: 'alice', role: 'member' }),
            ],
        });

        const viewerDashboard = toOrgDashboard(org, 'viewer');
        expect(viewerDashboard.memberRows[1]!.canPromote).toBe(false);
        expect(viewerDashboard.memberRows[1]!.canRemove).toBe(false);

        const adminDashboard = toOrgDashboard(org, 'admin');
        expect(adminDashboard.memberRows[1]!.canPromote).toBe(true);
        expect(adminDashboard.memberRows[1]!.canRemove).toBe(true);
    });
});
