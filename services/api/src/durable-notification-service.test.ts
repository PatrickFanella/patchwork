import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const webPushMock = vi.hoisted(() => ({
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
}));

vi.mock('web-push', () => ({ default: webPushMock }));

import {
    HttpEmailProvider,
    VapidPushProvider,
    localizedNotificationCopy,
} from './durable-notification-service.js';

describe('notification delivery providers', () => {
    it('renders privacy-safe notification templates in the account locale', () => {
        expect(
            localizedNotificationCopy('offer_received', 'es', {
                title: 'New offer',
                body: 'Someone offered to help with your request.',
            }),
        ).toEqual({
            title: 'Nueva oferta',
            body: 'Alguien se ofreció a ayudar con tu solicitud.',
        });
        expect(
            localizedNotificationCopy('offer_received', 'en', {
                title: 'New offer',
                body: 'Someone offered to help with your request.',
            }),
        ).toEqual({
            title: 'New offer',
            body: 'Someone offered to help with your request.',
        });
    });
    it('sends provider-neutral email with bounded content and stable idempotency', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: 'provider-message-one' }), {
                status: 202,
                headers: { 'content-type': 'application/json' },
            }),
        );
        const provider = new HttpEmailProvider(
            'https://email.example.test/send',
            'provider-secret',
            'notifications@patchwork.test',
            fetchImpl,
        );

        await expect(
            provider.send({
                to: 'member@example.test',
                subject: 'Request status updated',
                text: 'Your request moved to a new lifecycle state.',
                idempotencyKey: 'notification:stable-one',
            }),
        ).resolves.toEqual({
            accepted: true,
            providerMessageId: 'provider-message-one',
        });
        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, request] = fetchImpl.mock.calls[0]!;
        expect(url).toBe('https://email.example.test/send');
        expect(request).toMatchObject({
            method: 'POST',
            headers: expect.objectContaining({
                authorization: 'Bearer provider-secret',
                'idempotency-key': 'notification:stable-one',
            }),
        });
        expect(JSON.parse(String(request.body))).toEqual({
            from: 'notifications@patchwork.test',
            to: 'member@example.test',
            subject: 'Request status updated',
            text: 'Your request moved to a new lifecycle state.',
        });
    });

    it('classifies invalid and retryable email responses without exposing provider bodies', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                new Response('private provider diagnostic', { status: 422 }),
            )
            .mockResolvedValueOnce(
                new Response('private provider diagnostic', { status: 503 }),
            );
        const provider = new HttpEmailProvider(
            'https://email.example.test/send',
            'provider-secret',
            'notifications@patchwork.test',
            fetchImpl,
        );
        const input = {
            to: 'member@example.test',
            subject: 'Update',
            text: 'Open Patchwork for details.',
            idempotencyKey: 'notification:stable-two',
        };

        await expect(provider.send(input)).resolves.toEqual({
            accepted: false,
            invalidTarget: true,
            errorCode: 'email-http-422',
        });
        await expect(provider.send(input)).resolves.toEqual({
            accepted: false,
            retryable: true,
            errorCode: 'email-http-503',
        });
    });

    it('uses VAPID delivery with a privacy-safe stable topic and invalid cleanup signal', async () => {
        webPushMock.sendNotification.mockResolvedValueOnce({
            headers: { location: 'push-message-one' },
        });
        const provider = new VapidPushProvider({
            subject: 'mailto:security@patchwork.test',
            publicKey: 'public-vapid-key',
            privateKey: 'private-vapid-key',
        });
        const input = {
            endpoint: 'https://push.example.test/subscription',
            p256dh: 'p256dh-public-key-material',
            auth: 'auth-secret-material',
            payload: JSON.stringify({
                title: 'New offer',
                body: 'Someone offered to help with your request.',
                actionUrl: '/inbox',
            }),
            idempotencyKey: 'notification:stable-three',
        };

        await expect(provider.send(input)).resolves.toEqual({
            accepted: true,
            providerMessageId: 'push-message-one',
        });
        expect(webPushMock.setVapidDetails).toHaveBeenCalledWith(
            'mailto:security@patchwork.test',
            'public-vapid-key',
            'private-vapid-key',
        );
        expect(webPushMock.sendNotification).toHaveBeenCalledWith(
            {
                endpoint: input.endpoint,
                keys: { p256dh: input.p256dh, auth: input.auth },
            },
            input.payload,
            expect.objectContaining({
                TTL: 300,
                topic: createHash('sha256')
                    .update(input.idempotencyKey)
                    .digest('base64url')
                    .slice(0, 32),
            }),
        );

        webPushMock.sendNotification.mockRejectedValueOnce({
            statusCode: 410,
            body: 'private provider diagnostic',
        });
        await expect(provider.send(input)).resolves.toEqual({
            accepted: false,
            invalidTarget: true,
            errorCode: 'push-http-410',
        });
    });
});
