import { describe, expect, it, vi } from 'vitest';
import { PublicHttpError } from '../http/error-response.js';
import { createPdsSignupService } from './pds-signup-service.js';

const baseInput = {
    handle: 'alice.subcult.tv',
    email: 'alice@example.com',
    password: 'correct horse battery staple',
    inviteCode: 'invite-123',
};

describe('createPdsSignupService', () => {
    it('forwards credentials to the configured PDS and returns only did and handle', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                did: 'did:plc:abc123',
                handle: 'alice.subcult.tv',
                accessJwt: 'secret',
                refreshJwt: 'secret',
            }),
        });
        const service = createPdsSignupService({
            pdsUrl: 'https://pds.subcult.tv',
            fetchImpl: fetchImpl as unknown as typeof fetch,
            timeoutMs: 50,
        });

        await expect(service.createAccount(baseInput)).resolves.toEqual({
            did: 'did:plc:abc123',
            handle: 'alice.subcult.tv',
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://pds.subcult.tv/xrpc/com.atproto.server.createAccount',
            expect.objectContaining({
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(baseInput),
            }),
        );
    });

    it.each(['patchwork.subcult.tv', 'grafana.subcult.tv', 'edda.subcult.tv', 'pds.subcult.tv', 'service.subcult.tv'])(
        'rejects reserved handle %s',
        async handle => {
            const service = createPdsSignupService({ pdsUrl: 'https://pds.subcult.tv' });
            await expect(
                service.createAccount({ ...baseInput, handle } as unknown as typeof baseInput),
            ).rejects.toEqual(
                expect.objectContaining({
                    code: 'RESERVED_HANDLE',
                }),
            );
        },
    );

    it.each(['Alice.subcult.tv', 'ab.subcult.tv', 'toolonglabeltoolonglabel.subcult.tv', 'bad.handle'])(
        'rejects malformed handle %s',
        async handle => {
            const service = createPdsSignupService({ pdsUrl: 'https://pds.subcult.tv' });
            await expect(service.createAccount({ ...baseInput, handle } as unknown as typeof baseInput)).rejects.toBeInstanceOf(PublicHttpError);
        },
    );

    it.each([
        ['handle', { handle: '' }],
        ['email', { email: 'not-an-email' }],
        ['password', { password: '' }],
        ['inviteCode', { inviteCode: '' }],
    ])('rejects invalid %s input with a stable public error', async (_field, patch) => {
        const service = createPdsSignupService({ pdsUrl: 'https://pds.subcult.tv' });
        await expect(service.createAccount({ ...baseInput, ...patch } as unknown as typeof baseInput)).rejects.toMatchObject({
            code: 'INVALID_SIGNUP_INPUT',
            statusCode: 400,
        });
    });

    it.each([
        ['handle', { handle: undefined }],
        ['email', { email: undefined }],
        ['password', { password: undefined }],
        ['inviteCode', { inviteCode: undefined }],
    ])('rejects missing %s input with a stable public error', async (_field, patch) => {
        const service = createPdsSignupService({ pdsUrl: 'https://pds.subcult.tv' });
        await expect(service.createAccount({ ...baseInput, ...patch } as unknown as typeof baseInput)).rejects.toMatchObject({
            code: 'INVALID_SIGNUP_INPUT',
            statusCode: 400,
        });
    });

    it('maps duplicate handles, invalid passwords, and invite codes to stable public errors', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({ error: 'HandleNotAvailable' }),
        });
        const service = createPdsSignupService({
            pdsUrl: 'https://pds.subcult.tv',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(service.createAccount(baseInput)).rejects.toMatchObject({
            code: 'HANDLE_ALREADY_EXISTS',
            statusCode: 400,
        });

        fetchImpl.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({ error: 'InvalidPassword' }),
        });
        await expect(service.createAccount(baseInput)).rejects.toMatchObject({
            code: 'INVALID_PASSWORD',
            statusCode: 400,
        });

        fetchImpl.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: vi.fn().mockResolvedValue({ error: 'InvalidInviteCode' }),
        });
        await expect(service.createAccount(baseInput)).rejects.toMatchObject({
            code: 'INVALID_INVITE_CODE',
            statusCode: 400,
        });
    });

    it('rejects a mismatched upstream handle', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                did: 'did:plc:abc123',
                handle: 'someone-else.subcult.tv',
            }),
        });
        const service = createPdsSignupService({
            pdsUrl: 'https://pds.subcult.tv',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(service.createAccount(baseInput)).rejects.toMatchObject({
            code: 'PDS_SIGNUP_FAILED',
            statusCode: 400,
        });
    });

    it('maps a timeout to a public unavailable error', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(
            Object.assign(new Error('Aborted'), { name: 'AbortError' }),
        );
        const service = createPdsSignupService({
            pdsUrl: 'https://pds.subcult.tv',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(service.createAccount(baseInput)).rejects.toMatchObject({
            code: 'PDS_UNAVAILABLE',
            statusCode: 503,
        });
    });
});
