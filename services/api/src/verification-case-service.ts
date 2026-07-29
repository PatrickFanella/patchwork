import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { organizationRoleRank } from '@patchwork/shared';
import { z } from 'zod';
import { PublicHttpError } from './http/error-response.js';

const organizationIdSchema = z.string().uuid();
const resourceUriSchema = z
    .string()
    .regex(
        /^at:\/\/did:[^/]+\/app\.patchwork\.directory\.resource\/[^/]+$/,
    );
const evidenceSchema = z
    .object({
        kind: z.enum([
            'identity',
            'organization-registration',
            'service-authorization',
            'community-reference',
            'training',
            'other',
        ]),
        label: z.string().trim().min(1).max(160),
        issuer: z.string().trim().max(200).nullable(),
        issuedAt: z.string().date().nullable(),
        attachmentId: z.string().uuid().nullable(),
        privateNotes: z.string().trim().max(2000).nullable(),
    })
    .strict();
const applicationSchema = z
    .object({
        subjectType: z.enum(['volunteer', 'organization', 'resource']),
        organizationId: organizationIdSchema.optional(),
        resourceUri: resourceUriSchema.optional(),
        evidence: z.array(evidenceSchema).min(1).max(20),
    })
    .strict();
const decisionSchema = z
    .object({
        applicationId: z.string().uuid(),
        action: z.enum(['approve', 'deny', 'revoke', 'renew']),
        reason: z.string().trim().min(1).max(2000),
    })
    .strict();
const appealSchema = z
    .object({
        applicationId: z.string().uuid(),
        reason: z.string().trim().min(1).max(2000),
    })
    .strict();
const appealDecisionSchema = z
    .object({
        appealId: z.string().uuid(),
        decision: z.enum(['upheld', 'denied']),
        resolutionNote: z.string().trim().min(1).max(2000),
    })
    .strict();
const exactAddressRequestSchema = z
    .object({
        organizationId: organizationIdSchema,
        resourceUri: resourceUriSchema,
        streetAddress: z.string().trim().min(1).max(300),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        confidentialFacility: z.boolean(),
    })
    .strict();
const exactAddressDecisionSchema = z
    .object({
        requestId: z.string().uuid(),
        decision: z.enum(['approve', 'reject', 'revoke']),
        reason: z.string().trim().min(1).max(2000),
    })
    .strict();

const invalid = (code: string, message: string): never => {
    throw new PublicHttpError(400, code, message);
};
const iso = (value: Date | string | null): string | null =>
    value === null ? null : new Date(value).toISOString();
const plusYear = (now: Date): Date => {
    const result = new Date(now);
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    return result;
};

type VerificationSubjectType = 'volunteer' | 'organization' | 'resource';
type VerificationApplicationStatus =
    | 'pending'
    | 'under-review'
    | 'approved'
    | 'denied'
    | 'revoked'
    | 'expired';

interface ApplicationRow {
    application_id: string;
    applicant_did: string;
    subject_type: VerificationSubjectType;
    organization_id: string | null;
    subject_ref: string;
    status: VerificationApplicationStatus;
    submitted_at: Date | string;
    decided_at: Date | string | null;
    expires_at: Date | string | null;
    revoked_at: Date | string | null;
    updated_at: Date | string;
}

interface EvidenceRow {
    evidence_id: string;
    application_id: string;
    evidence_kind: string;
    label: string;
    issuer: string | null;
    issued_at: Date | string | null;
    attachment_id: string | null;
    private_notes: string | null;
    created_at: Date | string;
}

interface ExactAddressRow {
    request_id: string;
    organization_id: string;
    resource_uri: string;
    applicant_did: string;
    street_address: string;
    latitude: number;
    longitude: number;
    confidential_facility: boolean;
    status:
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'quarantined'
        | 'revoked'
        | 'expired';
    requested_at: Date | string;
    decided_at: Date | string | null;
    decided_by_did: string | null;
    decision_reason: string | null;
    approval_expires_at: Date | string | null;
    updated_at: Date | string;
}

const renderApplication = (row: ApplicationRow) => ({
    id: row.application_id,
    applicantDid: row.applicant_did,
    subjectType: row.subject_type,
    organizationId: row.organization_id,
    subjectRef: row.subject_ref,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    decidedAt: iso(row.decided_at),
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at),
    updatedAt: iso(row.updated_at),
});

