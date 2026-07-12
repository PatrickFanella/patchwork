import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom

import {
    beginLogin,
    getCurrentSession,
    logoutSession,
    refreshSession,
} from './auth-api.js';
import { AuthProvider, useAuth } from './AuthProvider.js';
import { AuthCallbackPage } from './AuthCallbackPage.js';
import { LoginPage } from './LoginPage.js';

const originalFetch = globalThis.fetch;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;

const AuthProbe = () => {
    const auth = useAuth();
    return (
        <div>
            <span data-testid='status'>{auth.status}</span>
            <span data-testid='did'>{auth.session?.did ?? 'none'}</span>
            <button type='button' onClick={() => void auth.logout()}>
                Log out
            </button>
        </div>
    );
};

describe('AT authentication flow', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    it('begins OAuth with a safe intended destination and no browser token', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    authorizationUrl: 'https://pds.example/oauth/authorize?request=opaque',
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        const result = await beginLogin('alice.example.com', '/posting?from=feed');

        expect(result).toEqual({
            authorizationUrl: 'https://pds.example/oauth/authorize?request=opaque',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4000/oauth/login',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                redirect: 'error',
                body: JSON.stringify({
                    handle: 'alice.example.com',
                    returnTo: '/posting?from=feed',
                }),
            }),
        );
        expect(JSON.stringify(result)).not.toMatch(/access|refresh|token/i);
    });

    it('removes sensitive parameters from the intended destination', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    authorizationUrl: 'https://pds.example/oauth/authorize',
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        await beginLogin(
            'alice.example.com',
            '/posting?filter=food&access_token=secret&state=secret#refresh_token=secret',
        );

        const request = (
            fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
        )[0]?.[1];
        if (!request) throw new Error('Expected login request.');
        expect(JSON.parse(String(request.body))).toEqual({
            handle: 'alice.example.com',
            returnTo: '/posting?filter=food',
        });
    });

    it('restores only the cookie-backed public session summary', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    session: {
                        did: 'did:plc:alice',
                        expiresAt: '2026-07-12T12:00:00.000Z',
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        const session = await getCurrentSession();

        expect(session).toEqual({
            did: 'did:plc:alice',
            expiresAt: '2026-07-12T12:00:00.000Z',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4000/auth/session',
            expect.objectContaining({ method: 'GET', credentials: 'include' }),
        );
        expect(JSON.stringify(session)).not.toMatch(/access|refresh|token/i);
    });

    it('refreshes the cookie-backed session with CSRF protection', async () => {
        document.cookie = 'patchwork_csrf=csrf-proof; Path=/';
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    session: {
                        did: 'did:plc:alice',
                        expiresAt: '2026-07-12T12:00:00.000Z',
                    },
                    refreshed: true,
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        const session = await refreshSession();

        expect(session.did).toBe('did:plc:alice');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4000/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                headers: expect.objectContaining({
                    'x-csrf-token': 'csrf-proof',
                }),
            }),
        );
    });

    it('logs out through the cookie and CSRF boundary', async () => {
        document.cookie = 'patchwork_csrf=logout-proof; Path=/';
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ deleted: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        await logoutSession();

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4000/auth/session',
            expect.objectContaining({
                method: 'DELETE',
                credentials: 'include',
                headers: expect.objectContaining({
                    'x-csrf-token': 'logout-proof',
                }),
            }),
        );
    });

    it('preserves a recoverable PDS-unavailable error code', async () => {
        globalThis.fetch = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    error: {
                        code: 'PDS_UNAVAILABLE',
                        message: 'The AT Protocol server is temporarily unavailable.',
                        retryable: true,
                    },
                }),
                {
                    status: 503,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        ) as typeof fetch;

        await expect(beginLogin('alice.example.com', '/posting')).rejects.toEqual(
            expect.objectContaining({
                code: 'PDS_UNAVAILABLE',
                retryable: true,
            }),
        );
    });

    it('renders a keyboard-operable and screen-reader-labelled login form', () => {
        const html = renderToStaticMarkup(
            <AuthProvider initialStatus='anonymous'>
                <LoginPage />
            </AuthProvider>,
        );

        expect(html).toContain('<main');
        expect(html).toContain('aria-labelledby="login-heading"');
        expect(html).toContain('for="at-handle"');
        expect(html).toContain('id="at-handle"');
        expect(html).toContain('type="submit"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('Continue with AT Protocol');
    });

    it('renders stale-callback recovery without reflecting OAuth parameters', () => {
        window.history.replaceState(
            {},
            '',
            '/auth/callback?error=OAUTH_STATE_INVALID&state=sensitive-state&code=sensitive-code',
        );
        const html = renderToStaticMarkup(
            <AuthProvider initialStatus='anonymous'>
                <AuthCallbackPage />
            </AuthProvider>,
        );

        expect(html).toContain('role="alert"');
        expect(html).toContain('This login callback is stale or invalid.');
        expect(html).toContain('Start a new login');
        expect(html).not.toContain('sensitive-state');
        expect(html).not.toContain('sensitive-code');

        window.history.replaceState({}, '', '/auth/callback?error=access_denied');
        const denied = renderToStaticMarkup(
            <AuthProvider initialStatus='anonymous'>
                <AuthCallbackPage />
            </AuthProvider>,
        );
        expect(denied).toContain('Authorization was denied');

        window.history.replaceState({}, '', '/auth/callback?error=PDS_UNAVAILABLE');
        const unavailable = renderToStaticMarkup(
            <AuthProvider initialStatus='anonymous'>
                <AuthCallbackPage />
            </AuthProvider>,
        );
        expect(unavailable).toContain('temporarily unavailable');
    });

    it('restores and clears the real provider session through public actions', async () => {
        document.cookie = 'patchwork_csrf=provider-proof; Path=/';
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        session: {
                            did: 'did:plc:alice',
                            expiresAt: '2099-07-12T12:00:00.000Z',
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ deleted: true }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }),
            );
        globalThis.fetch = fetchMock as typeof fetch;
        const container = document.createElement('div');
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>,
            );
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(container.textContent).toContain('authenticated');
        expect(container.textContent).toContain('did:plc:alice');

        await act(async () => {
            container.querySelector('button')?.click();
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(container.textContent).toContain('anonymous');
        expect(container.textContent).toContain('none');
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await act(async () => root.unmount());
    });

    it('announces an expired restored session with a sign-in recovery', async () => {
        globalThis.fetch = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    error: {
                        code: 'SESSION_EXPIRED',
                        message: 'The Patchwork browser session is expired.',
                    },
                }),
                {
                    status: 401,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        ) as typeof fetch;
        const container = document.createElement('div');
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <AuthProvider>
                    <LoginPage />
                </AuthProvider>,
            );
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(container.querySelector('[role="alert"]')?.textContent).toContain(
            'Your session expired. Sign in again to continue.',
        );
        await act(async () => root.unmount());
    });
});
