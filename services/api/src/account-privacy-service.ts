import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');
const iso = (value: Date | string | null): string | null =>
    value === null ? null : new Date(value).toISOString();

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
                    legacyDiscoveryEvents: legacyDiscoveryEvents.rowCount ?? 0,
                    workflows: workflows.rowCount ?? 0,
                    platformRoles: platformRoles.rowCount ?? 0,
                    ownedBlocks: ownedBlocks.rowCount ?? 0,
                    commandMetadata: commandMetadata.rowCount ?? 0,
                },
                revoked: {
                    browserSessions: browserSessions.rowCount ?? 0,
                    oauthSessions: oauthSessions.rowCount ?? 0,
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
