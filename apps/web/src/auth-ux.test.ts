import { describe, expect, it } from 'vitest';
import {
    buildRecoveryPrompt,
    checkSessionHealth,
    defaultAuthViewModel,
    reduceAuthState,
    toAuthStatusNotice,
    type AuthSession,
    type AuthViewModel,
} from './auth-ux.js';

const makeSession = (overrides?: Partial<AuthSession>): AuthSession => ({
    did: 'did:example:alice',
    handle: 'alice.mutualhub.test',
    accessJwt: 'access-test-token-123456789',
    refreshJwt: 'refresh-test-token-123456789',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    issuedAt: new Date().toISOString(),
    ...overrides,
});

describe('auth UX module', () => {
    describe('reduceAuthState', () => {
        it('transitions to authenticating on login-start', () => {
            const next = reduceAuthState(defaultAuthViewModel, {
                type: 'login-start',
                handle: 'alice.mutualhub.test',
            });
            expect(next.state).toBe('authenticating');
        });

        it('transitions to active on login-success', () => {
            const session = makeSession();
            const next = reduceAuthState(defaultAuthViewModel, {
                type: 'login-success',
                session,
            });
            expect(next.state).toBe('active');
            expect(next.session?.did).toBe('did:example:alice');
        });

        it('transitions to error on login-failure', () => {
            const next = reduceAuthState(defaultAuthViewModel, {
                type: 'login-failure',
                code: 'INVALID_HANDLE',
                message: 'Bad handle format.',
            });
            expect(next.state).toBe('error');
            expect(next.error?.code).toBe('INVALID_HANDLE');
            expect(next.error?.recoveryAction).toBe('check-handle');
        });

        it('transitions to refreshing on refresh-start', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            const next = reduceAuthState(vm, { type: 'refresh-start' });
            expect(next.state).toBe('refreshing');
            // Preserves existing session during refresh
            expect(next.session).toBeDefined();
        });

        it('transitions to active on refresh-success', () => {
            const vm: AuthViewModel = { state: 'refreshing' };
            const session = makeSession();
            const next = reduceAuthState(vm, {
                type: 'refresh-success',
                session,
            });
            expect(next.state).toBe('active');
            expect(next.session?.did).toBe('did:example:alice');
            expect(next.lastRefreshedAt).toBeDefined();
        });

        it('transitions to error on refresh-failure', () => {
            const next = reduceAuthState(defaultAuthViewModel, {
                type: 'refresh-failure',
                code: 'SESSION_REFRESH_FAILED',
                message: 'Refresh failed.',
            });
            expect(next.state).toBe('error');
            expect(next.error?.recoveryAction).toBe('relogin');
        });

        it('transitions to expired on session-expired', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            const next = reduceAuthState(vm, { type: 'session-expired' });
            expect(next.state).toBe('expired');
            expect(next.session).toBeDefined();
            expect(next.error?.recoveryAction).toBe('relogin');
        });

        it('transitions to idle on logout', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            const next = reduceAuthState(vm, { type: 'logout' });
            expect(next.state).toBe('idle');
            expect(next.session).toBeUndefined();
        });

        it('transitions to idle on reset', () => {
            const vm: AuthViewModel = {
                state: 'error',
                error: {
                    code: 'UNKNOWN',
                    message: 'error',
                    recoveryAction: 'contact-support',
                    recoveryHint: 'hint',
                },
            };
            const next = reduceAuthState(vm, { type: 'reset' });
            expect(next.state).toBe('idle');
        });
    });

    describe('checkSessionHealth', () => {
        it('returns no-session when no session exists', () => {
            expect(checkSessionHealth(defaultAuthViewModel)).toBe('no-session');
        });

        it('returns healthy for a fresh session', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            expect(checkSessionHealth(vm)).toBe('healthy');
        });

        it('returns needs-refresh when within leeway of expiry', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession({
                    expiresAt: new Date(
                        Date.now() + 30_000,
                    ).toISOString(),
                }),
            };
            expect(checkSessionHealth(vm, 60_000)).toBe('needs-refresh');
        });

        it('returns expired when access token has expired', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession({
                    expiresAt: new Date(
                        Date.now() - 1_000,
                    ).toISOString(),
                }),
            };
            expect(checkSessionHealth(vm)).toBe('expired');
        });

        it('returns fully-expired when refresh token has expired', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession({
                    expiresAt: new Date(Date.now() - 1_000).toISOString(),
                    refreshExpiresAt: new Date(
                        Date.now() - 1_000,
                    ).toISOString(),
                }),
            };
            expect(checkSessionHealth(vm)).toBe('fully-expired');
        });
    });

    describe('buildRecoveryPrompt', () => {
        it('returns undefined for active session', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            expect(buildRecoveryPrompt(vm)).toBeUndefined();
        });

        it('returns relogin prompt for expired state', () => {
            const vm: AuthViewModel = {
                state: 'expired',
                session: makeSession(),
                error: {
                    code: 'SESSION_EXPIRED',
                    message: 'Expired',
                    recoveryAction: 'relogin',
                    recoveryHint: 'Log in again.',
                },
            };
            const prompt = buildRecoveryPrompt(vm);
            expect(prompt?.actionType).toBe('relogin');
            expect(prompt?.title).toBe('Session Expired');
        });

        it('returns retry prompt for transient errors', () => {
            const vm: AuthViewModel = {
                state: 'error',
                error: {
                    code: 'HANDLE_RESOLUTION_FAILED',
                    message: 'Network error.',
                    recoveryAction: 'retry',
                    recoveryHint: 'Please try again.',
                },
            };
            const prompt = buildRecoveryPrompt(vm);
            expect(prompt?.actionType).toBe('retry');
        });

        it('returns dismiss prompt for unknown errors', () => {
            const vm: AuthViewModel = {
                state: 'error',
                error: {
                    code: 'UNKNOWN',
                    message: 'Something broke.',
                    recoveryAction: 'contact-support',
                    recoveryHint: 'Contact support.',
                },
            };
            const prompt = buildRecoveryPrompt(vm);
            expect(prompt?.actionType).toBe('dismiss');
        });
    });

    describe('toAuthStatusNotice', () => {
        it('returns success notice for active session', () => {
            const vm: AuthViewModel = {
                state: 'active',
                session: makeSession(),
            };
            const notice = toAuthStatusNotice(vm);
            expect(notice?.tone).toBe('success');
            expect(notice?.message).toContain('alice.mutualhub.test');
        });

        it('returns warning notice for expired session', () => {
            const vm: AuthViewModel = { state: 'expired' };
            const notice = toAuthStatusNotice(vm);
            expect(notice?.tone).toBe('warning');
        });

        it('returns danger notice for error state', () => {
            const vm: AuthViewModel = {
                state: 'error',
                error: {
                    code: 'X',
                    message: 'Auth failed',
                    recoveryAction: 'retry',
                    recoveryHint: 'hint',
                },
            };
            const notice = toAuthStatusNotice(vm);
            expect(notice?.tone).toBe('danger');
            expect(notice?.message).toBe('Auth failed');
        });

        it('returns info notice for authenticating state', () => {
            const vm: AuthViewModel = { state: 'authenticating' };
            const notice = toAuthStatusNotice(vm);
            expect(notice?.tone).toBe('info');
            expect(notice?.message).toContain('Signing in');
        });

        it('returns info notice for refreshing state', () => {
            const vm: AuthViewModel = { state: 'refreshing' };
            const notice = toAuthStatusNotice(vm);
            expect(notice?.tone).toBe('info');
            expect(notice?.message).toContain('Refreshing');
        });

        it('returns undefined for idle state', () => {
            expect(toAuthStatusNotice(defaultAuthViewModel)).toBeUndefined();
        });
    });
});
