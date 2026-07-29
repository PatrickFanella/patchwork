import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const inputSchema = z
    .object({
        actorDid: z.string().regex(/^did:[A-Za-z0-9]+:[A-Za-z0-9._:%-]+$/),
        subjectUri: z.string().regex(/^at:\/\/did:[^/]+\/[^/]+\/[^/]+$/),
        submissionType: z.enum([
            'aid-post',
            'directory-resource',
            'volunteer-profile',
        ]),
        operation: z.enum(['create', 'update']),
        record: z.record(z.string(), z.unknown()),
        attachmentIds: z.array(z.string().uuid()).max(25).default([]),
        idempotencyKey: z.string().min(1).max(300),
    })
    .strict();

export type SubmissionSafetyInput = z.infer<typeof inputSchema>;
export interface SubmissionSafetyDecision {
    decision: 'accepted' | 'quarantined' | 'rejected';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    reasonCodes: string[];
    userReasonCode: string;
    userMessage: string;
    safePreview: Record<string, string>;
    providerVersion: string;
    reviewedAt: string;
}

export interface SubmissionAutomationProvider {
    readonly version: string;
    evaluate(input: SubmissionSafetyInput): Promise<
        Omit<
            SubmissionSafetyDecision,
            'providerVersion' | 'reviewedAt'
        >
    >;
}

const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
};

const textValues = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(textValues);
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>)
            .flatMap(textValues);
    }
    return [];
};

const locations = (
    value: unknown,
): Array<{ latitude: number; longitude: number; precisionKm: number }> => {
    if (Array.isArray(value)) return value.flatMap(locations);
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const found =
        typeof record['latitude'] === 'number' &&
        typeof record['longitude'] === 'number' ?
            [{
                latitude: record['latitude'],
                longitude: record['longitude'],
                precisionKm:
                    typeof record['precisionKm'] === 'number' ?
                        record['precisionKm']
                    :   0,
            }]
        :   [];
    return [
        ...found,
        ...Object.values(record).flatMap(locations),
    ];
};

const inUnitedStates = (latitude: number, longitude: number): boolean =>
    (latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66) ||
    (latitude >= 51 && latitude <= 72 && longitude >= -170 && longitude <= -129) ||
    (latitude >= 18 && latitude <= 23 && longitude >= -161 && longitude <= -154);

const preview = (
    input: SubmissionSafetyInput,
): Record<string, string> => {
    const record = input.record;
    const label =
        typeof record['title'] === 'string' ? record['title']
        : typeof record['name'] === 'string' ? record['name']
        : typeof record['displayName'] === 'string' ? record['displayName']
        : 'Submitted content';
    const area =
        typeof record['serviceArea'] === 'string' ? record['serviceArea']
        : typeof record['category'] === 'string' ? record['category']
        : input.submissionType;
    return {
        label: label.slice(0, 120),
        category: area.slice(0, 80),
        submissionType: input.submissionType,
        operation: input.operation,
    };
};

const result = (
    input: SubmissionSafetyInput,
    decision: SubmissionSafetyDecision['decision'],
    priority: SubmissionSafetyDecision['priority'],
    reasonCodes: string[],
    userReasonCode: string,
    userMessage: string,
) => ({
    decision,
    priority,
    reasonCodes,
    userReasonCode,
    userMessage,
    safePreview: preview(input),
});