const renderEvidence = (row: EvidenceRow) => ({
    id: row.evidence_id,
    applicationId: row.application_id,
    kind: row.evidence_kind,
    label: row.label,
    issuer: row.issuer,
    issuedAt:
        row.issued_at ?
            new Date(row.issued_at).toISOString().slice(0, 10)
        :   null,
    attachmentId: row.attachment_id,
    privateNotes: row.private_notes,
    createdAt: iso(row.created_at),
});

const renderExactAddress = (
    row: ExactAddressRow,
    includeCoordinates: boolean,
) => ({
    id: row.request_id,
    organizationId: row.organization_id,
    resourceUri: row.resource_uri,
    applicantDid: row.applicant_did,
    streetAddress: row.street_address,
    ...(includeCoordinates ?
        {
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
        }
    :   {}),
    confidentialFacility: row.confidential_facility,
    status: row.status,
    requestedAt: iso(row.requested_at),
    decidedAt: iso(row.decided_at),
    decidedByDid: row.decided_by_did,
    decisionReason: row.decision_reason,
    approvalExpiresAt: iso(row.approval_expires_at),
    updatedAt: iso(row.updated_at),
});

export class VerificationCaseService {
    constructor(private readonly pool: Pool) {}

    async submitApplication(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = applicationSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_VERIFICATION_APPLICATION',
                'The verification application or evidence metadata is invalid.',
            );
        }
        const subject = await this.resolveSubject(actorDid, parsed.data);
        await this.assertAttachments(
            actorDid,
            parsed.data.evidence
                .map(item => item.attachmentId)
                .filter((id): id is string => id !== null),
        );
        const applicationId = randomUUID();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO verification_applications (
                    application_id, applicant_did, subject_type,
                    organization_id, subject_ref, status, submitted_at,
                    decided_at, expires_at, revoked_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, 'pending', $6,
                           NULL, NULL, NULL, $6)`,
                [
                    applicationId,
                    actorDid,
                    parsed.data.subjectType,
                    subject.organizationId,
                    subject.subjectRef,
                    now,
                ],
            );
            for (const item of parsed.data.evidence) {
                await client.query(
                    `INSERT INTO verification_evidence_metadata (
                        evidence_id, application_id, evidence_kind, label,
                        issuer, issued_at, attachment_id, private_notes,
                        created_at
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        randomUUID(),
                        applicationId,
                        item.kind,
                        item.label,
                        item.issuer,
                        item.issuedAt,
                        item.attachmentId,
                        item.privateNotes,
                        now,
                    ],
                );
            }
            await this.audit(
                client,
                actorDid,
                'verification-application-submitted',
                'application',
                applicationId,
                'Verification application submitted.',
                {
                    subjectType: parsed.data.subjectType,
                    subjectRef: subject.subjectRef,
                    evidenceCount: parsed.data.evidence.length,
                },
                now,
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new PublicHttpError(
                    409,
                    'VERIFICATION_APPLICATION_OPEN',
                    'An open verification application already exists for this subject.',
                );
            }
            throw error;
        } finally {
            client.release();
        }
        return this.getApplicationForApplicant(actorDid, applicationId);
    }

    async listMine(actorDid: string): Promise<Record<string, unknown>> {
        await this.runExpirySweep();
        const applications = await this.pool.query<ApplicationRow>(
            `SELECT application_id, applicant_did, subject_type,
                    organization_id, subject_ref, status, submitted_at,
                    decided_at, expires_at, revoked_at, updated_at
             FROM verification_applications
             WHERE applicant_did = $1
             ORDER BY submitted_at DESC, application_id`,
            [actorDid],
        );
        const evidence = await this.pool.query<EvidenceRow>(
            `SELECT e.evidence_id, e.application_id, e.evidence_kind,
                    e.label, e.issuer, e.issued_at, e.attachment_id,
                    e.private_notes, e.created_at
             FROM verification_evidence_metadata e
             JOIN verification_applications a USING (application_id)
             WHERE a.applicant_did = $1
             ORDER BY e.created_at, e.evidence_id`,
            [actorDid],
        );
        const appeals = await this.pool.query<{
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
             ORDER BY submitted_at DESC, appeal_id`,
            [actorDid],
        );
        const exactAddresses = await this.pool.query<ExactAddressRow>(
            `SELECT request_id, organization_id, resource_uri,
                    applicant_did, street_address, latitude, longitude,
                    confidential_facility, status, requested_at,
                    decided_at, decided_by_did, decision_reason,
                    approval_expires_at, updated_at
             FROM exact_public_address_requests
             WHERE applicant_did = $1
             ORDER BY requested_at DESC, request_id`,
            [actorDid],
        );
        return {
            applications: applications.rows.map(renderApplication),
            evidence: evidence.rows.map(renderEvidence),
            appeals: appeals.rows.map(row => ({
                id: row.appeal_id,
                applicationId: row.application_id,
                reason: row.reason,
                status: row.status,
                submittedAt: iso(row.submitted_at),
                resolvedAt: iso(row.resolved_at),
                resolutionNote: row.resolution_note,
            })),
            exactAddressRequests: exactAddresses.rows.map(row =>
                renderExactAddress(row, true),
            ),
        };
    }

    async listReviewQueue(): Promise<Record<string, unknown>> {
        await this.runExpirySweep();
        const applications = await this.pool.query<ApplicationRow>(
            `SELECT application_id, applicant_did, subject_type,
                    organization_id, subject_ref, status, submitted_at,
                    decided_at, expires_at, revoked_at, updated_at
             FROM verification_applications
             WHERE status IN ('pending', 'under-review')
                OR (
                    status = 'approved'
                    AND expires_at <= NOW() + INTERVAL '30 days'
                )
             ORDER BY submitted_at, application_id`,
        );
        const ids = applications.rows.map(row => row.application_id);
        const evidence =
            ids.length ?
                await this.pool.query<
                    EvidenceRow & {
                        attachment_status: string | null;
                        detected_mime: string | null;
                    }
                >(
                    `SELECT e.evidence_id, e.application_id,
                            e.evidence_kind, e.label, e.issuer, e.issued_at,
                            e.attachment_id, e.private_notes, e.created_at,
                            a.status AS attachment_status, a.detected_mime
                     FROM verification_evidence_metadata e
                     LEFT JOIN private_attachments a USING (attachment_id)
                     WHERE e.application_id = ANY($1::uuid[])
                     ORDER BY e.created_at, e.evidence_id`,
                    [ids],
                )
            :   { rows: [] };
        const appeals = await this.pool.query<{
            appeal_id: string;
            application_id: string;
            applicant_did: string;
            reason: string;
            status: string;
            submitted_at: Date | string;
        }>(
            `SELECT appeal_id, application_id, applicant_did, reason,
                    status, submitted_at
             FROM verification_appeals
             WHERE status IN ('pending', 'under-review')
             ORDER BY submitted_at, appeal_id`,
        );
        return {
            applications: applications.rows.map(renderApplication),
            evidence: evidence.rows.map(row => ({
                ...renderEvidence(row),
                attachment:
                    row.attachment_id ?
                        {
                            id: row.attachment_id,
                            status: row.attachment_status,
                            detectedMime: row.detected_mime,
                        }
                    :   null,
            })),
            appeals: appeals.rows.map(row => ({
                id: row.appeal_id,
                applicationId: row.application_id,
                applicantDid: row.applicant_did,
                reason: row.reason,
                status: row.status,
                submittedAt: iso(row.submitted_at),
            })),
        };
    }

    async decide(
        moderatorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = decisionSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_VERIFICATION_DECISION',
                'The verification decision is invalid.',
            );
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const current = await this.loadApplication(
                client,
                parsed.data.applicationId,
                true,
            );
            const nextStatus =
                parsed.data.action === 'approve' ||
                parsed.data.action === 'renew' ?
                    'approved'
                : parsed.data.action === 'deny' ? 'denied'
                :   'revoked';
            if (
                parsed.data.action === 'approve' &&
                !['pending', 'under-review'].includes(current.status)
            ) {
                throw new PublicHttpError(
                    409,
                    'VERIFICATION_DECISION_CONFLICT',
                    'Only an open application can be approved.',
                );
            }
            if (
                parsed.data.action === 'renew' &&
                current.status !== 'approved'
            ) {
                throw new PublicHttpError(
                    409,
                    'VERIFICATION_RENEWAL_CONFLICT',
                    'Only an active approval can be renewed.',
                );
            }
            if (
                parsed.data.action === 'deny' &&
                !['pending', 'under-review'].includes(current.status)
            ) {
                throw new PublicHttpError(
                    409,
                    'VERIFICATION_DECISION_CONFLICT',
                    'Only an open application can be denied.',
                );
            }
            const expiresAt =
                nextStatus === 'approved' ? plusYear(now) : null;
            await client.query(
                `UPDATE verification_applications
                 SET status = $2, decided_at = $3, expires_at = $4,
                     revoked_at =
                        CASE WHEN $2::text = 'revoked'
                             THEN $3::timestamptz ELSE NULL END,
                     updated_at = $3
                 WHERE application_id = $1`,
                [
                    current.application_id,
                    nextStatus,
                    now,
                    expiresAt,
                ],
            );
            await client.query(
                `INSERT INTO verification_decisions (
                    decision_id, application_id, moderator_did, action,
                    reason, previous_status, next_status, expires_at,
                    decided_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    randomUUID(),
                    current.application_id,
                    moderatorDid,
                    parsed.data.action,
                    parsed.data.reason,
                    current.status,
                    nextStatus,
                    expiresAt,
                    now,
                ],
            );
            if (nextStatus === 'revoked') {
                await this.revokeDependentExactAddresses(client, current, now);
            }
            await this.audit(
                client,
                moderatorDid,
                `verification-${parsed.data.action}`,
                'application',
                current.application_id,
                `Verification ${parsed.data.action} decision recorded.`,
                {
                    previousStatus: current.status,
                    nextStatus,
                    reason: parsed.data.reason,
                },
                now,
            );
            await client.query('COMMIT');
            return this.getApplicationForApplicant(
                current.applicant_did,
                current.application_id,
            );
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async submitAppeal(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = appealSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_VERIFICATION_APPEAL',
                'The verification appeal is invalid.',
            );
        }
        const application = await this.loadApplication(
            this.pool,
            parsed.data.applicationId,
        );
        if (application.applicant_did !== actorDid) {
            throw new PublicHttpError(
                403,
                'VERIFICATION_APPEAL_FORBIDDEN',
                'Only the applicant may appeal this verification decision.',
            );
        }
        if (!['denied', 'revoked', 'expired'].includes(application.status)) {
            throw new PublicHttpError(
                409,
                'VERIFICATION_APPEAL_NOT_AVAILABLE',
                'Only a denied, revoked, or expired verification may be appealed.',
            );
        }
        const appealId = randomUUID();
        try {
            await this.pool.query(
                `INSERT INTO verification_appeals (
                    appeal_id, application_id, applicant_did, reason,
                    status, submitted_at, resolved_at, resolved_by_did,
                    resolution_note
                 ) VALUES ($1, $2, $3, $4, 'pending', $5, NULL, NULL, NULL)`,
                [
                    appealId,
                    application.application_id,
                    actorDid,
                    parsed.data.reason,
                    now,
                ],
            );
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new PublicHttpError(
                    409,
                    'VERIFICATION_APPEAL_OPEN',
                    'An open appeal already exists for this application.',
                );
            }
            throw error;
        }
        await this.audit(
            this.pool,
            actorDid,
            'verification-appeal-submitted',
            'appeal',
            appealId,
            'Verification appeal submitted.',
            { applicationId: application.application_id },
            now,
        );
        return {
            appeal: {
                id: appealId,
                applicationId: application.application_id,
                status: 'pending',
                reason: parsed.data.reason,
                submittedAt: now.toISOString(),
            },
        };
    }

    async decideAppeal(
        moderatorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = appealDecisionSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_APPEAL_DECISION',
                'The verification appeal decision is invalid.',
            );
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<{
                appeal_id: string;
                application_id: string;
                applicant_did: string;
                status: string;
            }>(
                `SELECT appeal_id, application_id, applicant_did, status
                 FROM verification_appeals
                 WHERE appeal_id = $1 FOR UPDATE`,
                [parsed.data.appealId],
            );
            const appeal = result.rows[0];
            if (
                !appeal ||
                !['pending', 'under-review'].includes(appeal.status)
            ) {
                throw new PublicHttpError(
                    404,
                    'VERIFICATION_APPEAL_NOT_FOUND',
                    'An open verification appeal was not found.',
                );
            }
            await client.query(
                `UPDATE verification_appeals
                 SET status = $2, resolved_at = $3, resolved_by_did = $4,
                     resolution_note = $5
                 WHERE appeal_id = $1`,
                [
                    appeal.appeal_id,
                    parsed.data.decision,
                    now,
                    moderatorDid,
                    parsed.data.resolutionNote,
                ],
            );
            if (parsed.data.decision === 'upheld') {
                const application = await this.loadApplication(
                    client,
                    appeal.application_id,
                );
                const expiresAt = plusYear(now);
                await client.query(
                    `UPDATE verification_applications
                     SET status = 'approved', decided_at = $2,
                         expires_at = $3, revoked_at = NULL, updated_at = $2
                     WHERE application_id = $1`,
                    [appeal.application_id, now, expiresAt],
                );
                await client.query(
                    `INSERT INTO verification_decisions (
                        decision_id, application_id, moderator_did, action,
                        reason, previous_status, next_status, expires_at,
                        decided_at
                     ) VALUES ($1, $2, $3, 'approve', $4, $5,
                               'approved', $6, $7)`,
                    [
                        randomUUID(),
                        appeal.application_id,
                        moderatorDid,
                        `Appeal upheld: ${parsed.data.resolutionNote}`,
                        application.status,
                        expiresAt,
                        now,
                    ],
                );
            }
            await this.audit(
                client,
                moderatorDid,
                `verification-appeal-${parsed.data.decision}`,
                'appeal',
                appeal.appeal_id,
                `Verification appeal ${parsed.data.decision}.`,
                { resolutionNote: parsed.data.resolutionNote },
                now,
            );
            await client.query('COMMIT');
            return {
                appeal: {
                    id: appeal.appeal_id,
                    applicationId: appeal.application_id,
                    status: parsed.data.decision,
                    resolvedAt: now.toISOString(),
                    resolutionNote: parsed.data.resolutionNote,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async requestExactAddress(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = exactAddressRequestSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_EXACT_PUBLIC_ADDRESS',
                'The exact public-resource address request is invalid.',
            );
        }
        await this.requireOrganizationRole(
            parsed.data.organizationId,
            actorDid,
            'steward',
        );
        const stewardship = await this.pool.query(
            `SELECT 1 FROM organization_resource_stewardships
             WHERE organization_id = $1 AND resource_uri = $2
               AND status = 'active'
               AND (
                   steward_did = $3 OR EXISTS (
                       SELECT 1 FROM organization_memberships
                       WHERE organization_id = $1 AND member_did = $3
                         AND status = 'active'
                         AND role IN ('owner', 'admin')
                   )
               )`,
            [
                parsed.data.organizationId,
                parsed.data.resourceUri,
                actorDid,
            ],
        );
        if (!stewardship.rowCount) {
            throw new PublicHttpError(
                403,
                'RESOURCE_STEWARDSHIP_REQUIRED',
                'Active stewardship is required for this public resource.',
            );
        }
        const requestId = randomUUID();
        const initialStatus =
            parsed.data.confidentialFacility ? 'quarantined' : 'pending';
        try {
            await this.pool.query(
                `INSERT INTO exact_public_address_requests (
                    request_id, organization_id, resource_uri,
                    applicant_did, street_address, latitude, longitude,
                    confidential_facility, status, requested_at,
                    decided_at, decided_by_did, decision_reason,
                    approval_expires_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                           NULL, NULL, $11, NULL, $10)`,
                [
                    requestId,
                    parsed.data.organizationId,
                    parsed.data.resourceUri,
                    actorDid,
                    parsed.data.streetAddress,
                    parsed.data.latitude,
                    parsed.data.longitude,
                    parsed.data.confidentialFacility,
                    initialStatus,
                    now,
                    parsed.data.confidentialFacility ?
                        'Confidential facilities cannot publish exact addresses.'
                    :   null,
                ],
            );
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new PublicHttpError(
                    409,
                    'EXACT_ADDRESS_REQUEST_OPEN',
                    'An exact-address request is already open for this resource.',
                );
            }
            throw error;
        }
        await this.audit(
            this.pool,
            actorDid,
            'exact-address-requested',
            'exact-address',
            requestId,
            initialStatus === 'quarantined' ?
                'Confidential exact-address request quarantined.'
            :   'Exact public-resource address requested.',
            {
                organizationId: parsed.data.organizationId,
                resourceUri: parsed.data.resourceUri,
                confidentialFacility: parsed.data.confidentialFacility,
            },
            now,
        );
        return {
            request: {
                id: requestId,
                organizationId: parsed.data.organizationId,
                resourceUri: parsed.data.resourceUri,
                status: initialStatus,
                confidentialFacility: parsed.data.confidentialFacility,
                requestedAt: now.toISOString(),
            },
        };
    }

    async listExactAddressQueue(): Promise<Record<string, unknown>> {
        await this.runExpirySweep();
        const result = await this.pool.query<ExactAddressRow>(
            `SELECT request_id, organization_id, resource_uri,
                    applicant_did, street_address, latitude, longitude,
                    confidential_facility, status, requested_at,
                    decided_at, decided_by_did, decision_reason,
                    approval_expires_at, updated_at
             FROM exact_public_address_requests
             WHERE status IN ('pending', 'quarantined')
             ORDER BY requested_at, request_id`,
        );
        return {
            requests: result.rows.map(row => renderExactAddress(row, true)),
        };
    }

    async decideExactAddress(
        moderatorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = exactAddressDecisionSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_EXACT_ADDRESS_DECISION',
                'The exact-address decision is invalid.',
            );
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<ExactAddressRow>(
                `SELECT request_id, organization_id, resource_uri,
                        applicant_did, street_address, latitude, longitude,
                        confidential_facility, status, requested_at,
                        decided_at, decided_by_did, decision_reason,
                        approval_expires_at, updated_at
                 FROM exact_public_address_requests
                 WHERE request_id = $1 FOR UPDATE`,
                [parsed.data.requestId],
            );
            const request = result.rows[0];
            if (!request) {
                throw new PublicHttpError(
                    404,
                    'EXACT_ADDRESS_REQUEST_NOT_FOUND',
                    'The exact-address request was not found.',
                );
            }
            let nextStatus:
                | 'approved'
                | 'rejected'
                | 'revoked' =
                parsed.data.decision === 'approve' ? 'approved'
                : parsed.data.decision === 'reject' ? 'rejected'
                : 'revoked';
            let expiresAt: Date | null = null;
            if (nextStatus === 'approved') {
                if (request.confidential_facility) {
                    throw new PublicHttpError(
                        409,
                        'CONFIDENTIAL_EXACT_ADDRESS_FORBIDDEN',
                        'Confidential facilities cannot publish an exact address.',
                    );
                }
                const gates = await this.activeVerificationGates(
                    client,
                    request.organization_id,
                    request.resource_uri,
                    now,
                );
                if (!gates.organization || !gates.resource) {
                    const quarantineReason =
                        'Active organization and resource verification are required.';
                    await client.query(
                        `UPDATE exact_public_address_requests
                         SET status = 'quarantined', decided_at = $2,
                             decided_by_did = $3, decision_reason = $4,
                             approval_expires_at = NULL, updated_at = $2
                         WHERE request_id = $1`,
                        [
                            request.request_id,
                            now,
                            moderatorDid,
                            quarantineReason,
                        ],
                    );
                    await this.audit(
                        client,
                        moderatorDid,
                        'exact-address-quarantined',
                        'exact-address',
                        request.request_id,
                        'Exact public-resource address quarantined.',
                        {
                            organizationId: request.organization_id,
                            resourceUri: request.resource_uri,
                            reason: quarantineReason,
                        },
                        now,
                    );
                    await client.query('COMMIT');
                    return {
                        request: {
                            id: request.request_id,
                            status: 'quarantined',
                            reason: quarantineReason,
                        },
                    };
                }
                expiresAt = new Date(
                    Math.min(
                        plusYear(now).getTime(),
                        gates.organization.getTime(),
                        gates.resource.getTime(),
                    ),
                );
            }
            await client.query(
                `UPDATE exact_public_address_requests
                 SET status = $2, decided_at = $3, decided_by_did = $4,
                     decision_reason = $5, approval_expires_at = $6,
                     updated_at = $3
                 WHERE request_id = $1`,
                [
                    request.request_id,
                    nextStatus,
                    now,
                    moderatorDid,
                    parsed.data.reason,
                    expiresAt,
                ],
            );
            await this.audit(
                client,
                moderatorDid,
                `exact-address-${parsed.data.decision}`,
                'exact-address',
                request.request_id,
                `Exact public-resource address ${parsed.data.decision} decision recorded.`,
                {
                    organizationId: request.organization_id,
                    resourceUri: request.resource_uri,
                    reason: parsed.data.reason,
                },
                now,
            );
            await client.query('COMMIT');
            return {
                request: {
                    ...renderExactAddress(
                        {
                            ...request,
                            status: nextStatus,
                            decided_at: now,
                            decided_by_did: moderatorDid,
                            decision_reason: parsed.data.reason,
                            approval_expires_at: expiresAt,
                            updated_at: now,
                        },
                        true,
                    ),
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async runExpirySweep(
        now = new Date(),
    ): Promise<{ verificationsExpired: number; exactAddressesExpired: number }> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const expired = await client.query<ApplicationRow>(
                `UPDATE verification_applications
                 SET status = 'expired', updated_at = $1
                 WHERE status = 'approved' AND expires_at <= $1
                 RETURNING application_id, applicant_did, subject_type,
                    organization_id, subject_ref, status, submitted_at,
                    decided_at, expires_at, revoked_at, updated_at`,
                [now],
            );
            for (const item of expired.rows) {
                await this.audit(
                    client,
                    null,
                    'verification-expired',
                    'application',
                    item.application_id,
                    'Verification approval expired.',
                    {
                        subjectType: item.subject_type,
                        subjectRef: item.subject_ref,
                    },
                    now,
                );
                await this.revokeDependentExactAddresses(client, item, now);
            }
            const exactExpired = await client.query<{ request_id: string }>(
                `UPDATE exact_public_address_requests
                 SET status = 'expired', updated_at = $1
                 WHERE status = 'approved'
                   AND approval_expires_at <= $1
                 RETURNING request_id`,
                [now],
            );
            for (const item of exactExpired.rows) {
                await this.audit(
                    client,
                    null,
                    'exact-address-expired',
                    'exact-address',
                    item.request_id,
                    'Exact public-resource address approval expired.',
                    {},
                    now,
                );
            }
            await client.query('COMMIT');
            return {
                verificationsExpired: expired.rowCount ?? 0,
                exactAddressesExpired: exactExpired.rowCount ?? 0,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async getApplicationForApplicant(
        actorDid: string,
        applicationId: string,
    ): Promise<Record<string, unknown>> {
        const application = await this.loadApplication(
            this.pool,
            applicationId,
        );
        if (application.applicant_did !== actorDid) {
            throw new PublicHttpError(
                403,
                'VERIFICATION_APPLICATION_FORBIDDEN',
                'The verification application is private to its applicant.',
            );
        }
        const evidence = await this.pool.query<EvidenceRow>(
            `SELECT evidence_id, application_id, evidence_kind, label,
                    issuer, issued_at, attachment_id, private_notes,
                    created_at
             FROM verification_evidence_metadata
             WHERE application_id = $1
             ORDER BY created_at, evidence_id`,
            [applicationId],
        );
        return {
            application: renderApplication(application),
            evidence: evidence.rows.map(renderEvidence),
        };
    }

    private async resolveSubject(
        actorDid: string,
        input: z.infer<typeof applicationSchema>,
    ): Promise<{ organizationId: string | null; subjectRef: string }> {
        if (input.subjectType === 'volunteer') {
            if (input.organizationId || input.resourceUri) {
                return invalid(
                    'INVALID_VERIFICATION_SUBJECT',
                    'Volunteer verification is bound to the current account.',
                );
            }
            return { organizationId: null, subjectRef: actorDid };
        }
        if (!input.organizationId) {
            return invalid(
                'INVALID_VERIFICATION_SUBJECT',
                'Organization membership is required for this verification subject.',
            );
        }
        await this.requireOrganizationRole(
            input.organizationId,
            actorDid,
            input.subjectType === 'organization' ? 'admin' : 'steward',
        );
        if (input.subjectType === 'organization') {
            if (input.resourceUri) {
                return invalid(
                    'INVALID_VERIFICATION_SUBJECT',
                    'Organization verification does not accept a resource URI.',
                );
            }
            return {
                organizationId: input.organizationId,
                subjectRef: input.organizationId,
            };
        }
        if (!input.resourceUri) {
            return invalid(
                'INVALID_VERIFICATION_SUBJECT',
                'Resource verification requires a public resource URI.',
            );
        }
        const stewardship = await this.pool.query(
            `SELECT 1 FROM organization_resource_stewardships
             WHERE organization_id = $1 AND resource_uri = $2
               AND status = 'active'`,
            [input.organizationId, input.resourceUri],
        );
        if (!stewardship.rowCount) {
            throw new PublicHttpError(
                403,
                'RESOURCE_STEWARDSHIP_REQUIRED',
                'Active resource stewardship is required.',
            );
        }
        return {
            organizationId: input.organizationId,
            subjectRef: input.resourceUri,
        };
    }

    private async assertAttachments(
        ownerDid: string,
        attachmentIds: string[],
    ): Promise<void> {
        if (!attachmentIds.length) return;
        const result = await this.pool.query<{ attachment_id: string }>(
            `SELECT attachment_id
             FROM private_attachments
             WHERE attachment_id = ANY($1::uuid[])
               AND owner_did = $2
               AND purpose = 'verification-evidence'
               AND status = 'clean'`,
            [attachmentIds, ownerDid],
        );
        if (
            new Set(result.rows.map(row => row.attachment_id)).size !==
            new Set(attachmentIds).size
        ) {
            throw new PublicHttpError(
                400,
                'VERIFICATION_ATTACHMENT_NOT_CLEAN',
                'Every evidence attachment must be owned by the applicant and have a clean verification-evidence decision.',
            );
        }
    }

    private async requireOrganizationRole(
        organizationId: string,
        actorDid: string,
        minimum: 'member' | 'steward' | 'admin' | 'owner',
    ): Promise<void> {
        const result = await this.pool.query<{
            role: 'member' | 'steward' | 'admin' | 'owner';
        }>(
            `SELECT role FROM organization_memberships
             WHERE organization_id = $1 AND member_did = $2
               AND status = 'active'`,
            [organizationId, actorDid],
        );
        const role = result.rows[0]?.role;
        if (
            !role ||
            organizationRoleRank[role] <
                organizationRoleRank[minimum]
        ) {
            throw new PublicHttpError(
                403,
                'VERIFICATION_SUBJECT_FORBIDDEN',
                `The ${minimum} organization capability is required.`,
            );
        }
    }

    private async loadApplication(
        client: Pick<Pool | PoolClient, 'query'>,
        applicationId: string,
        lock = false,
    ): Promise<ApplicationRow> {
        const result = await client.query<ApplicationRow>(
            `SELECT application_id, applicant_did, subject_type,
                    organization_id, subject_ref, status, submitted_at,
                    decided_at, expires_at, revoked_at, updated_at
             FROM verification_applications
             WHERE application_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
            [applicationId],
        );
        const row = result.rows[0];
        if (!row) {
            throw new PublicHttpError(
                404,
                'VERIFICATION_APPLICATION_NOT_FOUND',
                'The verification application was not found.',
            );
        }
        return row;
    }

    private async activeVerificationGates(
        client: Pick<Pool | PoolClient, 'query'>,
        organizationId: string,
        resourceUri: string,
        now: Date,
    ): Promise<{ organization: Date | null; resource: Date | null }> {
        const stewardship = await client.query(
            `SELECT 1
             FROM organization_resource_stewardships
             WHERE organization_id = $1 AND resource_uri = $2
               AND status = 'active'`,
            [organizationId, resourceUri],
        );
        if (!stewardship.rowCount) {
            return { organization: null, resource: null };
        }
        const result = await client.query<{
            subject_type: 'organization' | 'resource';
            expires_at: Date | string;
        }>(
            `SELECT DISTINCT ON (subject_type)
                    subject_type, expires_at
             FROM verification_applications
             WHERE organization_id = $1::uuid
               AND status = 'approved' AND expires_at > $3
               AND (
                   (subject_type = 'organization'
                    AND subject_ref = $1::text)
                   OR
                   (subject_type = 'resource' AND subject_ref = $2)
               )
             ORDER BY subject_type, expires_at DESC`,
            [organizationId, resourceUri, now],
        );
        const organization = result.rows.find(
            row => row.subject_type === 'organization',
        );
        const resource = result.rows.find(
            row => row.subject_type === 'resource',
        );
        return {
            organization:
                organization ? new Date(organization.expires_at) : null,
            resource: resource ? new Date(resource.expires_at) : null,
        };
    }

    private async revokeDependentExactAddresses(
        client: Pick<Pool | PoolClient, 'query'>,
        application: ApplicationRow,
        now: Date,
    ): Promise<void> {
        if (application.subject_type === 'volunteer') return;
        const revoked = await client.query<{ request_id: string }>(
            `UPDATE exact_public_address_requests
             SET status = 'revoked', approval_expires_at = NULL,
                 decision_reason = 'Dependent verification is inactive.',
                 updated_at = $3
             WHERE status = 'approved'
               AND (
                   ($1 = 'organization' AND organization_id::text = $2)
                   OR
                   ($1 = 'resource' AND resource_uri = $2)
               )
             RETURNING request_id`,
            [application.subject_type, application.subject_ref, now],
        );
        for (const item of revoked.rows) {
            await this.audit(
                client,
                null,
                'exact-address-revoked-by-verification',
                'exact-address',
                item.request_id,
                'Exact public-resource address revoked because dependent verification is inactive.',
                {
                    verificationApplicationId: application.application_id,
                    subjectType: application.subject_type,
                },
                now,
            );
        }
    }

    private async audit(
        client: Pick<Pool | PoolClient, 'query'>,
        actorDid: string | null,
        action: string,
        subjectType: string,
        subjectId: string,
        publicSummary: string,
        privateDetails: Record<string, unknown>,
        occurredAt: Date,
    ): Promise<void> {
        await client.query(
            `INSERT INTO verification_audit_events (
                actor_did, action, subject_type, subject_id,
                public_summary, private_details, occurred_at
             ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
            [
                actorDid,
                action,
                subjectType,
                subjectId,
                publicSummary,
                JSON.stringify(privateDetails),
                occurredAt,
            ],
        );
    }
}
