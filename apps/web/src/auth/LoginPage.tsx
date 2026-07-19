import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo } from './auth-api.js';

const safeReturnTo = (): string => {
    if (typeof window === 'undefined') return '/';
    const candidate = new URLSearchParams(window.location.search).get(
        'returnTo',
    );
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

    const returnTo = safeReturnTo();

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (handle.trim()) void auth.login(handle, returnTo);
    };

    return (
        <main
            id='main-content'
            tabIndex={-1}
            aria-labelledby='login-heading'
            className='mh-login-shell'
        >
            <section className='mh-login-intro'>
                <a href='/' className='mh-brand'>
                    <span className='mh-brand-mark' aria-hidden='true'>
                        P
                    </span>
                    <span>
                        <strong>Patchwork</strong>
                        <small>Mutual aid, block by block</small>
                    </span>
                </a>
                <p className='mh-kicker mt-12'>A safer way into the network</p>
                <h1
                    id='login-heading'
                    className='font-heading mt-3 text-5xl font-black leading-none tracking-[-0.045em] sm:text-6xl'
                >
                    Come on in.
                    <br />
                    Your neighbors are here.
                </h1>
                <p className='mt-5 max-w-md text-mh-textMuted'>
                    Sign in through your AT Protocol server. Patchwork never
                    sees, asks for, or stores your password.
                </p>
            </section>
            <form className='mh-card space-y-4 p-6 sm:p-8' onSubmit={submit}>
                <p className='mh-kicker'>Connect your account</p>
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
                    className='mh-input w-full px-3 py-2'
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
                <p className='text-xs leading-relaxed text-mh-textSoft'>
                    You will continue on your own provider's secure sign-in
                    page, then return here.
                </p>
            </form>
            <div aria-live='polite' className='mh-login-status'>
                {auth.status === 'booting' ? 'Checking your session…' : null}
                {auth.status === 'refreshing' ?
                    'Refreshing your session…'
                :   null}
                {auth.status === 'authenticated' && auth.session ?
                    <p>Signed in as {auth.session.did}</p>
                :   null}
            </div>
            {auth.error ?
                <div role='alert' className='mh-alert mh-login-error p-4'>
                    <p>{auth.error.message}</p>
                    <p>{recoveryMessage(auth.error.code)}</p>
                    <button type='button' onClick={() => void auth.restore()}>
                        Retry
                    </button>
                </div>
            :   null}
            <div className='mt-6 text-center sm:mt-8'>
                <a
                    href={`/signup${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
                    className='mh-button mh-button--secondary inline-block px-6 py-3 text-base font-bold'
                >
                    Create a Subcult account
                </a>
                <p className='mt-3 text-xs text-mh-textMuted'>
                    New to the network? Get your own handle and join the community.
                </p>
            </div>
        </main>
    );
};
