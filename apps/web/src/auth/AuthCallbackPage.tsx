import { useEffect } from 'react';
import { useAuth } from './AuthProvider.js';

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

export const AuthCallbackPage = () => {
    const auth = useAuth();
    const errorCode = callbackErrorCode();

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search) {
            window.history.replaceState({}, '', '/auth/callback');
        }
    }, []);

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
                    :   'Checking your cookie-backed session…'}
                </p>
                {auth.status === 'expired' ?
                    <a
                        className='mh-link mt-5 inline-block font-bold'
                        href='/login'
                    >
                        Sign in again
                    </a>
                :   null}
            </section>
        </main>
    );
};
