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
            <main id='main-content' tabIndex={-1} aria-labelledby='callback-heading' className='mx-auto max-w-lg p-6'>
                <h1 id='callback-heading' className='text-2xl font-black'>
                    Sign-in recovery
                </h1>
                <div role='alert' className='mt-4 border-2 border-mh-danger p-4'>
                    <p>{callbackMessage(errorCode)}</p>
                    <p className='mt-2'>
                        Start a new login. Reusing this callback will not work.
                    </p>
                </div>
                <a className='mt-4 inline-block font-bold underline' href='/login'>
                    Start a new login
                </a>
            </main>
        );
    }

    return (
        <main id='main-content' tabIndex={-1} aria-labelledby='callback-heading' className='mx-auto max-w-lg p-6'>
            <h1 id='callback-heading' className='text-2xl font-black'>
                Completing sign in
            </h1>
            <p role='status' aria-live='polite' className='mt-4'>
                {auth.status === 'expired' ?
                    'The session expired. Start a new login.'
                :   'Checking your cookie-backed session…'}
            </p>
            {auth.status === 'expired' ?
                <a className='mt-4 inline-block font-bold underline' href='/login'>
                    Sign in again
                </a>
            :   null}
        </main>
    );
};
