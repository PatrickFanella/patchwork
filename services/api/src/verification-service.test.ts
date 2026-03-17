import { describe, expect, it, beforeEach } from 'vitest';
import { TIER_DEFINITIONS } from '@patchwork/shared';
import { ApiVerificationService } from './verification-service.js';

const ADMIN_DID = 'did:example:admin';
const VOLUNTEER_DID = 'did:example:volunteer-a';

const toParams = (obj: Record<string, string>): URLSearchParams =>
    new URLSearchParams(obj);

describe('ApiVerificationService', () => {
    let service: ApiVerificationService;

    beforeEach(() => {
        service = new ApiVerificationService();
    });

    // -------------------------------------------------------------------
    // GET status
    // -------------------------------------------------------------------

    describe('getStatus', () => {
        it('returns unverified for an unknown DID', () => {
            const result = service.getStatus(
                toParams({ did: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { did: string; status: { tier: string } };
            expect(body.status.tier).toBe('unverified');
        });

        it('returns 400 when did is missing', () => {
            const result = service.getStatus(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns the current status after a grant', () => {
            const basicCheckpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Passed basic checks',
                    passedCheckpoints: basicCheckpoints,
                }),
            );

            const result = service.getStatus(
                toParams({ did: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as { status: { tier: string } };
            expect(body.status.tier).toBe('basic');
        });
    });

    // -------------------------------------------------------------------
    // Grant
    // -------------------------------------------------------------------

    describe('grant', () => {
        it('grants basic tier with correct checkpoints', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            const result = service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Passed basic checks',
                    passedCheckpoints: checkpoints,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { status: { tier: string; auditTrail: unknown[] } };
            expect(body.status.tier).toBe('basic');
            expect(body.status.auditTrail).toHaveLength(1);
        });

        it('rejects grant when checkpoints are not met', () => {
            const result = service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'verified',
                    reason: 'Trying without checkpoints',
                    passedCheckpoints: '',
                }),
            );

            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('CHECKPOINTS_NOT_MET');
        });

        it('rejects grant with missing required fields', () => {
            const result = service.grant(
                toParams({ did: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(400);
        });

        it('rejects grant with invalid tier value', () => {
            const result = service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'super-duper',
                    reason: 'test',
                }),
            );
            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('INVALID_TIER');
        });

        it('builds cumulative audit trail on successive grants', () => {
            const basicCheckpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');
            const verifiedCheckpoints = [
                ...TIER_DEFINITIONS.verified.autoCheckpoints.map(cp => cp.id),
                ...TIER_DEFINITIONS.verified.manualCheckpoints.map(cp => cp.id),
            ].join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Basic grant',
                    passedCheckpoints: basicCheckpoints,
                }),
            );

            const result = service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'verified',
                    reason: 'Verified grant',
                    passedCheckpoints: verifiedCheckpoints,
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { status: { tier: string; auditTrail: unknown[] } };
            expect(body.status.tier).toBe('verified');
            expect(body.status.auditTrail).toHaveLength(2);
        });
    });

    // -------------------------------------------------------------------
    // Revoke
    // -------------------------------------------------------------------

    describe('revoke', () => {
        it('revokes an existing tier back to unverified', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            const result = service.revoke(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Policy violation',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as { status: { tier: string; auditTrail: unknown[] } };
            expect(body.status.tier).toBe('unverified');
            expect(body.status.auditTrail).toHaveLength(2); // grant + revoke
        });

        it('rejects revocation of already-unverified subject', () => {
            const result = service.revoke(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Already unverified',
                }),
            );

            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('ALREADY_UNVERIFIED');
        });

        it('rejects revoke with missing fields', () => {
            const result = service.revoke(
                toParams({ did: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Renew
    // -------------------------------------------------------------------

    describe('renew', () => {
        it('renews an existing verification', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            const result = service.renew(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Renewal',
                }),
            );

            expect(result.statusCode).toBe(200);
            const body = result.body as {
                status: { tier: string; expiresAt: string; auditTrail: unknown[] };
            };
            expect(body.status.tier).toBe('basic');
            expect(body.status.expiresAt).toBeDefined();
            expect(body.status.auditTrail).toHaveLength(2); // grant + renew
        });

        it('rejects renewal when no verification exists', () => {
            const result = service.renew(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                }),
            );

            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('NOTHING_TO_RENEW');
        });

        it('rejects renewal with missing fields', () => {
            const result = service.renew(toParams({}));
            expect(result.statusCode).toBe(400);
        });
    });

    // -------------------------------------------------------------------
    // Appeal
    // -------------------------------------------------------------------

    describe('appeal', () => {
        it('creates an appeal for a higher tier', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            const result = service.appeal(
                toParams({
                    did: VOLUNTEER_DID,
                    requestedTier: 'verified',
                    reason: 'I have completed all requirements now.',
                }),
            );

            expect(result.statusCode).toBe(201);
            const body = result.body as { appeal: { status: string; requestedTier: string } };
            expect(body.appeal.status).toBe('pending');
            expect(body.appeal.requestedTier).toBe('verified');
        });

        it('rejects appeal to same or lower tier', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            const result = service.appeal(
                toParams({
                    did: VOLUNTEER_DID,
                    requestedTier: 'unverified',
                    reason: 'Downgrade please',
                }),
            );

            expect(result.statusCode).toBe(400);
            const body = result.body as { error: { code: string } };
            expect(body.error.code).toBe('INVALID_APPEAL');
        });

        it('rejects appeal with missing fields', () => {
            const result = service.appeal(toParams({ did: VOLUNTEER_DID }));
            expect(result.statusCode).toBe(400);
        });

        it('records appeal in audit trail', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            service.appeal(
                toParams({
                    did: VOLUNTEER_DID,
                    requestedTier: 'verified',
                    reason: 'I completed all requirements.',
                }),
            );

            const auditResult = service.getAuditTrail(
                toParams({ did: VOLUNTEER_DID }),
            );

            const body = auditResult.body as {
                auditTrail: Array<{ action: string }>;
                appeals: Array<{ status: string }>;
            };

            expect(body.auditTrail).toHaveLength(2); // grant + appeal
            expect(body.auditTrail[1]!.action).toBe('appeal');
            expect(body.appeals).toHaveLength(1);
            expect(body.appeals[0]!.status).toBe('pending');
        });
    });

    // -------------------------------------------------------------------
    // Audit trail
    // -------------------------------------------------------------------

    describe('getAuditTrail', () => {
        it('returns empty trail for unknown DID', () => {
            const result = service.getAuditTrail(
                toParams({ did: VOLUNTEER_DID }),
            );
            expect(result.statusCode).toBe(200);
            const body = result.body as {
                auditTrail: unknown[];
                appeals: unknown[];
            };
            expect(body.auditTrail).toHaveLength(0);
            expect(body.appeals).toHaveLength(0);
        });

        it('returns 400 when did is missing', () => {
            const result = service.getAuditTrail(toParams({}));
            expect(result.statusCode).toBe(400);
        });

        it('returns complete audit history after grant + revoke', () => {
            const checkpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Grant',
                    passedCheckpoints: checkpoints,
                }),
            );

            service.revoke(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Revoked for testing',
                }),
            );

            const result = service.getAuditTrail(
                toParams({ did: VOLUNTEER_DID }),
            );

            const body = result.body as {
                auditTrail: Array<{ action: string; previousTier: string; newTier: string }>;
            };

            expect(body.auditTrail).toHaveLength(2);
            expect(body.auditTrail[0]!.action).toBe('grant');
            expect(body.auditTrail[0]!.previousTier).toBe('unverified');
            expect(body.auditTrail[0]!.newTier).toBe('basic');
            expect(body.auditTrail[1]!.action).toBe('revoke');
            expect(body.auditTrail[1]!.previousTier).toBe('basic');
            expect(body.auditTrail[1]!.newTier).toBe('unverified');
        });
    });

    // -------------------------------------------------------------------
    // Full lifecycle: grant -> renew -> revoke -> appeal
    // -------------------------------------------------------------------

    describe('full verification lifecycle', () => {
        it('processes grant, renew, revoke, and appeal in sequence', () => {
            const basicCheckpoints = TIER_DEFINITIONS.basic.autoCheckpoints
                .map(cp => cp.id)
                .join(',');

            // 1. Grant basic
            const grantResult = service.grant(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    tier: 'basic',
                    reason: 'Initial verification',
                    passedCheckpoints: basicCheckpoints,
                }),
            );
            expect(grantResult.statusCode).toBe(200);

            // 2. Renew
            const renewResult = service.renew(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Annual renewal',
                }),
            );
            expect(renewResult.statusCode).toBe(200);

            // 3. Revoke
            const revokeResult = service.revoke(
                toParams({
                    did: VOLUNTEER_DID,
                    actorDid: ADMIN_DID,
                    reason: 'Policy violation',
                }),
            );
            expect(revokeResult.statusCode).toBe(200);

            // 4. Appeal
            const appealResult = service.appeal(
                toParams({
                    did: VOLUNTEER_DID,
                    requestedTier: 'basic',
                    reason: 'Issue has been resolved, requesting reinstatement.',
                }),
            );
            expect(appealResult.statusCode).toBe(201);

            // Verify audit trail has all 4 entries:
            // grant + renew + revoke + appeal (appeal adds entry because
            // the subject has a tracked status after revocation)
            const auditResult = service.getAuditTrail(
                toParams({ did: VOLUNTEER_DID }),
            );
            const body = auditResult.body as {
                auditTrail: Array<{ action: string }>;
                appeals: Array<{ status: string }>;
            };

            expect(body.auditTrail).toHaveLength(4);
            expect(body.auditTrail.map(a => a.action)).toEqual([
                'grant',
                'renew',
                'revoke',
                'appeal',
            ]);
            expect(body.appeals).toHaveLength(1);
        });
    });
});
