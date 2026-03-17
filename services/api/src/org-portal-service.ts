import {
    type OrgAuditAction,
    type OrgAuditEntry,
    type OrgMember,
    type OrgPerformanceMetrics,
    type OrgProfile,
    type OrgRole,
    type OrgServiceListing,
    type OrgServiceStatus,
    ORG_ROLE_RANK,
    orgRoleSchema,
    orgServiceListingSchema,
    orgServiceStatusSchema,
} from '@patchwork/shared';

export interface OrgPortalRouteResult {
    statusCode: number;
    body: unknown;
}

/**
 * In-memory organisation portal service that manages org profiles, members,
 * service listings, audit trails, and performance metrics.
 */
export class OrgPortalService {
    private readonly orgs = new Map<string, OrgProfile>();
    private readonly auditTrails = new Map<string, OrgAuditEntry[]>();
    private readonly metrics = new Map<string, OrgPerformanceMetrics>();

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    private requireRole(
        orgDid: string,
        actorDid: string,
        minRole: OrgRole,
    ): OrgPortalRouteResult | null {
        const org = this.orgs.get(orgDid);
        if (!org) {
            return {
                statusCode: 404,
                body: { error: { code: 'ORG_NOT_FOUND', message: 'Organisation not found.' } },
            };
        }
        const actor = org.members.find(m => m.did === actorDid);
        if (!actor || ORG_ROLE_RANK[actor.role] < ORG_ROLE_RANK[minRole]) {
            return {
                statusCode: 403,
                body: { error: { code: 'INSUFFICIENT_ROLE', message: `Requires at least "${minRole}" role.` } },
            };
        }
        return null;
    }

    private appendAudit(
        orgDid: string,
        action: OrgAuditAction,
        actor: string,
        target: string,
        details: string,
    ): void {
        const entry: OrgAuditEntry = {
            action,
            actor,
            target,
            timestamp: new Date().toISOString(),
            details,
        };
        const trail = this.auditTrails.get(orgDid) ?? [];
        trail.push(entry);
        this.auditTrails.set(orgDid, trail);
    }

    // -------------------------------------------------------------------
    // POST /org/create
    // -------------------------------------------------------------------