export class DeterministicSubmissionAutomationProvider
implements SubmissionAutomationProvider {
    readonly version = 'deterministic-safety-v1';

    async evaluate(input: SubmissionSafetyInput) {
        const serialized = stable(input.record);
        if (serialized.length > 30_000) {
            return result(
                input,
                'rejected',
                'normal',
                ['length-limit'],
                'SUBMISSION_TOO_LONG',
                'The submission is too long for safe publication.',
            );
        }
        const record = input.record;
        const required =
            input.submissionType === 'aid-post' ?
                ['title', 'description', 'category']
            : input.submissionType === 'directory-resource' ?
                ['name', 'serviceArea', 'category']
            :   ['displayName', 'capabilities', 'availability'];
        if (required.some(key => !(key in record))) {
            return result(
                input,
                'rejected',
                'normal',
                ['schema-invalid'],
                'SUBMISSION_INVALID',
                'The submission is missing required public fields.',
            );
        }
        const geo = locations(record);
        if (geo.some(point => !inUnitedStates(point.latitude, point.longitude))) {
            return result(
                input,
                'rejected',
                'normal',
                ['outside-us'],
                'US_LOCATION_REQUIRED',
                'Patchwork currently accepts submissions in U.S. service areas only.',
            );
        }
        if (geo.some(point => point.precisionKm < 1)) {
            return result(
                input,
                'rejected',
                'high',
                ['location-too-precise'],
                'APPROXIMATE_LOCATION_REQUIRED',
                'Use an approximate service area instead of a precise location.',
            );
        }
        const publicRecord =
            input.submissionType === 'directory-resource' ?
                { ...record, contact: undefined }
            :   record;
        const content = textValues(publicRecord).join(' ');
        if (
            /\b(?:call\s*911|suicid(?:e|al)|overdos(?:e|ing)|active\s+fire|immediate\s+danger)\b/iu
                .test(content)
        ) {
            return result(
                input,
                'quarantined',
                'urgent',
                ['emergency-intent'],
                'EMERGENCY_INTENT_REVIEW',
                'This may describe an emergency. Patchwork is not an emergency service, and the submission was held for review.',
            );
        }
        if (
            /\b(?:bomb\s+threat|credible\s+threat|child\s+sexual\s+abuse|instructions?\s+to\s+harm)\b/iu
                .test(content)
        ) {
            return result(
                input,
                'quarantined',
                'urgent',
                ['prohibited-content'],
                'CONTENT_REVIEW_REQUIRED',
                'The submission was held for safety review.',
            );
        }
        if (
            /\b\d{3}-\d{2}-\d{4}\b/u.test(content) ||
            /\b(?:\d[ -]*?){13,19}\b/u.test(content) ||
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(content) ||
            /\b\d{1,5}\s+[A-Za-z0-9.'-]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd)\b/iu
                .test(content)
        ) {
            return result(
                input,
                'quarantined',
                'high',
                ['sensitive-data'],
                'SENSITIVE_DATA_REVIEW',
                'The submission may contain sensitive personal data and was held for review.',
            );
        }
        if (
            /"(?:attachment|fileBody|dataUrl|signedUrl|objectKey)"/iu
                .test(serialized)
        ) {
            return result(
                input,
                'rejected',
                'high',
                ['embedded-attachment'],
                'PRIVATE_ATTACHMENT_REQUIRED',
                'Files must use Patchwork private attachment controls.',
            );
        }
        return result(
            input,
            'accepted',
            'normal',
            [],
            'SUBMISSION_ACCEPTED',
            'The submission passed publication safety checks.',
        );
    }
}

interface ReviewRow {
    decision: SubmissionSafetyDecision['decision'];
    priority: SubmissionSafetyDecision['priority'];
    reason_codes: string[];
    user_reason_code: string;
    user_message: string;
    safe_preview: Record<string, string>;
    provider_version: string;
    reviewed_at: Date | string;
}

const transact = async <T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const output = await work(client);
        await client.query('COMMIT');
        return output;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export class SubmissionSafetyService {
    constructor(
        private readonly pool: Pool,
        private readonly provider: SubmissionAutomationProvider =
            new DeterministicSubmissionAutomationProvider(),
    ) {}

    async review(raw: unknown, now = new Date()): Promise<SubmissionSafetyDecision> {
        const input = inputSchema.parse(raw);
        const contentHash = createHash('sha256')
            .update(stable(input.record))
            .digest('hex');
        const existing = await this.pool.query<ReviewRow>(
            `SELECT decision, priority, reason_codes, user_reason_code,
                    user_message, safe_preview,
                    provider_version, reviewed_at
               FROM moderation_submission_reviews
              WHERE idempotency_key = $1`,
            [input.idempotencyKey],
        );
        if (existing.rows[0]) {
            return this.render(existing.rows[0]);
        }
        const attachmentFailure =
            input.attachmentIds.length ?
                await this.pool.query<{ attachment_id: string }>(
                    `SELECT requested.attachment_id
                       FROM unnest($1::uuid[]) AS requested(attachment_id)
                       LEFT JOIN private_attachments attachment
                         ON attachment.attachment_id =
                            requested.attachment_id
                      WHERE attachment.attachment_id IS NULL
                         OR attachment.owner_did <> $2
                         OR attachment.status <> 'clean'`,
                    [input.attachmentIds, input.actorDid],
                )
            :   { rows: [] };
        const evaluated =
            attachmentFailure.rows.length ?
                result(
                    input,
                    'quarantined',
                    'high',
                    ['attachment-not-clean'],
                    'ATTACHMENT_REVIEW_REQUIRED',
                    'The submission was held until every private attachment passes scanning.',
                )
            :   await this.provider.evaluate(input);
        const decision: SubmissionSafetyDecision = {
            ...evaluated,
            providerVersion: this.provider.version,
            reviewedAt: now.toISOString(),
        };
        return transact(this.pool, async client => {
            await client.query(
                `INSERT INTO moderation_submission_reviews (
                    idempotency_key, actor_did, subject_uri,
                    submission_type, operation, content_hash,
                    provider_version, decision, priority, reason_codes,
                    user_reason_code, user_message, safe_preview, reviewed_at,
                    retention_until
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    $10::jsonb, $11, $12, $13::jsonb, $14, $15
                 )`,
                [
                    input.idempotencyKey,
                    input.actorDid,
                    input.subjectUri,
                    input.submissionType,
                    input.operation,
                    contentHash,
                    decision.providerVersion,
                    decision.decision,
                    decision.priority,
                    JSON.stringify(decision.reasonCodes),
                    decision.userReasonCode,
                    decision.userMessage,
                    JSON.stringify(decision.safePreview),
                    decision.reviewedAt,
                    new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000),
                ],
            );
            if (decision.decision === 'quarantined') {
                const queueId = createHash('sha256')
                    .update(input.subjectUri)
                    .digest('hex')
                    .slice(0, 20);
                await client.query(
                    `INSERT INTO moderation_queue_items (
                        subject_uri, queue_id, subject_type, reasons,
                        latest_reason, report_count, queue_status,
                        visibility, appeal_state, context, priority,
                        reason_codes, safe_preview, automated_decision,
                        created_at, requested_at, updated_at
                     ) VALUES (
                        $1, $2, $3, $4::jsonb, $5, 1, 'queued',
                        'suspended', 'none', '{}'::jsonb, $6,
                        $7::jsonb, $8::jsonb, 'quarantined', $9, $9, $9
                     )
                     ON CONFLICT (subject_uri) DO UPDATE SET
                        reasons = EXCLUDED.reasons,
                        latest_reason = EXCLUDED.latest_reason,
                        report_count =
                            moderation_queue_items.report_count + 1,
                        queue_status = 'queued', visibility = 'suspended',
                        priority = EXCLUDED.priority,
                        reason_codes = EXCLUDED.reason_codes,
                        safe_preview = EXCLUDED.safe_preview,
                        automated_decision = 'quarantined',
                        requested_at = EXCLUDED.requested_at,
                        updated_at = EXCLUDED.updated_at,
                        retention_until = NULL`,
                    [
                        input.subjectUri,
                        queueId,
                        input.submissionType === 'volunteer-profile' ?
                            'other'
                        :   input.submissionType,
                        JSON.stringify(decision.reasonCodes),
                        decision.userReasonCode,
                        decision.priority,
                        JSON.stringify(decision.reasonCodes),
                        JSON.stringify(decision.safePreview),
                        decision.reviewedAt,
                    ],
                );
                if (decision.priority === 'urgent') {
                    await client.query(
                        `INSERT INTO moderation_notification_events (
                            subject_uri, priority, reason_codes,
                            deduplication_key, created_at, retention_until
                         ) VALUES ($1, 'urgent', $2::jsonb, $3, $4, $5)
                         ON CONFLICT (deduplication_key) DO NOTHING`,
                        [
                            input.subjectUri,
                            JSON.stringify(decision.reasonCodes),
                            `urgent-submission:${contentHash}`,
                            decision.reviewedAt,
                            new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
                        ],
                    );
                }
            }
            return decision;
        });
    }

    async pendingUrgentNotifications(): Promise<number> {
        const result = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM moderation_notification_events
              WHERE consumed_at IS NULL AND priority = 'urgent'`,
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    private render(row: ReviewRow): SubmissionSafetyDecision {
        return {
            decision: row.decision,
            priority: row.priority,
            reasonCodes: row.reason_codes,
            userReasonCode: row.user_reason_code,
            userMessage: row.user_message,
            safePreview: row.safe_preview,
            providerVersion: row.provider_version,
            reviewedAt: new Date(row.reviewed_at).toISOString(),
        };
    }
}
