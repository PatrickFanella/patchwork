// ---------------------------------------------------------------------------
// Auth session types (mirrored from @patchwork/shared/auth-session for UX use)
// ---------------------------------------------------------------------------

export type SessionState =
    | 'idle'
    | 'authenticating'
    | 'active'
    | 'expired'
    | 'refreshing'
    | 'error';

export type AuthRecoveryAction =
    | 'retry'
    | 'relogin'
    | 'contact-support'
    | 'check-handle'
    | 'wait-and-retry';

export interface AuthSession {
    did: string;
    handle: string;
    accessJwt: string;
    refreshJwt: string;
    expiresAt: string;
    refreshExpiresAt: string;
    issuedAt: string;
    refreshedAt?: string;
}

export interface AuthError {
    code: string;
    message: string;
    recoveryAction: AuthRecoveryAction;
    recoveryHint: string;
}

// ---------------------------------------------------------------------------
// Auth error factory
// ---------------------------------------------------------------------------

export const authErrorForCode = (code: string, message: string): AuthError => {
    switch (code) {
        case 'INVALID_HANDLE':
            return {
                code,
                message,
                recoveryAction: 'check-handle',
                recoveryHint:
                    'Double-check your handle format (e.g., alice.example.com).',
            };
        case 'HANDLE_RESOLUTION_FAILED':
            return {
                code,
                message,
                recoveryAction: 'retry',
                recoveryHint:
                    'Network error resolving your handle. Please try again.',
            };
        case 'SESSION_CREATE_FAILED':
            return {
                code,
                message,
                recoveryAction: 'retry',
                recoveryHint:
                    'Could not create a session. Check your password and try again.',
            };
        case 'SESSION_EXPIRED':
            return {
                code,
                message,
                recoveryAction: 'relogin',
                recoveryHint:
                    'Your session has fully expired. Please log in again.',
            };
        case 'SESSION_REFRESH_FAILED':
            return {
                code,
                message,
                recoveryAction: 'relogin',
                recoveryHint:
                    'Session refresh failed. Please log in again.',
            };
        case 'RATE_LIMITED':
            return {
                code,
                message,
                recoveryAction: 'wait-and-retry',
                recoveryHint:
                    'Too many login attempts. Please wait a moment before retrying.',
            };
        default:
            return {
                code,
                message,
                recoveryAction: 'contact-support',
                recoveryHint:
                    'An unexpected error occurred. Please contact support if this persists.',
            };
    }
};

// ---------------------------------------------------------------------------
// Session expiration helpers
// ---------------------------------------------------------------------------

const isSessionExpired = (session: AuthSession, now: Date): boolean =>
    new Date(session.expiresAt).getTime() <= now.getTime();

const isRefreshExpired = (session: AuthSession, now: Date): boolean =>
    new Date(session.refreshExpiresAt).getTime() <= now.getTime();

const sessionNeedsRefresh = (
    session: AuthSession,
    leewayMs: number,
    now: Date,
): boolean => new Date(session.expiresAt).getTime() - now.getTime() <= leewayMs;

// ---------------------------------------------------------------------------
// Auth view model
// ---------------------------------------------------------------------------

export interface AuthViewModel {
    state: SessionState;
    session?: AuthSession;
    error?: AuthError;
    lastRefreshedAt?: string;
}

export const defaultAuthViewModel: Readonly<AuthViewModel> = Object.freeze({
    state: 'idle',
});

// ---------------------------------------------------------------------------
// Auth events
// ---------------------------------------------------------------------------

export type AuthEvent =
    | { type: 'login-start'; handle: string }
    | { type: 'login-success'; session: AuthSession }
    | { type: 'login-failure'; code: string; message: string }
    | { type: 'refresh-start' }
    | { type: 'refresh-success'; session: AuthSession }
    | { type: 'refresh-failure'; code: string; message: string }
    | { type: 'session-expired' }
    | { type: 'logout' }
    | { type: 'reset' };

// ---------------------------------------------------------------------------
// State reducer
// ---------------------------------------------------------------------------