    createOrg(params: URLSearchParams): OrgPortalRouteResult {
        const ownerDid = params.get('ownerDid')?.trim();
        const name = params.get('name')?.trim();
        const description = params.get('description')?.trim() ?? '';
        const handle = params.get('handle')?.trim() ?? ownerDid ?? '';

        if (!ownerDid || !name) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: ownerDid, name.' } },
            };
        }

        const orgDid = `did:org:${name.toLowerCase().replace(/\s+/g, '-')}`;

        if (this.orgs.has(orgDid)) {
            return {
                statusCode: 409,
                body: { error: { code: 'ORG_EXISTS', message: 'Organisation already exists.' } },
            };
        }

        const now = new Date().toISOString();

        const ownerMember: OrgMember = {
            did: ownerDid,
            handle,
            role: 'owner',
            joinedAt: now,
            invitedBy: ownerDid,
        };

        const org: OrgProfile = {
            orgDid,
            name,
            description,
            members: [ownerMember],
            services: [],
            createdAt: now,
        };

        this.orgs.set(orgDid, org);
        this.metrics.set(orgDid, {
            requestsHandled: 0,
            avgResponseTimeMs: 0,
            activeVolunteers: 1,
            satisfactionRate: 1,
        });

        this.appendAudit(orgDid, 'org_created', ownerDid, orgDid, `Organisation "${name}" created.`);

        return { statusCode: 201, body: { org } };
    }

    // -------------------------------------------------------------------
    // GET /org/profile
    // -------------------------------------------------------------------

    getOrg(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        if (!orgDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: orgDid.' } },
            };
        }

        const org = this.orgs.get(orgDid);
        if (!org) {
            return {
                statusCode: 404,
                body: { error: { code: 'ORG_NOT_FOUND', message: 'Organisation not found.' } },
            };
        }

        return { statusCode: 200, body: { org } };
    }

    // -------------------------------------------------------------------
    // POST /org/member/invite
    // -------------------------------------------------------------------

    inviteMember(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const memberDid = params.get('memberDid')?.trim();
        const roleRaw = params.get('role')?.trim();
        const handle = params.get('handle')?.trim() ?? memberDid ?? '';

        if (!orgDid || !actorDid || !memberDid || !roleRaw) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: orgDid, actorDid, memberDid, role.' } },
            };
        }

        const roleParse = orgRoleSchema.safeParse(roleRaw);
        if (!roleParse.success) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_ROLE', message: `Invalid role: ${roleRaw}` } },
            };
        }

        const roleCheck = this.requireRole(orgDid, actorDid, 'admin');
        if (roleCheck) return roleCheck;

        const org = this.orgs.get(orgDid)!;
        if (org.members.some(m => m.did === memberDid)) {
            return {
                statusCode: 409,
                body: { error: { code: 'ALREADY_MEMBER', message: 'User is already a member.' } },
            };
        }

        const role = roleParse.data;

        // Cannot invite as owner
        if (role === 'owner') {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_ROLE', message: 'Cannot invite as owner.' } },
            };
        }

        const newMember: OrgMember = {
            did: memberDid,
            handle,
            role,
            joinedAt: new Date().toISOString(),
            invitedBy: actorDid,
        };

        org.members.push(newMember);
        this.appendAudit(orgDid, 'member_invited', actorDid, memberDid, `Invited as ${role}.`);

        return { statusCode: 200, body: { member: newMember } };
    }

    // -------------------------------------------------------------------
    // POST /org/member/remove
    // -------------------------------------------------------------------

    removeMember(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const memberDid = params.get('memberDid')?.trim();

        if (!orgDid || !actorDid || !memberDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: orgDid, actorDid, memberDid.' } },
            };
        }

        const roleCheck = this.requireRole(orgDid, actorDid, 'admin');
        if (roleCheck) return roleCheck;

        const org = this.orgs.get(orgDid)!;
        const target = org.members.find(m => m.did === memberDid);
        if (!target) {
            return {
                statusCode: 404,
                body: { error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found in this organisation.' } },
            };
        }

        if (target.role === 'owner') {
            return {
                statusCode: 400,
                body: { error: { code: 'CANNOT_REMOVE_OWNER', message: 'Cannot remove the organisation owner.' } },
            };
        }

        org.members = org.members.filter(m => m.did !== memberDid);
        this.appendAudit(orgDid, 'member_removed', actorDid, memberDid, `Removed from organisation.`);

        return { statusCode: 200, body: { removed: memberDid } };
    }

    // -------------------------------------------------------------------
    // POST /org/member/role
    // -------------------------------------------------------------------

    updateMemberRole(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const memberDid = params.get('memberDid')?.trim();
        const newRoleRaw = params.get('role')?.trim();

        if (!orgDid || !actorDid || !memberDid || !newRoleRaw) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: orgDid, actorDid, memberDid, role.' } },
            };
        }

        const roleParse = orgRoleSchema.safeParse(newRoleRaw);
        if (!roleParse.success) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_ROLE', message: `Invalid role: ${newRoleRaw}` } },
            };
        }

        const roleCheck = this.requireRole(orgDid, actorDid, 'admin');
        if (roleCheck) return roleCheck;

        const org = this.orgs.get(orgDid)!;
        const target = org.members.find(m => m.did === memberDid);
        if (!target) {
            return {
                statusCode: 404,
                body: { error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found.' } },
            };
        }

        if (target.role === 'owner') {
            return {
                statusCode: 400,
                body: { error: { code: 'CANNOT_CHANGE_OWNER', message: 'Cannot change the owner role.' } },
            };
        }

        const newRole = roleParse.data;
        if (newRole === 'owner') {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_ROLE', message: 'Cannot promote to owner.' } },
            };
        }

        const previousRole = target.role;
        target.role = newRole;
        this.appendAudit(orgDid, 'member_role_changed', actorDid, memberDid, `Role changed from ${previousRole} to ${newRole}.`);

        return { statusCode: 200, body: { member: target } };
    }

    // -------------------------------------------------------------------
    // GET /org/members
    // -------------------------------------------------------------------

    listMembers(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        if (!orgDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: orgDid.' } },
            };
        }

        const org = this.orgs.get(orgDid);
        if (!org) {
            return {
                statusCode: 404,
                body: { error: { code: 'ORG_NOT_FOUND', message: 'Organisation not found.' } },
            };
        }

        return { statusCode: 200, body: { members: org.members } };
    }

    // -------------------------------------------------------------------
    // POST /org/service/upsert
    // -------------------------------------------------------------------

    upsertServiceListing(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const serviceId = params.get('serviceId')?.trim();
        const name = params.get('name')?.trim();
        const category = params.get('category')?.trim();
        const statusVal = params.get('status')?.trim() ?? 'active';
        const capacityRaw = params.get('capacity')?.trim();
        const constraints = params.get('constraints')?.trim() ?? null;

        if (!orgDid || !actorDid || !serviceId || !name || !category) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: orgDid, actorDid, serviceId, name, category.' } },
            };
        }

        const roleCheck = this.requireRole(orgDid, actorDid, 'admin');
        if (roleCheck) return roleCheck;

        const listing: OrgServiceListing = {
            serviceId,
            name,
            category,
            status: statusVal as OrgServiceStatus,
            capacity: capacityRaw ? parseInt(capacityRaw, 10) : null,
            constraints,
        };

        const parseListing = orgServiceListingSchema.safeParse(listing);
        if (!parseListing.success) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_LISTING', message: 'Service listing failed validation.' } },
            };
        }

        const org = this.orgs.get(orgDid)!;
        const idx = org.services.findIndex(s => s.serviceId === serviceId);
        if (idx >= 0) {
            org.services[idx] = parseListing.data;
        } else {
            org.services.push(parseListing.data);
        }

        this.appendAudit(orgDid, 'service_upserted', actorDid, serviceId, `Service "${name}" upserted.`);

        return { statusCode: 200, body: { service: parseListing.data } };
    }

    // -------------------------------------------------------------------
    // POST /org/service/status
    // -------------------------------------------------------------------

    updateServiceStatus(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const serviceId = params.get('serviceId')?.trim();
        const statusRaw = params.get('status')?.trim();

        if (!orgDid || !actorDid || !serviceId || !statusRaw) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required fields: orgDid, actorDid, serviceId, status.' } },
            };
        }

        const statusParse = orgServiceStatusSchema.safeParse(statusRaw);
        if (!statusParse.success) {
            return {
                statusCode: 400,
                body: { error: { code: 'INVALID_STATUS', message: `Invalid status: ${statusRaw}` } },
            };
        }

        const roleCheck = this.requireRole(orgDid, actorDid, 'admin');
        if (roleCheck) return roleCheck;

        const org = this.orgs.get(orgDid)!;
        const service = org.services.find(s => s.serviceId === serviceId);
        if (!service) {
            return {
                statusCode: 404,
                body: { error: { code: 'SERVICE_NOT_FOUND', message: 'Service not found.' } },
            };
        }

        const previousStatus = service.status;
        service.status = statusParse.data;
        this.appendAudit(orgDid, 'service_status_changed', actorDid, serviceId, `Status changed from ${previousStatus} to ${statusParse.data}.`);

        return { statusCode: 200, body: { service } };
    }

    // -------------------------------------------------------------------
    // GET /org/services
    // -------------------------------------------------------------------

    listServices(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        if (!orgDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: orgDid.' } },
            };
        }

        const org = this.orgs.get(orgDid);
        if (!org) {
            return {
                statusCode: 404,
                body: { error: { code: 'ORG_NOT_FOUND', message: 'Organisation not found.' } },
            };
        }

        return { statusCode: 200, body: { services: org.services } };
    }

    // -------------------------------------------------------------------
    // GET /org/audit
    // -------------------------------------------------------------------

    getAuditTrail(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        if (!orgDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: orgDid.' } },
            };
        }

        const trail = this.auditTrails.get(orgDid) ?? [];
        return { statusCode: 200, body: { orgDid, entries: trail } };
    }

    // -------------------------------------------------------------------
    // GET /org/metrics
    // -------------------------------------------------------------------

    getPerformanceMetrics(params: URLSearchParams): OrgPortalRouteResult {
        const orgDid = params.get('orgDid')?.trim();
        if (!orgDid) {
            return {
                statusCode: 400,
                body: { error: { code: 'MISSING_FIELDS', message: 'Required field: orgDid.' } },
            };
        }

        const m = this.metrics.get(orgDid);
        if (!m) {
            return {
                statusCode: 404,
                body: { error: { code: 'ORG_NOT_FOUND', message: 'Organisation not found.' } },
            };
        }

        return { statusCode: 200, body: { orgDid, metrics: m } };
    }
}

export const createOrgPortalService = (): OrgPortalService => {
    return new OrgPortalService();
};
