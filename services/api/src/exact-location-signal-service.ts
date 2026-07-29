import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { PublicHttpError } from './http/error-response.js';

const connectionInputSchema = z
    .object({ connectionId: z.string().uuid() })
    .strict();
const consentInputSchema = z
    .object({
        connectionId: z.string().uuid(),
        consent: z.literal(true),
    })
    .strict();
const descriptionPayloadSchema = z
    .object({
        type: z.enum(['offer', 'answer']),
        sdp: z.string().min(1).max(100_000),
    })
    .strict();
const candidatePayloadSchema = z
    .object({
        candidate: z.string().max(4_096),
        sdpMid: z.string().max(256).nullable(),
        sdpMLineIndex: z.number().int().min(0).max(65_535).nullable(),
        usernameFragment: z.string().max(256).nullable(),
    })
    .strict();
const signalInputSchema = z.discriminatedUnion('kind', [
    z
        .object({
            connectionId: z.string().uuid(),
            sessionId: z.string().uuid(),
            kind: z.literal('description'),
            payload: descriptionPayloadSchema,
        })
        .strict(),
    z
        .object({
            connectionId: z.string().uuid(),
            sessionId: z.string().uuid(),
            kind: z.literal('candidate'),
            payload: candidatePayloadSchema,
        })
        .strict(),
    z
        .object({
            connectionId: z.string().uuid(),
            sessionId: z.string().uuid(),
            kind: z.literal('end-of-candidates'),
            payload: z.object({}).strict(),
        })
        .strict(),
]);

const CONSENT_WINDOW_MS = 2 * 60 * 1_000;
const SESSION_LIFETIME_MS = 5 * 60 * 1_000;
const MAX_SIGNALS_PER_SESSION = 100;
const forbiddenCoordinateKey =
    /(^|[^a-z])(exactLatitude|exactLongitude|latitude|longitude|coordinates?|streetAddress)([^a-z]|$)/i;

interface ConnectionRow {
    connection_id: string;
    request_uri: string;
    requester_did: string;
    helper_did: string;
    status: string;
}

interface EphemeralSignal {
    sequence: number;
    fromDid: string;
    kind: 'description' | 'candidate' | 'end-of-candidates';
    payload: Record<string, unknown>;
    createdAt: Date;
}

interface EphemeralSession {
    sessionId: string;
    connectionId: string;
    requesterDid: string;
    helperDid: string;
    issuedAt: Date;
    expiresAt: Date;
    status: 'pending' | 'active' | 'revoked' | 'expired';
    answerConsumed: boolean;
    proofs: Map<string, string>;
    signals: EphemeralSignal[];
    nextSequence: number;
}

const invalid = (code: string, message: string): never => {
    throw new PublicHttpError(400, code, message);
};

const containsForbiddenCoordinateShape = (value: unknown): boolean => {
    if (Array.isArray(value)) {
        return value.some(containsForbiddenCoordinateShape);
    }
    if (typeof value !== 'object' || value === null) return false;
    return Object.entries(value).some(
        ([key, nested]) =>
            forbiddenCoordinateKey.test(key) ||
            containsForbiddenCoordinateShape(nested),
    );
};

export class ExactLocationSignalService {
    private readonly consents = new Map<string, Map<string, Date>>();
    private readonly sessions = new Map<string, EphemeralSession>();

    constructor(
        private readonly pool: Pool,
        private readonly isMaintenanceMode: () => boolean = () => false,
    ) {}

