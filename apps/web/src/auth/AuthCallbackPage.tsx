import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo } from './auth-api.js';

const callbackErrorCode = (): string | null => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('error');
    if (raw === 'access_denied') return 'OAUTH_DENIED';
    if (raw === 'invalid_state') return 'OAUTH_STATE_INVALID';
    return raw && /^[A-Z_]+$/.test(raw) ? raw : null;
};

const callbackMessage = (code: string): string => {
    if (code === 'OAUTH_STATE_INVALID') {
        return 'This login callback is stale or invalid.';
    }
    if (code === 'OAUTH_DENIED' || code === 'UNAUTHORIZED') {
        return 'Authorization was denied by your AT Protocol provider.';
    }
    if (code === 'PDS_UNAVAILABLE') {
        return 'Your AT Protocol provider is temporarily unavailable.';
    }
    return 'The AT Protocol login could not be completed.';
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
    navigate = returnTo => window.location.replace(returnTo),
}: AuthCallbackPageProps = {}) => {
    const auth = useAuth();
    const errorCode = callbackErrorCode();
    const [returnTo] = useState(callbackReturnTo);

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
                            <strong>Patchwork</strong>
                            <small>Mutual aid, block by block</small>
                        </span>
                    </a>
                    <p className='mh-kicker mt-10'>Account connection</p>
                    <h1
                        id='callback-heading'
                        className='font-heading mt-3 text-4xl font-black leading-none tracking-[-0.04em]'
                    >
                        Let’s get you back on track.
                    </h1>
                    <div role='alert' className='mh-alert mt-5 p-4'>
                        <p className='font-bold'>
                            {callbackMessage(errorCode)}
                        </p>
                        <p className='mt-2 text-sm'>
                            Start a new login. Reusing this callback will not
                            work.
                        </p>
                    </div>
                    <a
                        className='mh-link mt-5 inline-block font-bold'
                        href='/login'
                    >
                        Start a new login
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
                        <strong>Patchwork</strong>
                        <small>Mutual aid, block by block</small>
                    </span>
                </a>
                <p className='mh-kicker mt-10'>Secure handoff</p>
                <h1
                    id='callback-heading'
                    className='font-heading mt-3 text-4xl font-black leading-none tracking-[-0.04em]'
                >
                    Completing sign in
                </h1>
                <p
                    role='status'
                    aria-live='polite'
                    className='mt-4 text-mh-textMuted'
                >
                    {auth.status === 'expired' ?
                        'The session expired. Start a new login.'
                    : auth.status === 'error' ?
                        'Patchwork could not verify the new session.'
                    : auth.status === 'authenticated' ?
                        'Session verified. Continuing…'
                    :   'Checking your cookie-backed session…'}
                </p>
                {auth.status === 'expired' || auth.status === 'error' ?
                    <div className='mt-5 flex flex-wrap gap-3'>
                        <button
                            type='button'
                            className='mh-button mh-button--secondary px-4 py-2 font-bold'
                            onClick={() => void auth.restore()}
                        >
                            Retry session check
                        </button>
                        <a
                            className='mh-link inline-block py-2 font-bold'
                            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                        >
                            Start a new login
                        </a>
                    </div>
                :   null}
            </section>
        </main>
    );
};
