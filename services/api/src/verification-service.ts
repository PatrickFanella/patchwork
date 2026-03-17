import { randomUUID } from 'node:crypto';
import {
    type VerificationAppeal,
    type VerificationAudit,
    type VerificationStatus,
    type VerificationTier,
    TIER_RANK,
    appendAuditEntry,
    canUpgrade,
    computeExpiryDate,
    createVerificationStatus,
    isExpired,
    verificationTierSchema,
} from '@patchwork/shared';

export interface VerificationRouteResult {
    statusCode: number;
    body: unknown;
}

/**
 * In-memory verification service that manages verification statuses, audit
 * trails, and appeals for DIDs.
 */
export class ApiVerificationService {
    private readonly statuses = new Map<string, VerificationStatus>();
    private readonly appeals = new Map<string, VerificationAppeal>();

    // -----------------------------------------------------------------------
    // GET /verification/:did — get verification status
    // -----------------------------------------------------------------------

    getStatus(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'The "did" parameter is required.',
                    },
                },
            };
        }

        const status = this.statuses.get(did);
        if (!status) {
            return {
                statusCode: 200,
                body: {
                    did,
                    status: {
                        tier: 'unverified' as VerificationTier,
                        grantedAt: null,
                        expiresAt: null,
                        verifiedBy: null,
                        auditTrail: [],
                    },
                    expired: false,
                },
            };
        }

        return {
            statusCode: 200,
            body: {
                did,
                status,
                expired: isExpired(status),
            },
        };
    }

    // -----------------------------------------------------------------------
    // POST /verification/:did/grant — grant/upgrade tier
    // -----------------------------------------------------------------------

    grant(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const tierRaw = params.get('tier')?.trim();
        const reason = params.get('reason')?.trim();
        const passedCheckpoints = params.get('passedCheckpoints')?.trim();

        if (!did || !actorDid || !tierRaw || !reason) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message:
                            'Required fields: did, actorDid, tier, reason.',
                    },
                },
            };
        }

        const tierParse = verificationTierSchema.safeParse(tierRaw);
        if (!tierParse.success) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_TIER',
                        message: `Invalid tier value: ${tierRaw}`,
                    },
                },
            };
        }

        const targetTier = tierParse.data;
        const existing = this.statuses.get(did);
        const currentTier: VerificationTier = existing?.tier ?? 'unverified';

        // Validate checkpoints when upgrading
        if (TIER_RANK[targetTier] > TIER_RANK[currentTier]) {
            const checkpointIds = passedCheckpoints
                ? passedCheckpoints.split(',').map(s => s.trim()).filter(Boolean)
                : [];

            if (!canUpgrade(currentTier, targetTier, checkpointIds)) {
                return {
                    statusCode: 400,
                    body: {
                        error: {
                            code: 'CHECKPOINTS_NOT_MET',
                            message: `Cannot upgrade from ${currentTier} to ${targetTier}: required checkpoints not satisfied.`,
                        },
                    },
                };
            }
        }

        const now = new Date();
        const grantedAt = now.toISOString();
        const expiresAt = computeExpiryDate(targetTier, now);

        const auditEntry: VerificationAudit = {
            action: 'grant',
            actor: actorDid,
            timestamp: grantedAt,
            reason,
            previousTier: currentTier,
            newTier: targetTier,
        };

        const newStatus: VerificationStatus = existing
            ? {
                  ...appendAuditEntry(existing, auditEntry),
                  tier: targetTier,
                  grantedAt,
                  expiresAt,
                  verifiedBy: actorDid,
              }
            : createVerificationStatus(
                  targetTier,
                  actorDid,
                  reason,
                  currentTier,
                  now,
              );

        this.statuses.set(did, newStatus);

        return {
            statusCode: 200,
            body: {
                did,
                status: newStatus,
                action: 'grant',
            },
        };
    }

    // -----------------------------------------------------------------------
    // POST /verification/:did/revoke — revoke tier
    // -----------------------------------------------------------------------

    revoke(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const reason = params.get('reason')?.trim();

        if (!did || !actorDid || !reason) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required fields: did, actorDid, reason.',
                    },
                },
            };
        }

        const existing = this.statuses.get(did);
        const currentTier: VerificationTier = existing?.tier ?? 'unverified';

        if (currentTier === 'unverified') {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'ALREADY_UNVERIFIED',
                        message: 'Subject is already unverified.',
                    },
                },
            };
        }

        const now = new Date().toISOString();

        const auditEntry: VerificationAudit = {
            action: 'revoke',
            actor: actorDid,
            timestamp: now,
            reason,
            previousTier: currentTier,
            newTier: 'unverified',
        };

        const newStatus: VerificationStatus = {
            ...(existing as VerificationStatus),
            tier: 'unverified',
            grantedAt: now,
            expiresAt: null,
            verifiedBy: actorDid,
            auditTrail: [
                ...(existing?.auditTrail ?? []),
                auditEntry,
            ],
        };

        this.statuses.set(did, newStatus);

        return {
            statusCode: 200,
            body: {
                did,
                status: newStatus,
                action: 'revoke',
            },
        };
    }

    // -----------------------------------------------------------------------
    // POST /verification/:did/renew — renew verification
    // -----------------------------------------------------------------------

    renew(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        const actorDid = params.get('actorDid')?.trim();
        const reason = params.get('reason')?.trim() ?? 'Routine renewal';

        if (!did || !actorDid) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Required fields: did, actorDid.',
                    },
                },
            };
        }

        const existing = this.statuses.get(did);
        if (!existing || existing.tier === 'unverified') {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'NOTHING_TO_RENEW',
                        message:
                            'Subject has no active verification to renew.',
                    },
                },
            };
        }

        const now = new Date();
        const renewedAt = now.toISOString();
        const newExpiresAt = computeExpiryDate(existing.tier, now);

        const auditEntry: VerificationAudit = {
            action: 'renew',
            actor: actorDid,
            timestamp: renewedAt,
            reason,
            previousTier: existing.tier,
            newTier: existing.tier,
        };

        const newStatus: VerificationStatus = {
            ...appendAuditEntry(existing, auditEntry),
            grantedAt: renewedAt,
            expiresAt: newExpiresAt,
        };

        this.statuses.set(did, newStatus);

        return {
            statusCode: 200,
            body: {
                did,
                status: newStatus,
                action: 'renew',
            },
        };
    }

    // -----------------------------------------------------------------------
    // POST /verification/:did/appeal — submit appeal
    // -----------------------------------------------------------------------

    appeal(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        const requestedTierRaw = params.get('requestedTier')?.trim();
        const reason = params.get('reason')?.trim();

        if (!did || !requestedTierRaw || !reason) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_FIELDS',
                        message:
                            'Required fields: did, requestedTier, reason.',
                    },
                },
            };
        }

        const tierParse = verificationTierSchema.safeParse(requestedTierRaw);
        if (!tierParse.success) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_TIER',
                        message: `Invalid tier value: ${requestedTierRaw}`,
                    },
                },
            };
        }

        const existing = this.statuses.get(did);
        const currentTier: VerificationTier = existing?.tier ?? 'unverified';
        const requestedTier = tierParse.data;

        if (TIER_RANK[requestedTier] <= TIER_RANK[currentTier]) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'INVALID_APPEAL',
                        message:
                            'Can only appeal to a higher tier than the current one.',
                    },
                },
            };
        }

        const appealId = randomUUID();
        const now = new Date().toISOString();

        const appealRecord: VerificationAppeal = {
            id: appealId,
            subjectDid: did,
            currentTier,
            requestedTier,
            reason,
            status: 'pending',
            createdAt: now,
        };

        this.appeals.set(appealId, appealRecord);

        // Record escalation in the audit trail
        if (existing) {
            const auditEntry: VerificationAudit = {
                action: 'appeal',
                actor: did,
                timestamp: now,
                reason: `Appeal submitted for ${requestedTier}: ${reason}`,
                previousTier: currentTier,
                newTier: currentTier, // tier doesn't change on appeal submission
            };

            this.statuses.set(did, appendAuditEntry(existing, auditEntry));
        }

        return {
            statusCode: 201,
            body: {
                appeal: appealRecord,
            },
        };
    }

    // -----------------------------------------------------------------------
    // GET /verification/:did/audit — get audit trail
    // -----------------------------------------------------------------------

    getAuditTrail(params: URLSearchParams): VerificationRouteResult {
        const did = params.get('did')?.trim();
        if (!did) {
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: 'MISSING_DID',
                        message: 'The "did" parameter is required.',
                    },
                },
            };
        }

        const status = this.statuses.get(did);
        const auditTrail = status?.auditTrail ?? [];

        // Also include any appeals for this DID
        const didAppeals = [...this.appeals.values()].filter(
            a => a.subjectDid === did,
        );

        return {
            statusCode: 200,
            body: {
                did,
                auditTrail,
                appeals: didAppeals,
            },
        };
    }
}

export const createFixtureVerificationService =
    (): ApiVerificationService => {
        return new ApiVerificationService();
    };
