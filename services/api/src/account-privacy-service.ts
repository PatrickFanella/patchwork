import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');
const iso = (value: Date | string | null): string | null =>
    value === null ? null : new Date(value).toISOString();

interface ApplicationExportRow {
    application_id: string;
    subject_type: string;
    organization_id: string | null;
    subject_ref: string;
    status: string;
    submitted_at: Date | string;
    decided_at: Date | string | null;
    expires_at: Date | string | null;
    revoked_at: Date | string | null;
    updated_at: Date | string;
}

export class AccountPrivacyService {
    constructor(private readonly pool: Pool) {}

    async exportFor(did: string): Promise<Record<string, unknown>> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const result = await this.collect(client, did);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deactivate(
        did: string,
        commandId: string,
        requestedAt = new Date(),
    ): Promise<Record<string, unknown>> {
        const client = await this.pool.connect();
        const didHash = hash(did);
        const now = requestedAt.toISOString();
        const safetyRetentionUntil = new Date(
            requestedAt.getTime() + 7 * 24 * 60 * 60 * 1_000,
        ).toISOString();
        const auditRetentionUntil = new Date(
            requestedAt.getTime() + 30 * 24 * 60 * 60 * 1_000,
        ).toISOString();
        try {
            await client.query('BEGIN');
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext('account:' || $1))`,
                [didHash],
            );
            const duplicate = await client.query<{ result: Record<string, unknown> }>(
                `SELECT result FROM account_deactivations WHERE did_hash = $1`,
                [didHash],
            );
            if (duplicate.rows[0]) {
                await client.query('COMMIT');
                return duplicate.rows[0].result;
            }
            await client.query(
                `INSERT INTO account_deactivations (
                    did_hash, command_id, result, requested_at, retention_until
                 ) VALUES ($1, $2, '{}'::jsonb, $3, $4)`,
                [didHash, commandId, now, 'infinity'],
            );

            const publicAidPosts = await client.query(
                `DELETE FROM indexer_aid_post_projections
                 WHERE author_did_hash = $1`,
                [didHash],
            );
            const publicDirectoryResources = await client.query(
                `DELETE FROM indexer_directory_resource_projections
                 WHERE author_did_hash = $1`,
                [didHash],
            );
            const publicVolunteerProfiles = await client.query(
                `DELETE FROM indexer_volunteer_profile_projections
                 WHERE author_did_hash = $1`,
                [didHash],
            );
            const privateVolunteerProfile = await client.query(
                `DELETE FROM volunteer_private_profiles WHERE did = $1`,
                [did],
            );
            const ownedOrganizations = await client.query<{
                organization_id: string;
            }>(
                `SELECT organization_id
                 FROM organization_memberships
                 WHERE member_did = $1 AND role = 'owner'
                   AND status = 'active'
                 FOR UPDATE`,
                [did],
            );
            let transferredOrganizations = 0;
            let removedOrganizations = 0;
            for (const owned of ownedOrganizations.rows) {
                const successor = await client.query<{
                    member_did: string;
                }>(
                    `SELECT member_did
                     FROM organization_memberships
                     WHERE organization_id = $1
                       AND member_did <> $2
                       AND role = 'admin' AND status = 'active'
                     ORDER BY joined_at, member_did
                     LIMIT 1`,
                    [owned.organization_id, did],
                );
                if (successor.rows[0]) {
                    await client.query(
                        `UPDATE organization_memberships
                         SET status = 'removed', updated_at = $3
                         WHERE organization_id = $1 AND member_did = $2`,
                        [owned.organization_id, did, now],
                    );
                    await client.query(
                        `UPDATE organization_memberships
                         SET role = 'owner', updated_at = $3
                         WHERE organization_id = $1 AND member_did = $2`,
                        [
                            owned.organization_id,
                            successor.rows[0].member_did,
                            now,
                        ],
                    );
                    await client.query(
                        `UPDATE organizations
                         SET created_by_did = $2, updated_at = $3
                         WHERE organization_id = $1`,
                        [
                            owned.organization_id,
                            successor.rows[0].member_did,
                            now,
                        ],
                    );
                    transferredOrganizations += 1;
                } else {
                    const removed = await client.query(
                        `DELETE FROM organizations
                         WHERE organization_id = $1`,
                        [owned.organization_id],
                    );
                    removedOrganizations += removed.rowCount ?? 0;
                }
            }
            const organizationStewardships = await client.query(
                `UPDATE organization_resource_stewardships
                 SET status = 'revoked', updated_at = $2
                 WHERE steward_did = $1 AND status <> 'revoked'`,
                [did, now],
            );
            const organizationNotifications = await client.query(
                `DELETE FROM organization_notification_events
                 WHERE recipient_did = $1`,
                [did],
            );
            const organizationInvitations = await client.query(
                `DELETE FROM organization_invitations
                 WHERE invitee_did = $1 OR invited_by_did = $1`,
                [did],
            );
            await client.query(
                `UPDATE organization_memberships m
                 SET invited_by_did = owner.member_did,
                     updated_at = $2
                 FROM organization_memberships owner
                 WHERE m.invited_by_did = $1
                   AND m.organization_id = owner.organization_id
                   AND owner.role = 'owner' AND owner.status = 'active'`,
                [did, now],
            );
            const organizationMemberships = await client.query(
                `DELETE FROM organization_memberships
                 WHERE member_did = $1`,
                [did],
            );
            const organizationAudit = await client.query(
                `UPDATE organization_audit_events
                 SET actor_did = NULL,
                     details = '{"redactedForDeactivation":true}'::jsonb
                 WHERE actor_did = $1 OR subject = $1`,
                [did],
            );
            const verificationAudit = await client.query(
                `UPDATE verification_audit_events
                 SET actor_did = CASE
                         WHEN actor_did = $1 THEN NULL
                         ELSE actor_did
                     END,
                     private_details =
                        '{"redactedForDeactivation":true}'::jsonb
                 WHERE actor_did = $1
                    OR subject_id IN (
                        SELECT application_id::text
                        FROM verification_applications
                        WHERE applicant_did = $1
                    )
                    OR subject_id IN (
                        SELECT appeal_id::text
                        FROM verification_appeals
                        WHERE applicant_did = $1
                    )
                    OR subject_id IN (
                        SELECT request_id::text
                        FROM exact_public_address_requests
                        WHERE applicant_did = $1
                    )`,
                [did],
            );
            const exactAddressRequests = await client.query(
                `DELETE FROM exact_public_address_requests
                 WHERE applicant_did = $1`,
                [did],
            );
            const verificationApplications = await client.query(
                `DELETE FROM verification_applications
                 WHERE applicant_did = $1`,
                [did],
            );
            const privateAttachments = await client.query(
                `DELETE FROM private_attachments WHERE owner_did = $1`,
                [did],
            );
            const verificationModeratorDecisions = await client.query(
                `UPDATE verification_decisions
                 SET moderator_did = 'deactivated:' || $2
                 WHERE moderator_did = $1`,
                [did, didHash],
            );
            await client.query(
                `UPDATE verification_appeals
                 SET resolved_by_did = 'deactivated:' || $2
                 WHERE resolved_by_did = $1`,
                [did, didHash],
            );
            await client.query(
                `UPDATE exact_public_address_requests
                 SET decided_by_did = 'deactivated:' || $2
                 WHERE decided_by_did = $1`,
                [did, didHash],
            );
            await client.query(
                `UPDATE verification_audit_events
                 SET actor_did = NULL,
                     private_details =
                        '{"redactedForDeactivation":true}'::jsonb
                 WHERE actor_did = $1`,
                [did],
            );
            const coordinationInbox = await client.query(
                `DELETE FROM activity_inbox_items
                 WHERE recipient_did = $1`,
                [did],
            );
            const coordinationFeedback = await client.query(
                `DELETE FROM coordination_outcome_feedback
                 WHERE submitter_did = $1`,
                [did],
            );
            const coordinationOffers = await client.query(
                `DELETE FROM coordination_offers
                 WHERE offerer_did = $1`,
                [did],
            );
            await client.query(
                `UPDATE coordination_offer_events
                 SET actor_did = NULL,
                     private_details =
                        '{"redactedForDeactivation":true}'::jsonb
                 WHERE actor_did = $1`,
                [did],
            );
            const legacyDiscoveryEvents = await client.query(
                `DELETE FROM discovery_events WHERE author_did = $1`,
                [did],
            );
            const workflows = await client.query(
                `DELETE FROM request_workflows WHERE requester_did = $1`,
                [did],
            );
            const platformRoles = await client.query(
                `DELETE FROM platform_roles WHERE did = $1`,
                [did],
            );
            const ownedBlocks = await client.query(
                `DELETE FROM user_blocks WHERE blocker_did = $1`,
                [did],
            );
            const retainedBlocks = await client.query(
                `UPDATE user_blocks
                 SET deleted_at = COALESCE(deleted_at, $2), reason = NULL,
                     retention_until = LEAST(
                         COALESCE(retention_until, $3::timestamptz),
                         $3::timestamptz
                     )
                 WHERE subject_did = $1`,
                [did, now, safetyRetentionUntil],
            );
            const retainedReports = await client.query(
                `UPDATE abuse_reports
                 SET deleted_at = COALESCE(deleted_at, $2), details = NULL,
                     retention_until = LEAST(retention_until, $3::timestamptz)
                 WHERE reporter_did = $1 OR subject_did = $1
                    OR subject_uri LIKE ('at://' || $1 || '/%')`,
                [did, now, safetyRetentionUntil],
            );
            const retainedAudit = await client.query(
                `UPDATE operational_audit_events
                 SET actor_did = CASE
                         WHEN actor_did = $1 THEN 'deactivated:' || $2
                         ELSE actor_did
                     END,
                     subject_uri = CASE
                         WHEN subject_uri LIKE ('at://' || $1 || '/%')
                             THEN 'deactivated:' || $2
                         ELSE subject_uri
                     END,
                     retention_until = LEAST(
                         retention_until, $3::timestamptz
                     )
                 WHERE actor_did = $1
                    OR subject_uri LIKE ('at://' || $1 || '/%')`,
                [did, didHash, auditRetentionUntil],
            );
            const commandMetadata = await client.query(
                `DELETE FROM http_idempotency_commands
                 WHERE actor_did = $1 AND pathname <> '/account/deactivate'`,
                [did],
            );
            const preferenceAudit = await client.query(
                `DELETE FROM account_preference_audit WHERE did = $1`,
                [did],
            );
            const preferences = await client.query(
                `DELETE FROM account_preferences WHERE did = $1`,
                [did],
            );
            const policyConsents = await client.query(
                `DELETE FROM account_policy_consents WHERE did = $1`,
                [did],
            );
            const browserSessions = await client.query(
                `DELETE FROM patchwork_browser_sessions WHERE did = $1`,
                [did],
            );
            const oauthSessions = await client.query(
                `DELETE FROM at_oauth_sessions WHERE did = $1`,
                [did],
            );
            const moderationCasework = await client.query(
                `SELECT COUNT(*)::int AS count
                 FROM moderation_queue_items
                 WHERE subject_uri LIKE ('at://' || $1 || '/%')`,
                [did],
            );
            const moderationActorAudit = await client.query(
                `UPDATE moderation_audit_records
                 SET actor_did = 'deactivated:' || $2,
                     retention_until = LEAST(
                         retention_until, $3::timestamptz
                     )
                 WHERE actor_did = $1`,
                [did, didHash, safetyRetentionUntil],
            );

            const result = {
                status: 'deactivated',
                effectiveAt: now,
                removed: {
                    publicAidPosts: publicAidPosts.rowCount ?? 0,
                    publicDirectoryResources:
                        publicDirectoryResources.rowCount ?? 0,
                    publicVolunteerProfiles:
                        publicVolunteerProfiles.rowCount ?? 0,
                    privateVolunteerProfile:
                        privateVolunteerProfile.rowCount ?? 0,
                    organizationMemberships:
                        organizationMemberships.rowCount ?? 0,
                    organizationInvitations:
                        organizationInvitations.rowCount ?? 0,
                    organizationNotifications:
                        organizationNotifications.rowCount ?? 0,
                    organizations: removedOrganizations,
                    verificationApplications:
                        verificationApplications.rowCount ?? 0,
                    exactAddressRequests:
                        exactAddressRequests.rowCount ?? 0,
                    privateAttachments:
                        privateAttachments.rowCount ?? 0,
                    coordinationInbox:
                        coordinationInbox.rowCount ?? 0,
                    coordinationFeedback:
                        coordinationFeedback.rowCount ?? 0,
                    coordinationOffers:
                        coordinationOffers.rowCount ?? 0,
                    legacyDiscoveryEvents: legacyDiscoveryEvents.rowCount ?? 0,
                    workflows: workflows.rowCount ?? 0,
                    platformRoles: platformRoles.rowCount ?? 0,
                    ownedBlocks: ownedBlocks.rowCount ?? 0,
                    commandMetadata: commandMetadata.rowCount ?? 0,
                    preferenceAudit: preferenceAudit.rowCount ?? 0,
                    preferences: preferences.rowCount ?? 0,
                    policyConsents: policyConsents.rowCount ?? 0,
                },
                revoked: {
                    browserSessions: browserSessions.rowCount ?? 0,
                    oauthSessions: oauthSessions.rowCount ?? 0,
                    organizationStewardships:
                        organizationStewardships.rowCount ?? 0,
                },
                retained: {
                    deactivationReceipt: 1,
                    commandReceipt: 1,
                    safetyBlocks: retainedBlocks.rowCount ?? 0,
                    safetyReports: retainedReports.rowCount ?? 0,
                    operationalAudit: retainedAudit.rowCount ?? 0,
                    moderationCasework:
                        moderationCasework.rows[0]?.count ?? 0,
                    moderationActorAudit:
                        moderationActorAudit.rowCount ?? 0,
                    transferredOrganizations,
                    organizationAudit:
                        organizationAudit.rowCount ?? 0,
                    verificationModeratorDecisions:
                        verificationModeratorDecisions.rowCount ?? 0,
                    verificationAudit:
                        verificationAudit.rowCount ?? 0,
                },
            };
            await client.query(
                `UPDATE account_deactivations SET result = $2::jsonb
                 WHERE did_hash = $1`,
                [didHash, JSON.stringify(result)],
            );
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async collect(
        client: PoolClient,
        did: string,
    ): Promise<Record<string, unknown>> {
        const oauth = await client.query<{
                handle: string | null;
                token_expires_at: Date | string | null;
                revoked_at: Date | string | null;
                created_at: Date | string;
                updated_at: Date | string;
            }>(
            `SELECT handle, token_expires_at, revoked_at, created_at, updated_at
             FROM at_oauth_sessions WHERE did = $1`,
            [did],
        );
        const browserSessions = await client.query<{
                expires_at: Date | string;
                revoked_at: Date | string | null;
                created_at: Date | string;
                last_seen_at: Date | string;
            }>(
            `SELECT expires_at, revoked_at, created_at, last_seen_at
             FROM patchwork_browser_sessions
             WHERE did = $1 ORDER BY created_at`,
            [did],
        );
        const role = await client.query<{
            role: string;
            updated_at: Date | string;
        }>(
            `SELECT role, updated_at FROM platform_roles WHERE did = $1`,
            [did],
        );
        const publicAidPosts = await client.query<{
                uri: string;
                cid: string | null;
                title: string;
                description: string;
                category: string;
                urgency: string;
                status: string;
                latitude: number;
                longitude: number;
                precision_km: number;
                record_created_at: Date | string;
                record_updated_at: Date | string;
            }>(
            `SELECT uri, cid, title, description, category, urgency, status,
                    latitude, longitude, precision_km, record_created_at,
                    record_updated_at
             FROM indexer_aid_post_projections
             WHERE author_did_hash = $1
             ORDER BY record_created_at, uri`,
            [hash(did)],
        );
        const publicDirectoryResources = await client.query<{
                uri: string;
                cid: string | null;
                name: string;
                service_area: string;
                category: string;
                verification_status: string;
                contact: {
                    url?: string;
                    phone?: string;
                };
                latitude: number | null;
                longitude: number | null;
                precision_km: number | null;
                open_hours: string | null;
                eligibility_notes: string | null;
                operational_status: string;
                record_created_at: Date | string;
                record_updated_at: Date | string;
            }>(
            `SELECT uri, cid, name, service_area, category,
                    verification_status, contact, latitude, longitude,
                    precision_km, open_hours, eligibility_notes,
                    operational_status, record_created_at, record_updated_at
             FROM indexer_directory_resource_projections
             WHERE author_did_hash = $1
             ORDER BY record_created_at, uri`,
            [hash(did)],
        );
        const publicVolunteerProfiles = await client.query<{
            uri: string;
            cid: string | null;
            display_name: string;
            bio: string | null;
            capabilities: string[];
            availability: string;
            contact_preference: string;
            skills: string[];
            languages: string[];
            service_area_label: string | null;
            no_permanent_address: boolean;
            latitude: number | null;
            longitude: number | null;
            precision_km: number | null;
            record_created_at: Date | string;
            record_updated_at: Date | string;
        }>(
            `SELECT uri, cid, display_name, bio, capabilities, availability,
                    contact_preference, skills, languages,
                    service_area_label, no_permanent_address, latitude,
                    longitude, precision_km, record_created_at,
                    record_updated_at
             FROM indexer_volunteer_profile_projections
             WHERE author_did_hash = $1
             ORDER BY record_created_at, uri`,
            [hash(did)],
        );
        const privateVolunteerProfile = await client.query<{
            contact_email: string | null;
            contact_phone: string | null;
            availability_windows: string[];
            matching_preferences: unknown;
            created_at: Date | string;
            updated_at: Date | string;
        }>(
            `SELECT contact_email, contact_phone, availability_windows,
                    matching_preferences, created_at, updated_at
             FROM volunteer_private_profiles WHERE did = $1`,
            [did],
        );
        const organizationMemberships = await client.query<{
            organization_id: string;
            slug: string;
            name: string;
            role: string;
            joined_at: Date | string;
            updated_at: Date | string;
        }>(
            `SELECT o.organization_id, o.slug, o.name, m.role,
                    m.joined_at, m.updated_at
             FROM organization_memberships m
             JOIN organizations o USING (organization_id)
             WHERE m.member_did = $1 AND m.status = 'active'
             ORDER BY o.name, o.organization_id`,
            [did],
        );
        const organizationInvitations = await client.query<{
            invitation_id: string;
            organization_id: string;
            role: string;
            status: string;
            invited_by_did: string;
            expires_at: Date | string;
            created_at: Date | string;
            accepted_at: Date | string | null;
        }>(
            `SELECT invitation_id, organization_id, role, status,
                    invited_by_did, expires_at, created_at, accepted_at
             FROM organization_invitations
             WHERE invitee_did = $1
             ORDER BY created_at, invitation_id`,
            [did],
        );
        const organizationStewardships = await client.query<{
            stewardship_id: string;
            organization_id: string;
            resource_uri: string;
            status: string;
            last_reconfirmed_at: Date | string;
            reconfirm_due_at: Date | string;
            created_at: Date | string;
            updated_at: Date | string;
        }>(
            `SELECT stewardship_id, organization_id, resource_uri, status,
                    last_reconfirmed_at, reconfirm_due_at,
                    created_at, updated_at
             FROM organization_resource_stewardships
             WHERE steward_did = $1
             ORDER BY created_at, stewardship_id`,
            [did],
        );
        const verificationApplications = await client.query<ApplicationExportRow>(
            `SELECT application_id, subject_type, organization_id,
                    subject_ref, status, submitted_at, decided_at,
                    expires_at, revoked_at, updated_at
             FROM verification_applications
             WHERE applicant_did = $1
             ORDER BY submitted_at, application_id`,
            [did],
        );
        const verificationEvidence = await client.query<{
            evidence_id: string;
            application_id: string;
            evidence_kind: string;
            label: string;
            issuer: string | null;
            issued_at: Date | string | null;
            attachment_id: string | null;
            private_notes: string | null;
            created_at: Date | string;
        }>(
            `SELECT e.evidence_id, e.application_id, e.evidence_kind,
                    e.label, e.issuer, e.issued_at, e.attachment_id,
                    e.private_notes, e.created_at
             FROM verification_evidence_metadata e
             JOIN verification_applications a USING (application_id)
             WHERE a.applicant_did = $1
             ORDER BY e.created_at, e.evidence_id`,
            [did],
        );
        const verificationAppeals = await client.query<{
            appeal_id: string;
            application_id: string;
            reason: string;
            status: string;
            submitted_at: Date | string;
            resolved_at: Date | string | null;
            resolution_note: string | null;
        }>(
            `SELECT appeal_id, application_id, reason, status,
                    submitted_at, resolved_at, resolution_note
             FROM verification_appeals
             WHERE applicant_did = $1
             ORDER BY submitted_at, appeal_id`,
            [did],
        );
        const exactAddressRequests = await client.query<{
            request_id: string;
            organization_id: string;
            resource_uri: string;
            street_address: string;
            latitude: number;
            longitude: number;
            confidential_facility: boolean;
            status: string;
            requested_at: Date | string;
            decision_reason: string | null;
            approval_expires_at: Date | string | null;
            updated_at: Date | string;
        }>(
            `SELECT request_id, organization_id, resource_uri,
                    street_address, latitude, longitude,
                    confidential_facility, status, requested_at,
                    decision_reason, approval_expires_at, updated_at
             FROM exact_public_address_requests
             WHERE applicant_did = $1
             ORDER BY requested_at, request_id`,
            [did],
        );
        const attachments = await client.query<{
            attachment_id: string;
            purpose: string;
            declared_mime: string;
            detected_mime: string | null;
            byte_size: string | number;
            status: string;
            created_at: Date | string;
            updated_at: Date | string;
            deleted_at: Date | string | null;
        }>(
            `SELECT attachment_id, purpose, declared_mime, detected_mime,
                    byte_size, status, created_at, updated_at, deleted_at
             FROM private_attachments
             WHERE owner_did = $1
             ORDER BY created_at, attachment_id`,
            [did],
        );
        const coordinationOffers = await client.query<{
            offer_id: string;
            request_uri: string;
            requester_did: string;
            offerer_did: string;
            note: string | null;
            status: string;
            offered_at: Date | string;
            expires_at: Date | string;
            decided_at: Date | string | null;
        }>(
            `SELECT offer_id, request_uri, requester_did, offerer_did,
                    note, status, offered_at, expires_at, decided_at
             FROM coordination_offers
             WHERE requester_did = $1 OR offerer_did = $1
             ORDER BY offered_at, offer_id`,
            [did],
        );
        const coordinationConnections = await client.query<{
            connection_id: string;
            offer_id: string;
            request_uri: string;
            requester_did: string;
            helper_did: string;
            status: string;
            accepted_at: Date | string;
            completed_at: Date | string | null;
            updated_at: Date | string;
        }>(
            `SELECT connection_id, offer_id, request_uri, requester_did,
                    helper_did, status, accepted_at, completed_at, updated_at
             FROM coordination_connections
             WHERE requester_did = $1 OR helper_did = $1
             ORDER BY accepted_at, connection_id`,
            [did],
        );
        const coordinationInbox = await client.query<{
            item_id: string;
            item_type: string;
            title: string;
            summary: string;
            action_url: string;
            metadata: Record<string, unknown>;
            occurred_at: Date | string;
            read_at: Date | string | null;
        }>(
            `SELECT item_id, item_type, title, summary, action_url,
                    metadata, occurred_at, read_at
             FROM activity_inbox_items
             WHERE recipient_did = $1
             ORDER BY occurred_at, item_id`,
            [did],
        );
        const coordinationFeedback = await client.query<{
            feedback_id: string;
            connection_id: string;
            outcome: string;
            rating: number;
            comment: string | null;
            tags: string[];
            submitted_at: Date | string;
        }>(
            `SELECT feedback_id, connection_id, outcome, rating,
                    comment, tags, submitted_at
             FROM coordination_outcome_feedback
             WHERE submitter_did = $1
             ORDER BY submitted_at, feedback_id`,
            [did],
        );
        const workflows = await client.query<{
                post_uri: string;
                current_status: string;
                public_status: string | null;
                created_at: Date | string;
                updated_at: Date | string;
                retention_until: Date | string | null;
            }>(
            `SELECT post_uri, current_status, public_status, created_at,
                    updated_at, retention_until
             FROM request_workflows
             WHERE requester_did = $1 ORDER BY created_at, post_uri`,
            [did],
        );
        const lifecycleActions = await client.query<{
                post_uri: string;
                from_status: string;
                to_status: string;
                reason: string | null;
                occurred_at: Date | string;
            }>(
            `SELECT post_uri, from_status, to_status, reason, occurred_at
             FROM request_transition_events
             WHERE actor_did = $1 ORDER BY occurred_at, transition_id`,
            [did],
        );
        const assignmentActions = await client.query<{
                post_uri: string;
                involvement: string;
                occurred_at: Date | string;
            }>(
            `SELECT post_uri,
                    CASE WHEN assigner_did = $1 THEN 'assigner' ELSE 'assignee' END
                        AS involvement,
                    occurred_at
             FROM request_assignment_events
             WHERE assigner_did = $1 OR assignee_did = $1
             ORDER BY occurred_at, assignment_event_id`,
            [did],
        );
        const handoffActions = await client.query<{
            post_uri: string;
            occurred_at: Date | string;
        }>(
            `SELECT post_uri, occurred_at
             FROM request_handoff_events
             WHERE completed_by = $1 ORDER BY occurred_at, handoff_event_id`,
            [did],
        );
        const blocksCreated = await client.query<{
                reason: string | null;
                created_at: Date | string;
                deleted_at: Date | string | null;
                retention_until: Date | string | null;
            }>(
            `SELECT reason, created_at, deleted_at, retention_until
             FROM user_blocks WHERE blocker_did = $1 ORDER BY created_at, block_id`,
            [did],
        );
        const reportsSubmitted = await client.query<{
                reason: string;
                details: string | null;
                status: string;
                created_at: Date | string;
                deleted_at: Date | string | null;
                retention_until: Date | string;
            }>(
            `SELECT reason, details, status, created_at, deleted_at,
                    retention_until
             FROM abuse_reports
             WHERE reporter_did = $1 ORDER BY created_at, report_id`,
            [did],
        );
        const operationalActions = await client.query<{
                action: string;
                occurred_at: Date | string;
                retention_until: Date | string;
            }>(
            `SELECT action, occurred_at, retention_until
             FROM operational_audit_events
             WHERE actor_did = $1 ORDER BY occurred_at, audit_event_id`,
            [did],
        );
        const commandMetadata = await client.query<{
                method: string;
                pathname: string;
                created_at: Date | string;
                completed_at: Date | string | null;
            }>(
            `SELECT method, pathname, created_at, completed_at
             FROM http_idempotency_commands
             WHERE actor_did = $1 ORDER BY created_at, idempotency_key`,
            [did],
        );
        const policyConsents = await client.query<{
            policy_version: string;
            asserted_18_or_older: boolean;
            accepted_documents: string[];
            accepted_at: Date | string;
        }>(
            `SELECT policy_version, asserted_18_or_older,
                    accepted_documents, accepted_at
             FROM account_policy_consents
             WHERE did = $1 ORDER BY accepted_at, policy_version`,
            [did],
        );
        const preferences = await client.query<{
            privacy: string;
            notifications: unknown;
            visibility: string;
            language: string;
            location: unknown;
            created_at: Date | string;
            updated_at: Date | string;
        }>(
            `SELECT privacy, notifications, visibility, language, location,
                    created_at, updated_at
             FROM account_preferences WHERE did = $1`,
            [did],
        );
        const oauthRow = oauth.rows[0];
        const roleRow = role.rows[0];

        return {
            formatVersion: '1.0',
            generatedAt: new Date().toISOString(),
            subject: {
                did,
                ...(oauthRow?.handle ? { handle: oauthRow.handle } : {}),
            },
            data: {
                authentication:
                    oauthRow ?
                        {
                            tokenExpiresAt: iso(oauthRow.token_expires_at),
                            revokedAt: iso(oauthRow.revoked_at),
                            createdAt: iso(oauthRow.created_at),
                            updatedAt: iso(oauthRow.updated_at),
                            browserSessions: browserSessions.rows.map(row => ({
                                expiresAt: iso(row.expires_at),
                                revokedAt: iso(row.revoked_at),
                                createdAt: iso(row.created_at),
                                lastSeenAt: iso(row.last_seen_at),
                            })),
                        }
                    :   null,
                platformRole:
                    roleRow ?
                        { role: roleRow.role, grantedAt: iso(roleRow.updated_at) }
                    :   { role: 'user', grantedAt: null },
                publicAidPosts: publicAidPosts.rows.map(row => ({
                    uri: row.uri,
                    cid: row.cid,
                    title: row.title,
                    description: row.description,
                    category: row.category,
                    urgency: row.urgency,
                    status: row.status,
                    approximateGeo: {
                        latitude: Number(row.latitude),
                        longitude: Number(row.longitude),
                        precisionKm: Number(row.precision_km),
                    },
                    createdAt: iso(row.record_created_at),
                    updatedAt: iso(row.record_updated_at),
                })),
                publicDirectoryResources: publicDirectoryResources.rows.map(
                    row => ({
                        uri: row.uri,
                        cid: row.cid,
                        name: row.name,
                        serviceArea: row.service_area,
                        category: row.category,
                        verificationStatus: row.verification_status,
                        contact: row.contact,
                        ...(row.latitude !== null &&
                        row.longitude !== null &&
                        row.precision_km !== null ?
                            {
                                approximateGeo: {
                                    latitude: Number(row.latitude),
                                    longitude: Number(row.longitude),
                                    precisionKm: Number(row.precision_km),
                                },
                            }
                        :   {}),
                        openHours: row.open_hours,
                        eligibilityNotes: row.eligibility_notes,
                        operationalStatus: row.operational_status,
                        createdAt: iso(row.record_created_at),
                        updatedAt: iso(row.record_updated_at),
                    }),
                ),
                publicVolunteerProfiles:
                    publicVolunteerProfiles.rows.map(row => ({
                        uri: row.uri,
                        cid: row.cid,
                        displayName: row.display_name,
                        bio: row.bio,
                        capabilities: row.capabilities,
                        availability: row.availability,
                        contactPreference: row.contact_preference,
                        skills: row.skills,
                        languages: row.languages,
                        serviceArea:
                            row.service_area_label ?
                                {
                                    areaLabel: row.service_area_label,
                                    noPermanentAddress:
                                        row.no_permanent_address,
                                    ...(row.latitude !== null &&
                                    row.longitude !== null &&
                                    row.precision_km !== null ?
                                        {
                                            approximateGeo: {
                                                latitude: Number(
                                                    row.latitude,
                                                ),
                                                longitude: Number(
                                                    row.longitude,
                                                ),
                                                precisionKm: Number(
                                                    row.precision_km,
                                                ),
                                            },
                                        }
                                    :   {}),
                                }
                            :   null,
                        createdAt: iso(row.record_created_at),
                        updatedAt: iso(row.record_updated_at),
                    })),
                privateVolunteerProfile:
                    privateVolunteerProfile.rows[0] ?
                        {
                            contactEmail:
                                privateVolunteerProfile.rows[0]
                                    .contact_email,
                            contactPhone:
                                privateVolunteerProfile.rows[0]
                                    .contact_phone,
                            availabilityWindows:
                                privateVolunteerProfile.rows[0]
                                    .availability_windows,
                            matchingPreferences:
                                privateVolunteerProfile.rows[0]
                                    .matching_preferences,
                            createdAt: iso(
                                privateVolunteerProfile.rows[0]
                                    .created_at,
                            ),
                            updatedAt: iso(
                                privateVolunteerProfile.rows[0]
                                    .updated_at,
                            ),
                        }
                    :   null,
                organizations: {
                    memberships: organizationMemberships.rows.map(row => ({
                        organizationId: row.organization_id,
                        slug: row.slug,
                        name: row.name,
                        role: row.role,
                        joinedAt: iso(row.joined_at),
                        updatedAt: iso(row.updated_at),
                    })),
                    invitations: organizationInvitations.rows.map(row => ({
                        id: row.invitation_id,
                        organizationId: row.organization_id,
                        role: row.role,
                        status: row.status,
                        expiresAt: iso(row.expires_at),
                        createdAt: iso(row.created_at),
                        acceptedAt: iso(row.accepted_at),
                    })),
                    stewardships: organizationStewardships.rows.map(row => ({
                        id: row.stewardship_id,
                        organizationId: row.organization_id,
                        resourceUri: row.resource_uri,
                        status: row.status,
                        lastReconfirmedAt: iso(row.last_reconfirmed_at),
                        reconfirmDueAt: iso(row.reconfirm_due_at),
                        createdAt: iso(row.created_at),
                        updatedAt: iso(row.updated_at),
                    })),
                },
                verification: {
                    applications: verificationApplications.rows.map(row => ({
                        id: row.application_id,
                        subjectType: row.subject_type,
                        organizationId: row.organization_id,
                        subjectRef: row.subject_ref,
                        status: row.status,
                        submittedAt: iso(row.submitted_at),
                        decidedAt: iso(row.decided_at),
                        expiresAt: iso(row.expires_at),
                        revokedAt: iso(row.revoked_at),
                        updatedAt: iso(row.updated_at),
                    })),
                    evidence: verificationEvidence.rows.map(row => ({
                        id: row.evidence_id,
                        applicationId: row.application_id,
                        kind: row.evidence_kind,
                        label: row.label,
                        issuer: row.issuer,
                        issuedAt:
                            row.issued_at ?
                                new Date(row.issued_at)
                                    .toISOString()
                                    .slice(0, 10)
                            :   null,
                        attachmentId: row.attachment_id,
                        privateNotes: row.private_notes,
                        createdAt: iso(row.created_at),
                    })),
                    appeals: verificationAppeals.rows.map(row => ({
                        id: row.appeal_id,
                        applicationId: row.application_id,
                        reason: row.reason,
                        status: row.status,
                        submittedAt: iso(row.submitted_at),
                        resolvedAt: iso(row.resolved_at),
                        resolutionNote: row.resolution_note,
                    })),
                    exactAddressRequests: exactAddressRequests.rows.map(
                        row => ({
                            id: row.request_id,
                            organizationId: row.organization_id,
                            resourceUri: row.resource_uri,
                            streetAddress: row.street_address,
                            latitude: Number(row.latitude),
                            longitude: Number(row.longitude),
                            confidentialFacility:
                                row.confidential_facility,
                            status: row.status,
                            requestedAt: iso(row.requested_at),
                            decisionReason: row.decision_reason,
                            approvalExpiresAt: iso(
                                row.approval_expires_at,
                            ),
                            updatedAt: iso(row.updated_at),
                        }),
                    ),
                },
                attachments: attachments.rows.map(row => ({
                    id: row.attachment_id,
                    purpose: row.purpose,
                    declaredMime: row.declared_mime,
                    detectedMime: row.detected_mime,
                    byteSize: Number(row.byte_size),
                    status: row.status,
                    createdAt: iso(row.created_at),
                    updatedAt: iso(row.updated_at),
                    deletedAt: iso(row.deleted_at),
                })),
                coordination: {
                    offers: coordinationOffers.rows.map(row => ({
                        id: row.offer_id,
                        requestUri: row.request_uri,
                        direction:
                            row.requester_did === did ? 'received' : 'sent',
                        note: row.note,
                        status: row.status,
                        offeredAt: iso(row.offered_at),
                        expiresAt: iso(row.expires_at),
                        decidedAt: iso(row.decided_at),
                        ...(row.status === 'accepted' ?
                            {
                                requesterDid: row.requester_did,
                                helperDid: row.offerer_did,
                            }
                        :   {}),
                    })),
                    connections: coordinationConnections.rows.map(row => ({
                        id: row.connection_id,
                        offerId: row.offer_id,
                        requestUri: row.request_uri,
                        status: row.status,
                        requesterDid: row.requester_did,
                        helperDid: row.helper_did,
                        acceptedAt: iso(row.accepted_at),
                        completedAt: iso(row.completed_at),
                        updatedAt: iso(row.updated_at),
                    })),
                    inbox: coordinationInbox.rows.map(row => ({
                        id: row.item_id,
                        type: row.item_type,
                        title: row.title,
                        summary: row.summary,
                        actionUrl: row.action_url,
                        metadata: row.metadata,
                        occurredAt: iso(row.occurred_at),
                        readAt: iso(row.read_at),
                    })),
                    feedback: coordinationFeedback.rows.map(row => ({
                        id: row.feedback_id,
                        connectionId: row.connection_id,
                        outcome: row.outcome,
                        rating: row.rating,
                        comment: row.comment,
                        tags: row.tags,
                        submittedAt: iso(row.submitted_at),
                    })),
                },
                workflows: workflows.rows.map(row => ({
                    postUri: row.post_uri,
                    currentStatus: row.current_status,
                    publicStatus: row.public_status,
                    createdAt: iso(row.created_at),
                    updatedAt: iso(row.updated_at),
                    retentionUntil: iso(row.retention_until),
                })),
                lifecycleActions: lifecycleActions.rows.map(row => ({
                    postUri: row.post_uri,
                    fromStatus: row.from_status,
                    toStatus: row.to_status,
                    reason: row.reason,
                    occurredAt: iso(row.occurred_at),
                })),
                assignmentActions: assignmentActions.rows.map(row => ({
                    postUri: row.post_uri,
                    involvement: row.involvement,
                    occurredAt: iso(row.occurred_at),
                })),
                handoffActions: handoffActions.rows.map(row => ({
                    postUri: row.post_uri,
                    occurredAt: iso(row.occurred_at),
                })),
                blocksCreated: blocksCreated.rows.map(row => ({
                    reason: row.reason,
                    createdAt: iso(row.created_at),
                    deletedAt: iso(row.deleted_at),
                    retentionUntil: iso(row.retention_until),
                })),
                reportsSubmitted: reportsSubmitted.rows.map(row => ({
                    reason: row.reason,
                    details: row.details,
                    status: row.status,
                    createdAt: iso(row.created_at),
                    deletedAt: iso(row.deleted_at),
                    retentionUntil: iso(row.retention_until),
                })),
                operationalActions: operationalActions.rows.map(row => ({
                    action: row.action,
                    occurredAt: iso(row.occurred_at),
                    retentionUntil: iso(row.retention_until),
                })),
                commandMetadata: commandMetadata.rows.map(row => ({
                    method: row.method,
                    pathname: row.pathname,
                    createdAt: iso(row.created_at),
                    completedAt: iso(row.completed_at),
                })),
                policyConsents: policyConsents.rows.map(row => ({
                    policyVersion: row.policy_version,
                    asserted18OrOlder: row.asserted_18_or_older,
                    acceptedDocuments: row.accepted_documents,
                    acceptedAt: iso(row.accepted_at),
                })),
                preferences:
                    preferences.rows[0] ?
                        {
                            privacy: preferences.rows[0].privacy,
                            notifications:
                                preferences.rows[0].notifications,
                            visibility: preferences.rows[0].visibility,
                            language: preferences.rows[0].language,
                            location: preferences.rows[0].location,
                            createdAt: iso(preferences.rows[0].created_at),
                            updatedAt: iso(preferences.rows[0].updated_at),
                        }
                    :   null,
            },
            exclusions: [
                {
                    category: 'at-repository',
                    reason:
                        'The public aid-post and directory-resource sections are Patchwork projections, not a complete AT repository export.',
                },
                {
                    category: 'moderation-casework',
                    reason:
                        'Private casework may contain third-party or safety data and requires controlled review.',
                },
                {
                    category: 'credentials',
                    reason:
                        'Tokens, encrypted OAuth payloads, session identifiers, and lookup hashes are never exported.',
                },
            ],
        };
    }
}
