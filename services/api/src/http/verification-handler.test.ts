import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthorizationContext } from '../authorization-guard.js';
import type { VerificationCaseService } from '../verification-case-service.js';
import { createVerificationHandler } from './verification-handler.js';

describe('verification HTTP authorization boundary', () => {
    let origin: string;
    const submitApplication = vi.fn();
    const listReviewQueue = vi.fn();
    const decideExactAddress = vi.fn();
    const service = {
        submitApplication,
        listReviewQueue,
        decideExactAddress,
    } as unknown as VerificationCaseService;
    const handler = createVerificationHandler({
        service,
        authenticate: async request => {
            const role =
                request.headers['x-test-role'] === 'admin' ?
                    'admin' as const
                :   'user' as const;
            const did =
                role === 'admin' ?
                    'did:plc:verification-moderator'
                :   'did:plc:verification-applicant';
            return {
                sessionToken: 'opaque',
                session: { did },
                principal: {
                    did,
                    role,
                    authorization: createAuthorizationContext(did, role),
                },
            };
        },
        executeIdempotent: async (_request, _actorDid, body, effect) =>
            effect(body as Record<string, unknown>, 'key'),
    });
    let server: ReturnType<typeof createServer>;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (
                !handler(
                    request,
                    response,
                    new URL(request.url ?? '/', 'http://localhost'),
                )
            ) {
                response.writeHead(404).end();
            }
        });
        await new Promise<void>(resolve =>
            server.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('server did not bind');
        }
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('derives the verification applicant from the browser session', async () => {
        submitApplication.mockResolvedValueOnce({
            application: { id: 'application' },
        });
        const body = {
            subjectType: 'volunteer',
            applicantDid: 'did:plc:hostile-browser',
            evidence: [],
        };
        const response = await fetch(`${origin}/verification/applications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(response.status).toBe(201);
        expect(submitApplication).toHaveBeenCalledWith(
            'did:plc:verification-applicant',
            body,
        );
    });

    it('requires platform review capabilities for private evidence and exact-address decisions', async () => {
        const denied = await fetch(`${origin}/verification/review`);
        expect(denied.status).toBe(403);
        expect(listReviewQueue).not.toHaveBeenCalled();

        listReviewQueue.mockResolvedValueOnce({ applications: [] });
        const allowed = await fetch(`${origin}/verification/review`, {
            headers: { 'x-test-role': 'admin' },
        });
        expect(allowed.status).toBe(200);
        expect(listReviewQueue).toHaveBeenCalledOnce();

        decideExactAddress.mockResolvedValueOnce({
            request: { status: 'approved' },
        });
        const exact = await fetch(
            `${origin}/verification/exact-address/decisions`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-test-role': 'admin',
                },
                body: JSON.stringify({
                    requestId:
                        '11111111-1111-4111-8111-111111111111',
                    decision: 'approve',
                    reason: 'Verified.',
                }),
            },
        );
        expect(exact.status).toBe(200);
        expect(decideExactAddress).toHaveBeenCalledWith(
            'did:plc:verification-moderator',
            expect.objectContaining({ decision: 'approve' }),
        );
    });
});
