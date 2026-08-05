import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo } from './auth-api.js';
import { useLocale } from '../i18n';

const safeReturnTo = (): string => {
    if (typeof window === 'undefined') return '/';
    const candidate = new URLSearchParams(window.location.search).get(
        'returnTo',
    );
    return sanitizeReturnTo(candidate ?? '/');
};

const recoveryMessage = (
    code: string,
    t: ReturnType<typeof useLocale>['t'],
): string => {
    if (code === 'PDS_UNAVAILABLE') {
        return t('auth.pdsUnavailable');
    }
    if (code === 'OAUTH_DENIED' || code === 'UNAUTHORIZED') {
        return t('auth.denied');
    }
    if (code === 'OAUTH_STATE_INVALID') {
        return t('auth.stateInvalid');
    }
    if (code === 'SESSION_EXPIRED') {
        return t('auth.sessionExpired');
    }
    return t('auth.authFailed');
};

export const LoginPage = () => {
    const auth = useAuth();
    const { t } = useLocale();
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
                        <strong>{t('app.title')}</strong>
                        <small>{t('auth.tagline')}</small>
                    </span>
                </a>
                <p className='mh-kicker mt-12'>{t('auth.safer')}</p>
                <h1
                    id='login-heading'
                    className='font-heading mt-3 text-5xl font-black leading-none tracking-[-0.045em] sm:text-6xl'
                >
                    {t('auth.loginHeading')}
                </h1>
                <p className='mt-5 max-w-md text-mh-textMuted'>
                    {t('auth.loginHelp')}
                </p>
            </section>
            <form className='mh-card space-y-4 p-6 sm:p-8' onSubmit={submit}>
                <p className='mh-kicker'>{t('auth.connect')}</p>
                <label htmlFor='at-handle' className='block font-bold'>
                    {t('auth.handle')}
                </label>
                <input
                    id='at-handle'
                    name='handle'
                    autoComplete='username'
                    spellCheck={false}
                    required
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    className='mh-input w-full px-3 py-2'
                />
                <button
                    type='submit'
                    disabled={auth.status === 'redirecting'}
                    className='mh-button mh-button--primary px-4 py-2 font-bold'
                >
                    {auth.status === 'redirecting'
                        ? t('auth.opening')
                        : t('auth.continue')}
                </button>
                <p className='text-xs leading-relaxed text-mh-textSoft'>
                    {t('auth.providerHelp')}
                </p>
            </form>
            <div aria-live='polite' className='mh-login-status'>
                {auth.status === 'booting' ? t('auth.checkingSession') : null}
                {auth.status === 'refreshing'
                    ? t('auth.refreshingSession')
                    : null}
                {auth.status === 'authenticated' && auth.session ? (
                    <p>{t('auth.signedIn', { did: auth.session.did })}</p>
                ) : null}
            </div>
            {auth.error ? (
                <div role='alert' className='mh-alert mh-login-error p-4'>
                    <p>{auth.error.message}</p>
                    <p>{recoveryMessage(auth.error.code, t)}</p>
                    <button type='button' onClick={() => void auth.restore()}>
                        {t('auth.retry')}
                    </button>
                </div>
            ) : null}
            <div className='mt-6 text-center sm:mt-8'>
                <a
                    href={`/signup${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
                    className='mh-button mh-button--secondary inline-block px-6 py-3 text-base font-bold'
                >
                    {t('auth.createSubcult')}
                </a>
                <p className='mt-3 text-xs text-mh-textMuted'>
                    {t('auth.newNetwork')}
                </p>
            </div>
        </main>
    );
};
