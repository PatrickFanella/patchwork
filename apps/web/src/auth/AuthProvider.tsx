import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    AuthApiError,
    beginLogin,
    getCurrentSession,
    logoutSession,
    refreshSession,
    type AuthSessionSummary,
} from './auth-api.js';

export type AuthStatus =
    | 'booting'
    | 'anonymous'
    | 'redirecting'
    | 'authenticated'
    | 'refreshing'
    | 'expired'
    | 'error';

export interface AuthContextValue {
    status: AuthStatus;
    session: AuthSessionSummary | null;
    error: AuthApiError | null;
    login(handle: string, returnTo: string): Promise<boolean>;
    refresh(): Promise<void>;
    logout(): Promise<void>;
    restore(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const toAuthError = (error: unknown): AuthApiError =>
    error instanceof AuthApiError ?
        error
    :   new AuthApiError(
            'AUTH_ERROR',
            'Authentication is temporarily unavailable.',
            true,
        );

export interface AuthProviderProps {
    children: ReactNode;
    initialStatus?: AuthStatus;
    navigate?: (authorizationUrl: string) => void;
}

export const AuthProvider = ({
    children,
    initialStatus,
    navigate = authorizationUrl => window.location.assign(authorizationUrl),
}: AuthProviderProps) => {
    const [status, setStatus] = useState<AuthStatus>(
        initialStatus ?? 'booting',
    );
    const [session, setSession] = useState<AuthSessionSummary | null>(null);
    const [error, setError] = useState<AuthApiError | null>(null);

    const restore = useCallback(async () => {
        setStatus('booting');
        setError(null);
        try {
            const current = await getCurrentSession();
            setSession(current);
            setStatus(current ? 'authenticated' : 'anonymous');
        } catch (cause) {
            const authError = toAuthError(cause);
            setSession(null);
            setError(authError);
            setStatus(
                authError.code === 'SESSION_EXPIRED' ? 'expired' : 'error',
            );
        }
    }, []);

    const refresh = useCallback(async () => {
        setStatus('refreshing');
        setError(null);
        try {
            const refreshed = await refreshSession();
            setSession(refreshed);
            setStatus('authenticated');
        } catch (cause) {
            const authError = toAuthError(cause);
            setSession(null);
            setError(authError);
            setStatus(
                authError.code === 'SESSION_EXPIRED' ? 'expired' : 'error',
            );
        }
    }, []);

    const login = useCallback(
        async (handle: string, returnTo: string) => {
            setStatus('redirecting');
            setError(null);
            try {
                const result = await beginLogin(handle, returnTo);
                navigate(result.authorizationUrl);
                return true;
            } catch (cause) {
                setError(toAuthError(cause));
                setStatus('error');
                return false;
            }
        },
        [navigate],
    );

    const logout = useCallback(async () => {
        setError(null);
        try {
            await logoutSession();
            setSession(null);
            setStatus('anonymous');
        } catch (cause) {
            setError(toAuthError(cause));
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        if (!initialStatus) void restore();
    }, [initialStatus, restore]);

    useEffect(() => {
        if (status !== 'authenticated' || !session) return undefined;
        const refreshAt = new Date(session.expiresAt).getTime() - 60_000;
        const delay = Math.min(
            2_147_483_647,
            Math.max(0, refreshAt - Date.now()),
        );
        const timer = window.setTimeout(() => void refresh(), delay);
        return () => window.clearTimeout(timer);
    }, [refresh, session, status]);

    const value = useMemo<AuthContextValue>(
        () => ({ status, session, error, login, refresh, logout, restore }),
        [error, login, logout, refresh, restore, session, status],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useAuth must be used inside AuthProvider.');
    return value;
};