export const reduceAuthState = (
    _current: AuthViewModel,
    event: AuthEvent,
): AuthViewModel => {
    switch (event.type) {
        case 'login-start':
            return { state: 'authenticating' };

        case 'login-success':
            return {
                state: 'active',
                session: event.session,
            };

        case 'login-failure':
            return {
                state: 'error',
                error: authErrorForCode(event.code, event.message),
            };

        case 'refresh-start':
            return {
                ..._current,
                state: 'refreshing',
            };

        case 'refresh-success':
            return {
                state: 'active',
                session: event.session,
                lastRefreshedAt: new Date().toISOString(),
            };

        case 'refresh-failure':
            return {
                state: 'error',
                error: authErrorForCode(event.code, event.message),
            };

        case 'session-expired':
            return {
                state: 'expired',
                session: _current.session,
                error: authErrorForCode(
                    'SESSION_EXPIRED',
                    'Your session has expired.',
                ),
            };

        case 'logout':
        case 'reset':
            return { state: 'idle' };
    }
};

// ---------------------------------------------------------------------------
// Session health check
// ---------------------------------------------------------------------------

export type SessionHealthStatus =
    | 'healthy'
    | 'needs-refresh'
    | 'expired'
    | 'fully-expired'
    | 'no-session';

export const checkSessionHealth = (
    vm: AuthViewModel,
    leewayMs = 60_000,
    now = new Date(),
): SessionHealthStatus => {
    if (!vm.session) {
        return 'no-session';
    }

    if (isRefreshExpired(vm.session, now)) {
        return 'fully-expired';
    }

    if (isSessionExpired(vm.session, now)) {
        return 'expired';
    }

    if (sessionNeedsRefresh(vm.session, leewayMs, now)) {
        return 'needs-refresh';
    }

    return 'healthy';
};

// ---------------------------------------------------------------------------
// Recovery prompt
// ---------------------------------------------------------------------------

export interface RecoveryPrompt {
    title: string;
    message: string;
    actionLabel: string;
    actionType: 'relogin' | 'retry' | 'dismiss';
}

export const buildRecoveryPrompt = (
    vm: AuthViewModel,
): RecoveryPrompt | undefined => {
    if (vm.state === 'expired') {
        return {
            title: 'Session Expired',
            message:
                vm.error?.recoveryHint ??
                'Your session has expired. Please log in again to continue.',
            actionLabel: 'Log in',
            actionType: 'relogin',
        };
    }

    if (vm.state === 'error' && vm.error) {
        if (
            vm.error.recoveryAction === 'relogin' ||
            vm.error.recoveryAction === 'check-handle'
        ) {
            return {
                title: 'Authentication Error',
                message: vm.error.recoveryHint,
                actionLabel: 'Log in again',
                actionType: 'relogin',
            };
        }

        if (
            vm.error.recoveryAction === 'retry' ||
            vm.error.recoveryAction === 'wait-and-retry'
        ) {
            return {
                title: 'Temporary Error',
                message: vm.error.recoveryHint,
                actionLabel: 'Retry',
                actionType: 'retry',
            };
        }

        return {
            title: 'Error',
            message: vm.error.recoveryHint,
            actionLabel: 'Dismiss',
            actionType: 'dismiss',
        };
    }

    return undefined;
};

// ---------------------------------------------------------------------------
// Status notice (parallels chat-ux.ts pattern)
// ---------------------------------------------------------------------------

export interface AuthStatusNotice {
    tone: 'success' | 'warning' | 'danger' | 'info';
    message: string;
}

export const toAuthStatusNotice = (
    vm: AuthViewModel,
): AuthStatusNotice | undefined => {
    if (vm.state === 'active' && vm.session) {
        return {
            tone: 'success',
            message: `Signed in as ${vm.session.handle}`,
        };
    }

    if (vm.state === 'expired') {
        return {
            tone: 'warning',
            message: 'Session expired. Please log in again.',
        };
    }

    if (vm.state === 'error' && vm.error) {
        return {
            tone: 'danger',
            message: vm.error.message,
        };
    }

    if (vm.state === 'refreshing') {
        return {
            tone: 'info',
            message: 'Refreshing session...',
        };
    }

    if (vm.state === 'authenticating') {
        return {
            tone: 'info',
            message: 'Signing in...',
        };
    }

    return undefined;
};
