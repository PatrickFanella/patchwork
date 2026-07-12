import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo } from './auth-api.js';

const safeReturnTo = (): string => {
    if (typeof window === 'undefined') return '/';
    const candidate = new URLSearchParams(window.location.search).get('returnTo');
    return sanitizeReturnTo(candidate ?? '/');
};

const recoveryMessage = (code: string): string => {
    if (code === 'PDS_UNAVAILABLE') {
        return 'Your AT Protocol server is temporarily unavailable. Check its status and retry.';
    }
    if (code === 'OAUTH_DENIED' || code === 'UNAUTHORIZED') {
        return 'Authorization was denied. You can try again when you are ready.';
    }
    if (code === 'OAUTH_STATE_INVALID') {
        return 'This login callback is stale or invalid. Start a new login.';
    }
    if (code === 'SESSION_EXPIRED') {
        return 'Your session expired. Sign in again to continue.';
    }
    return 'Authentication could not be completed. Retry, or contact support if it continues.';
};

export const LoginPage = () => {
    const auth = useAuth();
    const [handle, setHandle] = useState('');

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (handle.trim()) void auth.login(handle, safeReturnTo());
    };

    return (
        <main id='main-content' tabIndex={-1} aria-labelledby='login-heading' className='mx-auto max-w-lg p-6'>
            <h1 id='login-heading' className='text-2xl font-black'>
                Sign in to Patchwork
            </h1>
            <p className='mt-2'>
                Continue through your AT Protocol server. Patchwork never asks
                for or stores your password.
            </p>
            <form className='mt-6 space-y-4' onSubmit={submit}>
                <label htmlFor='at-handle' className='block font-bold'>
                    AT Protocol handle
                </label>
                <input
                    id='at-handle'
                    name='handle'
                    autoComplete='username'
                    required
                    value={handle}
                    onChange={event => setHandle(event.target.value)}
                    className='w-full border-2 border-mh-border p-2'
                />
                <button
                    type='submit'
                    disabled={auth.status === 'redirecting'}
                    className='mh-button mh-button--primary px-4 py-2 font-bold'
                >
                    {auth.status === 'redirecting' ?
                        'Opening your provider…'
                    :   'Continue with AT Protocol'}
                </button>
            </form>
            <div aria-live='polite' className='mt-4'>
                {auth.status === 'booting' ? 'Checking your session…' : null}
                {auth.status === 'refreshing' ? 'Refreshing your session…' : null}
                {auth.status === 'authenticated' && auth.session ?
                    <p>Signed in as {auth.session.did}</p>
                :   null}
            </div>
            {auth.error ?
                <div role='alert' className='mt-4 border-2 border-mh-danger p-3'>
                    <p>{auth.error.message}</p>
                    <p>{recoveryMessage(auth.error.code)}</p>
                    <button type='button' onClick={() => void auth.restore()}>
                        Retry
                    </button>
                </div>
            :   null}
        </main>
    );
};
