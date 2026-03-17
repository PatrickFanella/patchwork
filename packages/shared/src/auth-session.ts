import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Session state enum
// ---------------------------------------------------------------------------

export const sessionStates = [
    'idle',
    'authenticating',
    'active',
    'expired',
    'refreshing',
    'error',
] as const;
export type SessionState = (typeof sessionStates)[number];

// ---------------------------------------------------------------------------
// Auth session
// ---------------------------------------------------------------------------

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

export const authSessionSchema = z.object({
    did: didSchema,
    handle: z.string().min(3),
    accessJwt: z.string().min(16),
    refreshJwt: z.string().min(16),
    expiresAt: isoDateTimeSchema,
    refreshExpiresAt: isoDateTimeSchema,
    issuedAt: isoDateTimeSchema,
    refreshedAt: isoDateTimeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Auth error types with recovery actions
// ---------------------------------------------------------------------------

export const authRecoveryActions = [
    'retry',
    'relogin',
    'contact-support',
    'check-handle',
    'wait-and-retry',
] as const;
export type AuthRecoveryAction = (typeof authRecoveryActions)[number];

export interface AuthError {
    code: string;
    message: string;
    recoveryAction: AuthRecoveryAction;
    recoveryHint: string;
}

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

export const isSessionExpired = (
    session: AuthSession,
    now = new Date(),
): boolean => {
    return new Date(session.expiresAt).getTime() <= now.getTime();
};

export const isRefreshExpired = (
    session: AuthSession,
    now = new Date(),
): boolean => {
    return new Date(session.refreshExpiresAt).getTime() <= now.getTime();
};

export const sessionNeedsRefresh = (
    session: AuthSession,
    leewayMs = 60_000,
    now = new Date(),
): boolean => {
    const expiresAt = new Date(session.expiresAt).getTime();
    return expiresAt - now.getTime() <= leewayMs;
};
