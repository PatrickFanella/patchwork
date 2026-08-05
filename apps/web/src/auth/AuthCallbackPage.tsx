import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo } from './auth-api.js';
import { useLocale } from '../i18n';

const callbackErrorCode = (): string | null => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('error');
    if (raw === 'access_denied') return 'OAUTH_DENIED';
    if (raw === 'invalid_state') return 'OAUTH_STATE_INVALID';
    return raw && /^[A-Z_]+$/.test(raw) ? raw : null;
};

const callbackMessage = (
    code: string,
    t: ReturnType<typeof useLocale>['t'],
): string => {
    if (code === 'OAUTH_STATE_INVALID') {
        return t('auth.callbackStale');
    }
    if (code === 'OAUTH_DENIED' || code === 'UNAUTHORIZED') {
        return t('auth.callbackDenied');
    }
    if (code === 'PDS_UNAVAILABLE') {
        return t('auth.callbackPds');
    }
    return t('auth.callbackFailed');
};

const callbackReturnTo = (): string => {
    if (typeof window === 'undefined') return '/';
    const candidate = sanitizeReturnTo(
        new URLSearchParams(window.location.search).get('returnTo') ?? '/',
    );
    return candidate.startsWith('/auth/callback') ? '/' : candidate;
};

export interface AuthCallbackPageProps {
    navigate?: (returnTo: string) => void;
}

export const AuthCallbackPage = ({
    navigate = (returnTo) => window.location.replace(returnTo),
}: AuthCallbackPageProps = {}) => {
    const auth = useAuth();
    const { t } = useLocale();
    const [errorCode] = useState(callbackErrorCode);
    const [returnTo] = useState(callbackReturnTo);
    const sessionUnavailable =
        auth.status === 'anonymous' ||
        auth.status === 'expired' ||
        auth.status === 'error';

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search) {
            window.history.replaceState({}, '', '/auth/callback');
        }
    }, []);

    useEffect(() => {
        if (!errorCode && auth.status === 'authenticated' && auth.session) {
            navigate(returnTo);
        }
    }, [auth.session, auth.status, errorCode, navigate, returnTo]);

    if (errorCode) {
        return (
            <main
                id='main-content'
                tabIndex={-1}
                aria-labelledby='callback-heading'
                className='mh-auth-state-shell'
            >
                <section className='mh-auth-state-card'>
                    <a href='/' className='mh-brand'>
                        <span className='mh-brand-mark' aria-hidden='true'>
                            P
                        </span>
                        <span>
                            <strong>{t('app.title')}</strong>
                            <small>{t('auth.tagline')}</small>
                        </span>
                    </a>
                    <p className='mh-kicker mt-10'>
                        {t('auth.accountConnection')}
                    </p>
                    <h1
                        id='callback-heading'
                        className='font-heading mt-3 text-4xl font-black leading-none tracking-[-0.04em]'
                    >
                        {t('auth.backOnTrack')}
                    </h1>
                    <div role='alert' className='mh-alert mt-5 p-4'>
                        <p className='font-bold'>
                            {callbackMessage(errorCode, t)}
                        </p>
                        <p className='mt-2 text-sm'>
                            {t('auth.callbackRetryHelp')}
                        </p>
                    </div>
                    <a
                        className='mh-link mt-5 inline-block font-bold'
                        href='/login'
                    >
                        {t('auth.newLogin')}
                    </a>
                </section>
            </main>
        );
    }

    return (
        <main
            id='main-content'
            tabIndex={-1}
            aria-labelledby='callback-heading'
            className='mh-auth-state-shell'
        >
            <section className='mh-auth-state-card'>
                <a href='/' className='mh-brand'>
                    <span className='mh-brand-mark' aria-hidden='true'>
                        P
                    </span>
                    <span>
                        <strong>{t('app.title')}</strong>
                        <small>{t('auth.tagline')}</small>
                    </span>
                </a>
                <p className='mh-kicker mt-10'>{t('auth.secureHandoff')}</p>
                <h1
                    id='callback-heading'
                    className='font-heading mt-3 text-4xl font-black leading-none tracking-[-0.04em]'
                >
                    {t('auth.completing')}
                </h1>
                <p
                    role='status'
                    aria-live='polite'
                    className='mt-4 text-mh-textMuted'
                >
                    {auth.status === 'anonymous'
                        ? t('auth.noSession')
                        : auth.status === 'expired'
                          ? t('auth.expiredSession')
                          : auth.status === 'error'
                            ? t('auth.verifyFailed')
                            : auth.status === 'authenticated'
                              ? t('auth.verified')
                              : t('auth.checkingCookie')}
                </p>
                {sessionUnavailable ? (
                    <div className='mt-5 flex flex-wrap gap-3'>
                        <button
                            type='button'
                            className='mh-button mh-button--secondary px-4 py-2 font-bold'
                            onClick={() => void auth.restore()}
                        >
                            {t('auth.retrySession')}
                        </button>
                        <a
                            className='mh-link inline-block py-2 font-bold'
                            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                        >
                            {t('auth.newLogin')}
                        </a>
                    </div>
                ) : null}
            </section>
        </main>
    );
};