    async consent(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = consentInputSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_LOCATION_CONSENT',
                'The location-sharing consent is invalid.',
            );
        }
        this.assertAvailable();
        const connection = await this.authorize(
            actorDid,
            parsed.data.connectionId,
        );
        this.sweep(now);
        const existing = this.sessions.get(connection.connection_id);
        if (
            existing &&
            existing.status !== 'expired' &&
            existing.status !== 'revoked'
        ) {
            return this.renderState(actorDid, connection, now);
        }
        const grants =
            this.consents.get(connection.connection_id) ??
            new Map<string, Date>();
        grants.set(actorDid, now);
        for (const [did, grantedAt] of grants) {
            if (now.getTime() - grantedAt.getTime() > CONSENT_WINDOW_MS) {
                grants.delete(did);
            }
        }
        this.consents.set(connection.connection_id, grants);
        if (
            grants.has(connection.requester_did) &&
            grants.has(connection.helper_did)
        ) {
            const session: EphemeralSession = {
                sessionId: randomUUID(),
                connectionId: connection.connection_id,
                requesterDid: connection.requester_did,
                helperDid: connection.helper_did,
                issuedAt: now,
                expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
                status: 'pending',
                answerConsumed: false,
                proofs: new Map([
                    [
                        connection.requester_did,
                        randomBytes(32).toString('base64url'),
                    ],
                    [
                        connection.helper_did,
                        randomBytes(32).toString('base64url'),
                    ],
                ]),
                signals: [],
                nextSequence: 1,
            };
            this.sessions.set(connection.connection_id, session);
        }
        return this.renderState(actorDid, connection, now);
    }

    async state(
        actorDid: string,
        connectionId: string,
        afterSequence = 0,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = connectionInputSchema.safeParse({ connectionId });
        if (
            !parsed.success ||
            !Number.isInteger(afterSequence) ||
            afterSequence < 0
        ) {
            return invalid(
                'INVALID_LOCATION_SESSION_QUERY',
                'The location session query is invalid.',
            );
        }
        this.assertAvailable();
        let connection: ConnectionRow;
        try {
            connection = await this.authorize(actorDid, connectionId);
        } catch (error) {
            this.revokeInternal(connectionId, new Date(), 'authorization-lost');
            throw error;
        }
        this.sweep(now);
        return this.renderState(actorDid, connection, now, afterSequence);
    }

    async signal(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = signalInputSchema.safeParse(input);
        if (!parsed.success || containsForbiddenCoordinateShape(input)) {
            return invalid(
                'INVALID_LOCATION_SIGNAL',
                'The coordinate-free location signal is invalid.',
            );
        }
        this.assertAvailable();
        let connection: ConnectionRow;
        try {
            connection = await this.authorize(
                actorDid,
                parsed.data.connectionId,
            );
        } catch (error) {
            this.revokeInternal(
                parsed.data.connectionId,
                now,
                'authorization-lost',
            );
            throw error;
        }
        this.sweep(now);
        const session = this.sessions.get(connection.connection_id);
        if (
            !session ||
            session.sessionId !== parsed.data.sessionId ||
            !['pending', 'active'].includes(session.status)
        ) {
            throw new PublicHttpError(
                409,
                'LOCATION_SESSION_UNAVAILABLE',
                'The location-sharing session is unavailable.',
            );
        }
        if (session.signals.length >= MAX_SIGNALS_PER_SESSION) {
            throw new PublicHttpError(
                429,
                'LOCATION_SIGNAL_LIMIT_REACHED',
                'The location-sharing signal limit was reached.',
            );
        }
        if (parsed.data.kind === 'description') {
            const expectedActor =
                parsed.data.payload.type === 'offer' ?
                    connection.requester_did
                :   connection.helper_did;
            if (actorDid !== expectedActor) {
                throw new PublicHttpError(
                    403,
                    'LOCATION_SIGNAL_ROLE_FORBIDDEN',
                    'The participant cannot send this signal.',
                );
            }
            if (
                parsed.data.payload.type === 'answer' &&
                session.answerConsumed
            ) {
                throw new PublicHttpError(
                    409,
                    'LOCATION_SESSION_ALREADY_USED',
                    'The single-use location session was already answered.',
                );
            }
            if (parsed.data.payload.type === 'answer') {
                session.answerConsumed = true;
                session.status = 'active';
            }
        }
        const sequence = session.nextSequence++;
        session.signals.push({
            sequence,
            fromDid: actorDid,
            kind: parsed.data.kind,
            payload: parsed.data.payload,
            createdAt: now,
        });
        return {
            accepted: true,
            sequence,
            status: session.status,
            expiresAt: session.expiresAt.toISOString(),
        };
    }

    async revoke(
        actorDid: string,
        input: unknown,
        now = new Date(),
    ): Promise<Record<string, unknown>> {
        const parsed = connectionInputSchema.safeParse(input);
        if (!parsed.success) {
            return invalid(
                'INVALID_LOCATION_REVOCATION',
                'The location session revocation is invalid.',
            );
        }
        const connection = await this.loadConnection(parsed.data.connectionId);
        this.assertParticipant(actorDid, connection);
        this.revokeInternal(
            connection.connection_id,
            now,
            'participant-revoked',
        );
        return {
            connectionId: connection.connection_id,
            status: 'revoked',
            revokedAt: now.toISOString(),
        };
    }

    sweep(now = new Date()): {
        expiredSessions: number;
        expiredConsents: number;
    } {
        let expiredSessions = 0;
        let expiredConsents = 0;
        for (const [connectionId, grants] of this.consents) {
            for (const [did, grantedAt] of grants) {
                if (now.getTime() - grantedAt.getTime() > CONSENT_WINDOW_MS) {
                    grants.delete(did);
                    expiredConsents += 1;
                }
            }
            if (grants.size === 0) this.consents.delete(connectionId);
        }
        for (const [connectionId, session] of this.sessions) {
            if (
                ['pending', 'active'].includes(session.status) &&
                session.expiresAt <= now
            ) {
                session.status = 'expired';
                session.proofs.clear();
                session.signals.length = 0;
                expiredSessions += 1;
            }
            if (
                ['expired', 'revoked'].includes(session.status) &&
                now.getTime() - session.expiresAt.getTime() >
                    SESSION_LIFETIME_MS
            ) {
                this.sessions.delete(connectionId);
            }
        }
        return { expiredSessions, expiredConsents };
    }

    private renderState(
        actorDid: string,
        connection: ConnectionRow,
        now: Date,
        afterSequence = 0,
    ): Record<string, unknown> {
        const grants = this.consents.get(connection.connection_id);
        const counterpartDid =
            actorDid === connection.requester_did ?
                connection.helper_did
            :   connection.requester_did;
        const session = this.sessions.get(connection.connection_id);
        return {
            connectionId: connection.connection_id,
            consent: {
                actorConsented: Boolean(grants?.has(actorDid)),
                peerConsented: Boolean(grants?.has(counterpartDid)),
                freshForSeconds: CONSENT_WINDOW_MS / 1_000,
            },
            session:
                session ?
                    {
                        id: session.sessionId,
                        status: session.status,
                        role:
                            actorDid === connection.requester_did ?
                                'offerer'
                            :   'answerer',
                        singleUse: true,
                        issuedAt: session.issuedAt.toISOString(),
                        expiresAt: session.expiresAt.toISOString(),
                        participantProof: session.proofs.get(actorDid) ?? null,
                        expectedPeerProof:
                            session.proofs.get(counterpartDid) ?? null,
                        signals: session.signals
                            .filter(
                                signal =>
                                    signal.fromDid !== actorDid &&
                                    signal.sequence > afterSequence,
                            )
                            .map(signal => ({
                                sequence: signal.sequence,
                                kind: signal.kind,
                                payload: signal.payload,
                            })),
                    }
                :   null,
            serverTime: now.toISOString(),
        };
    }

    private async authorize(
        actorDid: string,
        connectionId: string,
    ): Promise<ConnectionRow> {
        const connection = await this.loadConnection(connectionId);
        this.assertParticipant(actorDid, connection);
        if (connection.status !== 'active') {
            throw new PublicHttpError(
                409,
                'LOCATION_CONNECTION_NOT_ACTIVE',
                'Exact location is available only on an active connection.',
            );
        }
        const unsafe = await this.pool.query(
            `SELECT 1
             WHERE EXISTS (
                 SELECT 1 FROM account_deactivations
                 WHERE did_hash = ANY($1::text[])
             )
             OR EXISTS (
                 SELECT 1 FROM user_blocks
                 WHERE deleted_at IS NULL
                   AND (
                        (blocker_did = $2 AND subject_did = $3)
                        OR
                        (blocker_did = $3 AND subject_did = $2)
                   )
             )
             OR EXISTS (
                 SELECT 1 FROM moderation_queue_items
                 WHERE subject_uri = $4
                   AND (
                        visibility <> 'visible'
                        OR queue_status = 'queued'
                        OR appeal_state IN ('pending', 'under-review')
                   )
             )`,
            [
                [
                    this.hashDid(connection.requester_did),
                    this.hashDid(connection.helper_did),
                ],
                connection.requester_did,
                connection.helper_did,
                connection.request_uri,
            ],
        );
        if (unsafe.rowCount) {
            throw new PublicHttpError(
                409,
                'LOCATION_AUTHORIZATION_LOST',
                'The location-sharing authorization is no longer active.',
            );
        }
        return connection;
    }

    private async loadConnection(connectionId: string): Promise<ConnectionRow> {
        const result = await this.pool.query<ConnectionRow>(
            `SELECT connection_id, request_uri, requester_did, helper_did,
                    status
             FROM coordination_connections
             WHERE connection_id = $1`,
            [connectionId],
        );
        if (!result.rows[0]) {
            throw new PublicHttpError(
                404,
                'LOCATION_CONNECTION_NOT_FOUND',
                'The connection was not found.',
            );
        }
        return result.rows[0];
    }

    private assertParticipant(
        actorDid: string,
        connection: ConnectionRow,
    ): void {
        if (
            actorDid !== connection.requester_did &&
            actorDid !== connection.helper_did
        ) {
            throw new PublicHttpError(
                403,
                'LOCATION_CONNECTION_FORBIDDEN',
                'Only a connection participant may share a location.',
            );
        }
    }

    private assertAvailable(): void {
        if (this.isMaintenanceMode()) {
            throw new PublicHttpError(
                503,
                'LOCATION_EXCHANGE_DISABLED',
                'Exact-location exchange is disabled during maintenance.',
            );
        }
    }

    private revokeInternal(
        connectionId: string,
        now: Date,
        _reason: 'participant-revoked' | 'authorization-lost',
    ): void {
        const session = this.sessions.get(connectionId);
        if (session) {
            session.status = 'revoked';
            session.expiresAt = now;
            session.proofs.clear();
            session.signals.length = 0;
        }
        this.consents.delete(connectionId);
    }

    private hashDid(did: string): string {
        return createHash('sha256').update(did).digest('hex');
    }
}
