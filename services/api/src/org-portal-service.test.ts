import { describe, expect, it, beforeEach } from 'vitest';
import { OrgPortalService } from './org-portal-service.js';

const OWNER_DID = 'did:example:owner';
const ADMIN_DID = 'did:example:admin';
const MEMBER_DID = 'did:example:member';
const VIEWER_DID = 'did:example:viewer';
const ORG_NAME = 'Test Org';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

/** Helper: create an org and return its orgDid. */
const setupOrg = (service: OrgPortalService): string => {
    const result = service.createOrg(
        toParams({ ownerDid: OWNER_DID, name: ORG_NAME, handle: 'owner-handle' }),
    );
    const body = result.body as { org: { orgDid: string } };
    return body.org.orgDid;
};

describe('OrgPortalService', () => {
    let service: OrgPortalService;

    beforeEach(() => {
        service = new OrgPortalService();
    });

    // -------------------------------------------------------------------
    // Create org
    // -------------------------------------------------------------------

    describe('createOrg', () => {
        it('creates an org with the owner as first member', () => {
            const result = service.createOrg(
                toParams({ ownerDid: OWNER_DID, name: ORG_NAME, handle: 'owner-handle' }),
            );
            expect(result.statusCode).toBe(201);
            const body = result.body as { org: { orgDid: string; members: Array<{ role: string }> } };
            expect(body.org.orgDid).toBeDefined();
            expect(body.org.members).toHaveLength(1);
            expect(body.org.members[0]!.role).toBe('owner');
        });

        it('rejects creation with missing fields', () => {
            const result = service.createOrg(toParams({ ownerDid: OWNER_DID }));
            expect(result.statusCode).toBe(400);
        });

        it('rejects duplicate org', () => {
            service.createOrg(
                toParams({ ownerDid: OWNER_DID, name: ORG_NAME }),
            );
            const result = service.createOrg(
                toParams({ ownerDid: OWNER_DID, name: ORG_NAME }),
            );
            expect(result.statusCode).toBe(409);
        });
    });

    // -------------------------------------------------------------------
    // Get org
    // -------------------------------------------------------------------

    describe('getOrg', () => {
        it('returns the org profile', () => {
            const orgDid = setupOrg(service);
            const result = service.getOrg(toParams({ orgDid }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { org: { name: string } };
            expect(body.org.name).toBe(ORG_NAME);
        });

        it('returns 404 for unknown org', () => {
            const result = service.getOrg(toParams({ orgDid: 'did:org:nope' }));
            expect(result.statusCode).toBe(404);
        });

        it('returns 400 without orgDid', () => {
            const result = service.getOrg(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Invite member
    // -------------------------------------------------------------------

    describe('inviteMember', () => {
        it('invites a new member with admin actor', () => {
            const orgDid = setupOrg(service);
            const result = service.inviteMember(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    memberDid: MEMBER_DID,
                    role: 'member',
                    handle: 'member-handle',
                }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { did: string; role: string } };
            expect(body.member.did).toBe(MEMBER_DID);
            expect(body.member.role).toBe('member');
        });

        it('rejects invite from member (insufficient role)', () => {
            const orgDid = setupOrg(service);
            // Add a member first
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            // Member tries to invite
            const result = service.inviteMember(
                toParams({ orgDid, actorDid: MEMBER_DID, memberDid: VIEWER_DID, role: 'viewer' }),
            );
            expect(result.statusCode).toBe(403);
        });

        it('rejects invite as owner', () => {
            const orgDid = setupOrg(service);
            const result = service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'owner' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects duplicate member', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            expect(result.statusCode).toBe(409);
        });

        it('rejects invite with missing fields', () => {
            const result = service.inviteMember(toParams({ orgDid: 'did:org:x' }));
            expect(result.statusCode).toBe(400);
        });

        it('rejects invite with invalid role', () => {
            const orgDid = setupOrg(service);
            const result = service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'superadmin' }),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Remove member
    // -------------------------------------------------------------------

    describe('removeMember', () => {
        it('removes a member', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.removeMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID }),
            );
            expect(result.statusCode).toBe(200);

            // Verify member was removed
            const members = service.listMembers(toParams({ orgDid }));
            const body = members.body as { members: Array<{ did: string }> };
            expect(body.members).toHaveLength(1); // only owner remains
        });

        it('cannot remove the owner', () => {
            const orgDid = setupOrg(service);
            const result = service.removeMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: OWNER_DID }),
            );
            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('CANNOT_REMOVE_OWNER');
        });

        it('returns 404 for unknown member', () => {
            const orgDid = setupOrg(service);
            const result = service.removeMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: 'did:example:ghost' }),
            );
            expect(result.statusCode).toBe(404);
        });

        it('rejects removal with missing fields', () => {
            const result = service.removeMember(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Update member role
    // -------------------------------------------------------------------

    describe('updateMemberRole', () => {
        it('promotes a member to admin', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'admin' }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { member: { role: string } };
            expect(body.member.role).toBe('admin');
        });

        it('cannot change owner role', () => {
            const orgDid = setupOrg(service);
            const result = service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: OWNER_DID, role: 'admin' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('cannot promote to owner', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'owner' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects with missing fields', () => {
            const result = service.updateMemberRole(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('rejects invalid role value', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'boss' }),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // List members
    // -------------------------------------------------------------------

    describe('listMembers', () => {
        it('lists all members', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.listMembers(toParams({ orgDid }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { members: unknown[] };
            expect(body.members).toHaveLength(2);
        });

        it('returns 404 for unknown org', () => {
            const result = service.listMembers(toParams({ orgDid: 'did:org:nope' }));
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Upsert service listing
    // -------------------------------------------------------------------

    describe('upsertServiceListing', () => {
        it('creates a service listing', () => {
            const orgDid = setupOrg(service);
            const result = service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                    status: 'active',
                    capacity: '100',
                }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { service: { serviceId: string; name: string } };
            expect(body.service.serviceId).toBe('svc-1');
        });

        it('updates an existing service listing', () => {
            const orgDid = setupOrg(service);
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                }),
            );
            const result = service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Updated Food Bank',
                    category: 'food',
                }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { service: { name: string } };
            expect(body.service.name).toBe('Updated Food Bank');

            // Verify only one service exists
            const list = service.listServices(toParams({ orgDid }));
            const listBody = list.body as { services: unknown[] };
            expect(listBody.services).toHaveLength(1);
        });

        it('rejects with missing fields', () => {
            const result = service.upsertServiceListing(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('rejects when actor lacks admin role', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: VIEWER_DID, role: 'viewer' }),
            );
            const result = service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: VIEWER_DID,
                    serviceId: 'svc-1',
                    name: 'Meals',
                    category: 'food',
                }),
            );
            expect(result.statusCode).toBe(403);
        });
    });

    // -------------------------------------------------------------------
    // Update service status
    // -------------------------------------------------------------------

    describe('updateServiceStatus', () => {
        it('changes a service status', () => {
            const orgDid = setupOrg(service);
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                }),
            );
            const result = service.updateServiceStatus(
                toParams({ orgDid, actorDid: OWNER_DID, serviceId: 'svc-1', status: 'paused' }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { service: { status: string } };
            expect(body.service.status).toBe('paused');
        });

        it('returns 404 for unknown service', () => {
            const orgDid = setupOrg(service);
            const result = service.updateServiceStatus(
                toParams({ orgDid, actorDid: OWNER_DID, serviceId: 'svc-nope', status: 'paused' }),
            );
            expect(result.statusCode).toBe(404);
        });

        it('rejects invalid status', () => {
            const orgDid = setupOrg(service);
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                }),
            );
            const result = service.updateServiceStatus(
                toParams({ orgDid, actorDid: OWNER_DID, serviceId: 'svc-1', status: 'removed' }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects with missing fields', () => {
            const result = service.updateServiceStatus(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // List services
    // -------------------------------------------------------------------

    describe('listServices', () => {
        it('lists all services', () => {
            const orgDid = setupOrg(service);
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                }),
            );
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-2',
                    name: 'Shelter',
                    category: 'shelter',
                }),
            );
            const result = service.listServices(toParams({ orgDid }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { services: unknown[] };
            expect(body.services).toHaveLength(2);
        });

        it('returns 404 for unknown org', () => {
            const result = service.listServices(toParams({ orgDid: 'did:org:nope' }));
            expect(result.statusCode).toBe(404);
        });
    });

    // -------------------------------------------------------------------
    // Audit trail
    // -------------------------------------------------------------------

    describe('getAuditTrail', () => {
        it('returns audit trail for org', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            const result = service.getAuditTrail(toParams({ orgDid }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { entries: Array<{ action: string }> };
            // org_created + member_invited
            expect(body.entries).toHaveLength(2);
            expect(body.entries[0]!.action).toBe('org_created');
            expect(body.entries[1]!.action).toBe('member_invited');
        });

        it('returns empty trail for unknown org', () => {
            const result = service.getAuditTrail(toParams({ orgDid: 'did:org:nope' }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { entries: unknown[] };
            expect(body.entries).toHaveLength(0);
        });

        it('records all mutation actions', () => {
            const orgDid = setupOrg(service);
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'member' }),
            );
            service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'admin' }),
            );
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: OWNER_DID,
                    serviceId: 'svc-1',
                    name: 'Food Bank',
                    category: 'food',
                }),
            );
            service.updateServiceStatus(
                toParams({ orgDid, actorDid: OWNER_DID, serviceId: 'svc-1', status: 'paused' }),
            );
            service.removeMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID }),
            );

            const result = service.getAuditTrail(toParams({ orgDid }));
            const body = result.body as { entries: Array<{ action: string }> };
            expect(body.entries.map(e => e.action)).toEqual([
                'org_created',
                'member_invited',
                'member_role_changed',
                'service_upserted',
                'service_status_changed',
                'member_removed',
            ]);
        });

        it('returns 400 without orgDid', () => {
            const result = service.getAuditTrail(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Performance metrics
    // -------------------------------------------------------------------

    describe('getPerformanceMetrics', () => {
        it('returns default metrics after org creation', () => {
            const orgDid = setupOrg(service);
            const result = service.getPerformanceMetrics(toParams({ orgDid }));
            expect(result.statusCode).toBe(200);
            const body = result.body as { metrics: { requestsHandled: number; satisfactionRate: number } };
            expect(body.metrics.requestsHandled).toBe(0);
            expect(body.metrics.satisfactionRate).toBe(1);
        });

        it('returns 404 for unknown org', () => {
            const result = service.getPerformanceMetrics(toParams({ orgDid: 'did:org:nope' }));
            expect(result.statusCode).toBe(404);
        });

        it('returns 400 without orgDid', () => {
            const result = service.getPerformanceMetrics(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Full lifecycle
    // -------------------------------------------------------------------

    describe('full org lifecycle', () => {
        it('creates org, manages members and services, verifies audit', () => {
            // 1. Create org
            const orgDid = setupOrg(service);

            // 2. Invite admin
            service.inviteMember(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: ADMIN_DID, role: 'admin' }),
            );

            // 3. Admin invites member
            service.inviteMember(
                toParams({ orgDid, actorDid: ADMIN_DID, memberDid: MEMBER_DID, role: 'member' }),
            );

            // 4. Admin creates service
            service.upsertServiceListing(
                toParams({
                    orgDid,
                    actorDid: ADMIN_DID,
                    serviceId: 'svc-food',
                    name: 'Food Bank',
                    category: 'food',
                    capacity: '50',
                }),
            );

            // 5. Admin pauses service
            service.updateServiceStatus(
                toParams({ orgDid, actorDid: ADMIN_DID, serviceId: 'svc-food', status: 'paused' }),
            );

            // 6. Owner promotes member to admin
            service.updateMemberRole(
                toParams({ orgDid, actorDid: OWNER_DID, memberDid: MEMBER_DID, role: 'admin' }),
            );

            // Verify final state
            const orgResult = service.getOrg(toParams({ orgDid }));
            const orgBody = orgResult.body as { org: { members: Array<{ role: string }>; services: Array<{ status: string }> } };
            expect(orgBody.org.members).toHaveLength(3);
            expect(orgBody.org.services).toHaveLength(1);
            expect(orgBody.org.services[0]!.status).toBe('paused');

            // Verify audit trail completeness
            const auditResult = service.getAuditTrail(toParams({ orgDid }));
            const auditBody = auditResult.body as { entries: Array<{ action: string }> };
            expect(auditBody.entries).toHaveLength(6);
        });
    });
});
