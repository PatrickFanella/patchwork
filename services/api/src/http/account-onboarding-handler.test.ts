import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    CURRENT_POLICY_VERSION,
    defaultAccountPreferences,
    requiredPolicyDocuments,
} from '@patchwork/shared';
import {
    createAccountOnboardingHandler,
} from './account-onboarding-handler.js';
import type { AccountOnboardingService } from '../account-onboarding-service.js';

describe('account onboarding HTTP boundary', () => {
    let origin: string;
    const statusFor = vi.fn();
    const accept = vi.fn();
    const preferencesFor = vi.fn();
    const updatePreferences = vi.fn();
    const handler = createAccountOnboardingHandler({
        service: {
            statusFor,
            accept,
            preferencesFor,
            updatePreferences,
        } as unknown as AccountOnboardingService,
        authenticate: async () => ({
            sessionToken: 'opaque',
            session: {
                did: 'did:plc:session-owner',
                expiresAt: '2099-01-01T00:00:00.000Z',
            },
            principal: {
                did: 'did:plc:session-owner',
                role: 'user',
                authorization: {
                    actorDid: 'did:plc:session-owner',
                    role: 'user',
                    capabilities: [],
                },
            },
        }),
        executeIdempotent: async (
            _request,
            _did,
            body,
            effect,
        ) => effect(body as Record<string, unknown>, 'key'),
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
            throw new Error('test server did not bind');
        }
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
        );
    });

    it('derives the consent subject from the session', async () => {
        accept.mockResolvedValueOnce({
            consentRequired: false,
            policyVersion: CURRENT_POLICY_VERSION,
        });
        const response = await fetch(`${origin}/account/consent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                did: 'did:plc:attacker',
                policyVersion: CURRENT_POLICY_VERSION,
                asserted18OrOlder: true,
                acceptedDocuments: [...requiredPolicyDocuments],
            }),
        });
        expect(response.status).toBe(200);
        expect(accept).toHaveBeenCalledWith(
            'did:plc:session-owner',
            {
                policyVersion: CURRENT_POLICY_VERSION,
                asserted18OrOlder: true,
                acceptedDocuments: [...requiredPolicyDocuments],
            },
        );
    });

    it('reads and writes only the session owner preferences', async () => {
        preferencesFor.mockResolvedValueOnce(defaultAccountPreferences);
        const read = await fetch(`${origin}/account/preferences`);
        expect(read.status).toBe(200);
        expect(preferencesFor).toHaveBeenCalledWith(
            'did:plc:session-owner',
        );

        updatePreferences.mockResolvedValueOnce(defaultAccountPreferences);
        const write = await fetch(`${origin}/account/preferences`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                did: 'did:plc:attacker',
                preferences: defaultAccountPreferences,
            }),
        });
        expect(write.status).toBe(200);
        expect(updatePreferences).toHaveBeenCalledWith(
            'did:plc:session-owner',
            defaultAccountPreferences,
        );
    });
});
