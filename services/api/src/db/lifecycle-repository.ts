import type { Pool, PoolClient } from 'pg';
import type {
    LifecycleRole,
    RequestStatus,
    RequestTimeline,
    AssignmentRecord,
    HandoffMetadata,
} from '@patchwork/shared';

export interface LifecycleTransitionCommand {
    commandId: string;
    postUri: string;
    actorDid: string;
    actorRole?: string;
    fromStatus: string;
    toStatus: string;
    occurredAt: string;
    reason?: string;
    auditRetentionUntil?: string;
}

export interface LifecycleTransitionOutcome {
    applied: boolean;
    transitionId: string;
}

export interface RegisterWorkflowInput {
    commandId: string;
    postUri: string;
    requesterDid: string;
    createdAt: string;
    retentionUntil?: string;
}

export interface RequestWorkflow {
    postUri: string;
    requesterDid: string;
    currentStatus: string;
    createdAt: string;
    updatedAt: string;
    timeline: RequestTimeline;
    assignment?: AssignmentRecord;
    handoff?: HandoffMetadata;
}

export interface LifecycleAssignmentCommand {
    commandId: string;
    postUri: string;
    assignerDid: string;
    assigneeDid: string;
    occurredAt: string;
    timeoutMs: number;
    auditRetentionUntil?: string;
}

export interface LifecycleAssignmentOutcome {
    applied: boolean;
    assignmentEventId: string;
    assignment: AssignmentRecord;
}

export interface LifecycleAssignmentResponseCommand {
    commandId: string;
    postUri: string;
    assigneeDid: string;
    response: 'accepted' | 'declined';
    occurredAt: string;
    reason?: string;
    auditRetentionUntil?: string;
}

export interface LifecycleAssignmentResponseOutcome {
    applied: boolean;
    assignmentEventId: string;
    assignment: AssignmentRecord;
    currentStatus: RequestStatus;
}

export interface LifecycleHandoffCommand {
    commandId: string;
    postUri: string;
    completedBy: string;
    occurredAt: string;
    notes?: string;
    recipientConfirmed?: boolean;
    deliveryMethod?: 'in_person' | 'shipped' | 'digital' | 'other';
    auditRetentionUntil?: string;
}

export interface LifecycleHandoffOutcome {
    applied: boolean;
    handoffEventId: string;
    handoff: HandoffMetadata;
    currentStatus: 'resolved';
}

export interface LifecycleRepository {
    register(input: RegisterWorkflowInput): Promise<boolean>;
    get(postUri: string): Promise<RequestWorkflow | undefined>;
    transition(
        command: LifecycleTransitionCommand,
    ): Promise<LifecycleTransitionOutcome>;
    assign(
        command: LifecycleAssignmentCommand,
    ): Promise<LifecycleAssignmentOutcome>;
    respondToAssignment(
        command: LifecycleAssignmentResponseCommand,
    ): Promise<LifecycleAssignmentResponseOutcome>;
    completeHandoff(command: LifecycleHandoffCommand): Promise<LifecycleHandoffOutcome>;
    deleteSubject(postUri: string): Promise<boolean>;
}

interface TransitionRow {
    transition_id: string | number;
}

const withTransaction = async <T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export class PostgresLifecycleRepository implements LifecycleRepository {
    constructor(private readonly pool: Pool) {}

    async register(input: RegisterWorkflowInput): Promise<boolean> {
        const result = await this.pool.query(
            `INSERT INTO request_workflows (
                post_uri, requester_did, current_status, create_command_id,
                retention_until, created_at, updated_at
             ) VALUES ($1, $2, 'open', $3, $4, $5, $5)
             ON CONFLICT (create_command_id) DO NOTHING`,
            [
                input.postUri,
                input.requesterDid,
                input.commandId,
                input.retentionUntil ?? null,
                input.createdAt,
            ],
        );
        return result.rowCount === 1;
    }

    async get(postUri: string): Promise<RequestWorkflow | undefined> {
        const result = await this.pool.query<{
            post_uri: string;
            requester_did: string;
            current_status: string;
            created_at: Date | string;
            updated_at: Date | string;
            assignment: AssignmentRecord | null;
            handoff: HandoffMetadata | null;
        }>(
            `SELECT post_uri, requester_did, current_status, created_at, updated_at,
                    assignment, handoff
             FROM request_workflows WHERE post_uri = $1`,
            [postUri],
        );
        const row = result.rows[0];
        if (!row) return undefined;

        const transitions = await this.pool.query<{
            from_status: RequestStatus;
            to_status: RequestStatus;
            actor_did: string;
            actor_role: LifecycleRole;
            reason: string | null;
            occurred_at: Date | string;
        }>(
            `SELECT from_status, to_status, actor_did, actor_role, reason, occurred_at
             FROM request_transition_events
             WHERE post_uri = $1
             ORDER BY occurred_at ASC, transition_id ASC`,
            [postUri],
        );

        return {
            postUri: row.post_uri,
            requesterDid: row.requester_did,
            currentStatus: row.current_status,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString(),
            timeline: transitions.rows.map(transition => ({
                from: transition.from_status,
                to: transition.to_status,
                actorDid: transition.actor_did,
                actorRole: transition.actor_role,
                timestamp: new Date(transition.occurred_at).toISOString(),
                ...(transition.reason === null ? {} : { reason: transition.reason }),
            })),
            ...(row.assignment === null ? {} : { assignment: row.assignment }),
            ...(row.handoff === null ? {} : { handoff: row.handoff }),
        };
    }

    async deleteSubject(postUri: string): Promise<boolean> {
        const result = await this.pool.query(
            'DELETE FROM request_workflows WHERE post_uri = $1',
            [postUri],
        );
        return result.rowCount === 1;
    }

    async transition(
        command: LifecycleTransitionCommand,
    ): Promise<LifecycleTransitionOutcome> {
        return withTransaction(this.pool, async client => {
            const duplicate = await client.query<TransitionRow>(
                `SELECT transition_id
                 FROM request_transition_events
                 WHERE command_id = $1`,
                [command.commandId],
            );
            const existing = duplicate.rows[0];
            if (existing) {
                return {
                    applied: false,
                    transitionId: String(existing.transition_id),
                };
            }

            const workflow = await client.query<{
                post_uri: string;
                current_status: string;
            }>(
                `SELECT post_uri, current_status
                 FROM request_workflows
                 WHERE post_uri = $1
                 FOR UPDATE`,
                [command.postUri],
            );
            const current = workflow.rows[0];
            if (!current) {
                throw new Error('REQUEST_WORKFLOW_NOT_FOUND');
            }
            const concurrentDuplicate = await client.query<TransitionRow>(
                `SELECT transition_id
                 FROM request_transition_events
                 WHERE command_id = $1`,
                [command.commandId],
            );
            const concurrentlyInserted = concurrentDuplicate.rows[0];
            if (concurrentlyInserted) {
                return {
                    applied: false,
                    transitionId: String(concurrentlyInserted.transition_id),
                };
            }
            if (current.current_status !== command.fromStatus) {
                throw new Error('LIFECYCLE_REVISION_CONFLICT');
            }

            const inserted = await client.query<TransitionRow>(
                `INSERT INTO request_transition_events (
                    command_id, post_uri, actor_did, actor_role,
                    from_status, to_status, reason, occurred_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING transition_id`,
                [
                    command.commandId,
                    command.postUri,
                    command.actorDid,
                    command.actorRole ?? 'requester',
                    command.fromStatus,
                    command.toStatus,
                    command.reason ?? null,
                    command.occurredAt,
                ],
            );

            await client.query(
                `UPDATE request_workflows
                 SET current_status = $2, updated_at = $3
                 WHERE post_uri = $1`,
                [command.postUri, command.toStatus, command.occurredAt],
            );

            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES ($1, $2, 'request.transitioned', $3, $4::jsonb, $5, $6)
                 ON CONFLICT (command_id) DO NOTHING`,
                [
                    `audit:${command.commandId}`,
                    command.actorDid,
                    command.postUri,
                    JSON.stringify({
                        fromStatus: command.fromStatus,
                        toStatus: command.toStatus,
                        actorRole: command.actorRole,
                    }),
                    command.auditRetentionUntil ?? command.occurredAt,
                    command.occurredAt,
                ],
            );

            const transition = inserted.rows[0];
            if (!transition) {
                throw new Error('TRANSITION_INSERT_FAILED');
            }
            return {
                applied: true,
                transitionId: String(transition.transition_id),
            };
        });
    }

    async assign(
        command: LifecycleAssignmentCommand,
    ): Promise<LifecycleAssignmentOutcome> {
        return withTransaction(this.pool, async client => {
            const duplicate = await client.query<{
                assignment_event_id: string | number;
                assignment: AssignmentRecord;
            }>(
                `SELECT assignment_event_id, assignment
                 FROM request_assignment_events WHERE command_id = $1`,
                [command.commandId],
            );
            const existing = duplicate.rows[0];
            if (existing) {
                return {
                    applied: false,
                    assignmentEventId: String(existing.assignment_event_id),
                    assignment: existing.assignment,
                };
            }

            const workflow = await client.query<{ current_status: RequestStatus }>(
                `SELECT current_status FROM request_workflows
                 WHERE post_uri = $1 FOR UPDATE`,
                [command.postUri],
            );
            const current = workflow.rows[0];
            if (!current) throw new Error('REQUEST_WORKFLOW_NOT_FOUND');
            if (!['triaged', 'assigned', 'in_progress'].includes(current.current_status)) {
                throw new Error('ASSIGNMENT_TRANSITION_NOT_ALLOWED');
            }

            const assignment: AssignmentRecord = {
                assigneeDid: command.assigneeDid,
                assignerDid: command.assignerDid,
                assignedAt: command.occurredAt,
                status: 'pending',
                timeoutMs: command.timeoutMs,
            };
            const inserted = await client.query<{
                assignment_event_id: string | number;
            }>(
                `INSERT INTO request_assignment_events (
                    command_id, post_uri, assigner_did, assignee_did,
                    assignment, occurred_at
                 ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                 RETURNING assignment_event_id`,
                [
                    command.commandId,
                    command.postUri,
                    command.assignerDid,
                    command.assigneeDid,
                    JSON.stringify(assignment),
                    command.occurredAt,
                ],
            );

            if (current.current_status !== 'assigned') {
                await client.query(
                    `INSERT INTO request_transition_events (
                        command_id, post_uri, actor_did, actor_role,
                        from_status, to_status, reason, occurred_at
                     ) VALUES ($1, $2, $3, 'coordinator', $4, 'assigned', $5, $6)`,
                    [
                        `assignment-transition:${command.commandId}`,
                        command.postUri,
                        command.assignerDid,
                        current.current_status,
                        `Assigned to ${command.assigneeDid}`,
                        command.occurredAt,
                    ],
                );
            }
            await client.query(
                `UPDATE request_workflows
                 SET current_status = 'assigned', assignment = $2::jsonb,
                     updated_at = $3
                 WHERE post_uri = $1`,
                [command.postUri, JSON.stringify(assignment), command.occurredAt],
            );
            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES ($1, $2, 'request.assigned', $3, $4::jsonb, $5, $6)`,
                [
                    `audit:${command.commandId}`,
                    command.assignerDid,
                    command.postUri,
                    JSON.stringify({ assigneeDid: command.assigneeDid }),
                    command.auditRetentionUntil ?? command.occurredAt,
                    command.occurredAt,
                ],
            );
            const event = inserted.rows[0];
            if (!event) throw new Error('ASSIGNMENT_INSERT_FAILED');
            return {
                applied: true,
                assignmentEventId: String(event.assignment_event_id),
                assignment,
            };
        });
    }

    async respondToAssignment(
        command: LifecycleAssignmentResponseCommand,
    ): Promise<LifecycleAssignmentResponseOutcome> {
        return withTransaction(this.pool, async client => {
            const duplicate = await client.query<{
                assignment_event_id: string | number;
                assignment: AssignmentRecord;
                event_type: 'accepted' | 'declined';
            }>(
                `SELECT assignment_event_id, assignment, event_type
                 FROM request_assignment_events WHERE command_id = $1`,
                [command.commandId],
            );
            const existing = duplicate.rows[0];
            if (existing) {
                return {
                    applied: false,
                    assignmentEventId: String(existing.assignment_event_id),
                    assignment: existing.assignment,
                    currentStatus:
                        existing.event_type === 'accepted' ? 'in_progress' : 'triaged',
                };
            }

            const workflow = await client.query<{
                current_status: RequestStatus;
                assignment: AssignmentRecord | null;
            }>(
                `SELECT current_status, assignment FROM request_workflows
                 WHERE post_uri = $1 FOR UPDATE`,
                [command.postUri],
            );
            const current = workflow.rows[0];
            if (!current) throw new Error('REQUEST_WORKFLOW_NOT_FOUND');
            if (!current.assignment || current.assignment.assigneeDid !== command.assigneeDid) {
                throw new Error('ASSIGNMENT_MISMATCH');
            }
            if (current.assignment.status !== 'pending') {
                throw new Error('ASSIGNMENT_ALREADY_RESPONDED');
            }
            if (current.current_status !== 'assigned') {
                throw new Error('ASSIGNMENT_TRANSITION_NOT_ALLOWED');
            }

            const assignment: AssignmentRecord = {
                ...current.assignment,
                status: command.response,
                respondedAt: command.occurredAt,
                ...(command.response === 'declined' && command.reason
                    ? { declineReason: command.reason }
                    : {}),
            };
            const nextStatus: RequestStatus =
                command.response === 'accepted' ? 'in_progress' : 'triaged';
            const reason =
                command.reason ??
                (command.response === 'accepted'
                    ? 'Assignment accepted'
                    : 'Assignment declined');
            const inserted = await client.query<{
                assignment_event_id: string | number;
            }>(
                `INSERT INTO request_assignment_events (
                    command_id, post_uri, assigner_did, assignee_did,
                    assignment, event_type, occurred_at
                 ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                 RETURNING assignment_event_id`,
                [
                    command.commandId,
                    command.postUri,
                    current.assignment.assignerDid,
                    command.assigneeDid,
                    JSON.stringify(assignment),
                    command.response,
                    command.occurredAt,
                ],
            );
            await client.query(
                `INSERT INTO request_transition_events (
                    command_id, post_uri, actor_did, actor_role,
                    from_status, to_status, reason, occurred_at
                 ) VALUES ($1, $2, $3, 'volunteer', 'assigned', $4, $5, $6)`,
                [
                    `assignment-response:${command.commandId}`,
                    command.postUri,
                    command.assigneeDid,
                    nextStatus,
                    reason,
                    command.occurredAt,
                ],
            );
            await client.query(
                `UPDATE request_workflows
                 SET current_status = $2, assignment = $3::jsonb, updated_at = $4
                 WHERE post_uri = $1`,
                [
                    command.postUri,
                    nextStatus,
                    JSON.stringify(assignment),
                    command.occurredAt,
                ],
            );
            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
                [
                    `audit:${command.commandId}`,
                    command.assigneeDid,
                    `request.assignment_${command.response}`,
                    command.postUri,
                    JSON.stringify({ assignmentStatus: command.response }),
                    command.auditRetentionUntil ?? command.occurredAt,
                    command.occurredAt,
                ],
            );
            const event = inserted.rows[0];
            if (!event) throw new Error('ASSIGNMENT_RESPONSE_INSERT_FAILED');
            return {
                applied: true,
                assignmentEventId: String(event.assignment_event_id),
                assignment,
                currentStatus: nextStatus,
            };
        });
    }

    async completeHandoff(
        command: LifecycleHandoffCommand,
    ): Promise<LifecycleHandoffOutcome> {
        return withTransaction(this.pool, async client => {
            const duplicate = await client.query<{
                handoff_event_id: string | number;
                handoff: HandoffMetadata;
            }>(
                `SELECT handoff_event_id, handoff FROM request_handoff_events
                 WHERE command_id = $1`,
                [command.commandId],
            );
            const existing = duplicate.rows[0];
            if (existing) {
                return {
                    applied: false,
                    handoffEventId: String(existing.handoff_event_id),
                    handoff: existing.handoff,
                    currentStatus: 'resolved',
                };
            }

            const workflow = await client.query<{
                current_status: RequestStatus;
                assignment: AssignmentRecord | null;
            }>(
                `SELECT current_status, assignment FROM request_workflows
                 WHERE post_uri = $1 FOR UPDATE`,
                [command.postUri],
            );
            const current = workflow.rows[0];
            if (!current) throw new Error('REQUEST_WORKFLOW_NOT_FOUND');
            if (
                !current.assignment ||
                current.assignment.assigneeDid !== command.completedBy
            ) {
                throw new Error('ASSIGNMENT_MISMATCH');
            }
            if (
                current.current_status !== 'in_progress' ||
                current.assignment.status !== 'accepted'
            ) {
                throw new Error('HANDOFF_TRANSITION_NOT_ALLOWED');
            }

            const handoff: HandoffMetadata = {
                completedBy: command.completedBy,
                completedAt: command.occurredAt,
                ...(command.notes === undefined ? {} : { notes: command.notes }),
                ...(command.recipientConfirmed === undefined
                    ? {}
                    : { recipientConfirmed: command.recipientConfirmed }),
                ...(command.deliveryMethod === undefined
                    ? {}
                    : { deliveryMethod: command.deliveryMethod }),
            };
            const inserted = await client.query<{
                handoff_event_id: string | number;
            }>(
                `INSERT INTO request_handoff_events (
                    command_id, post_uri, completed_by, handoff, occurred_at
                 ) VALUES ($1, $2, $3, $4::jsonb, $5)
                 RETURNING handoff_event_id`,
                [
                    command.commandId,
                    command.postUri,
                    command.completedBy,
                    JSON.stringify(handoff),
                    command.occurredAt,
                ],
            );
            await client.query(
                `INSERT INTO request_transition_events (
                    command_id, post_uri, actor_did, actor_role,
                    from_status, to_status, reason, occurred_at
                 ) VALUES ($1, $2, $3, 'volunteer', 'in_progress', 'resolved',
                           'Handoff completed', $4)`,
                [
                    `handoff-transition:${command.commandId}`,
                    command.postUri,
                    command.completedBy,
                    command.occurredAt,
                ],
            );
            await client.query(
                `UPDATE request_workflows
                 SET current_status = 'resolved', handoff = $2::jsonb, updated_at = $3
                 WHERE post_uri = $1`,
                [command.postUri, JSON.stringify(handoff), command.occurredAt],
            );
            await client.query(
                `INSERT INTO operational_audit_events (
                    command_id, actor_did, action, subject_uri, payload,
                    retention_until, occurred_at
                 ) VALUES ($1, $2, 'request.handoff_completed', $3, $4::jsonb, $5, $6)`,
                [
                    `audit:${command.commandId}`,
                    command.completedBy,
                    command.postUri,
                    JSON.stringify({
                        recipientConfirmed: command.recipientConfirmed ?? false,
                        deliveryMethod: command.deliveryMethod,
                    }),
                    command.auditRetentionUntil ?? command.occurredAt,
                    command.occurredAt,
                ],
            );
            const event = inserted.rows[0];
            if (!event) throw new Error('HANDOFF_INSERT_FAILED');
            return {
                applied: true,
                handoffEventId: String(event.handoff_event_id),
                handoff,
                currentStatus: 'resolved',
            };
        });
    }
}
