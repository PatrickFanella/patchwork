import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider.js';
import { sanitizeReturnTo, signup, type SignupResult, AuthApiError } from './auth-api.js';

const safeReturnTo = (): string => {
    if (typeof window === 'undefined') return '/';
    const candidate = new URLSearchParams(window.location.search).get(
        'returnTo',
    );
    return sanitizeReturnTo(candidate ?? '/');
};

const signupErrorMessage = (error: AuthApiError): string => {
    if (error.code === 'INVALID_SIGNUP_INPUT') {
        return 'The information you provided is invalid. Please check your entries and try again.';
    }
    if (error.code === 'INVALID_HANDLE') {
        return 'The handle format is invalid. Please choose a different one.';
    }
    if (error.code === 'RESERVED_HANDLE') {
        return 'This handle is reserved and cannot be used. Please choose a different one.';
    }
    if (error.code === 'HANDLE_ALREADY_EXISTS') {
        return 'This handle is already taken. Please choose a different one.';
    }
    if (error.code === 'INVALID_INVITE_CODE') {
        return 'The invite code you provided is invalid or has already been used.';
    }
    if (error.code === 'INVALID_PASSWORD') {
        return 'Your password does not meet the requirements. It must be at least 8 characters.';
    }
    if (error.code === 'PDS_RATE_LIMITED') {
        return 'Too many signup attempts. Please wait a moment and try again.';
    }
    if (error.code === 'PDS_UNAVAILABLE') {
        return 'The AT Protocol server is temporarily unavailable. Please try again later.';
    }
    return 'Unable to create your account. Please try again or contact support.';
};

export const SignupPage = () => {
    const auth = useAuth();
    const [handleLabel, setHandleLabel] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<AuthApiError | null>(null);

    const fullHandle = handleLabel.trim() ?
        `${handleLabel.trim().toLowerCase()}.subcult.tv`
    :   '';

    const handleLabelValid = /^[a-z0-9](?:[a-z0-9-]{1,16}[a-z0-9])$/.test(
        handleLabel,
    );

    const passwordsMatch = password === passwordConfirm && password.length > 0;

    const clearPasswords = () => {
        setPassword('');
        setPasswordConfirm('');
    };

    const returnTo = safeReturnTo();

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!handleLabelValid) {
            setError(new AuthApiError(
                'INVALID_HANDLE',
                'Handle must be 3-18 characters.',
            ));
            clearPasswords();
            return;
        }

        if (!passwordsMatch) {
            setError(new AuthApiError(
                'INVALID_PASSWORD',
                'Passwords do not match.',
            ));
            clearPasswords();
            return;
        }

        if (!termsAccepted) {
            setError(new AuthApiError(
                'INVALID_SIGNUP_INPUT',
                'You must accept the Terms of Service and Privacy Policy.',
            ));
            clearPasswords();
            return;
        }

        setIsLoading(true);

        try {
            const result: SignupResult = await signup({
                handle: fullHandle,
                email: email.trim(),
                password,
                inviteCode: inviteCode.trim(),
            });
            clearPasswords();
            await auth.login(result.handle, returnTo);
        } catch (err) {
            clearPasswords();
            if (err instanceof AuthApiError) {
                setError(err);
            } else {
                setError(new AuthApiError('UNKNOWN', 'An unexpected error occurred.'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main
            id='main-content'
            tabIndex={-1}
            aria-labelledby='signup-heading'
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
                    id='signup-heading'
                    className='font-heading mt-3 text-5xl font-black leading-none tracking-[-0.045em] sm:text-6xl'
                >
                    Join your
                    <br />
                    neighbors.
                </h1>
                <p className='mt-5 max-w-md text-mh-textMuted'>
                    Create a new AT Protocol account through Patchwork.
                    You will need an invite code to register.
                </p>
            </section>
            <form
                className='mh-card space-y-4 p-6 sm:p-8'
                onSubmit={submit}
                aria-describedby={error ? 'signup-error' : undefined}
            >
                <p className='mh-kicker'>Create your account</p>

                <div>
                    <label htmlFor='handle-label' className='block font-bold'>
                        Choose your handle
                    </label>
                    <div className='relative'>
                        <input
                            id='handle-label'
                            name='handleLabel'
                            autoComplete='username'
                            required
                            pattern='^[a-z0-9](?:[a-z0-9-]{1,16}[a-z0-9])$'
                            title='3-18 lowercase letters, numbers, or interior hyphens'
                            value={handleLabel}
                            onChange={event =>
                                setHandleLabel(
                                    event.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]/g, '')
                                        .slice(0, 18),
                                )
                            }
                            className='mh-input w-full px-3 py-2 pr-[5.5rem]'
                            disabled={isLoading}
                            aria-describedby='handle-suffix'
                        />
                        <span
                            id='handle-suffix'
                            className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mh-textMuted'
                            aria-hidden='true'
                        >
                            .subcult.tv
                        </span>
                    </div>
                    <p className='mt-1 text-xs text-mh-textSoft'>
                        {handleLabel.length > 0 && !handleLabelValid ?
                            `${handleLabel.length}/18 - must be 3-18 characters`
                        :   'This will be your unique identifier'}
                    </p>
                </div>

                <div>
                    <label htmlFor='email' className='block font-bold'>
                        Email address
                    </label>
                    <input
                        id='email'
                        name='email'
                        type='email'
                        autoComplete='email'
                        required
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        className='mh-input w-full px-3 py-2'
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label htmlFor='password' className='block font-bold'>
                        Password
                    </label>
                    <input
                        id='password'
                        name='password'
                        type='password'
                        autoComplete='new-password'
                        required
                        minLength={8}
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        className='mh-input w-full px-3 py-2'
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label htmlFor='password-confirm' className='block font-bold'>
                        Confirm password
                    </label>
                    <input
                        id='password-confirm'
                        name='passwordConfirm'
                        type='password'
                        autoComplete='new-password'
                        required
                        minLength={8}
                        value={passwordConfirm}
                        onChange={event => setPasswordConfirm(event.target.value)}
                        className='mh-input w-full px-3 py-2'
                        disabled={isLoading}
                        aria-describedby={!passwordsMatch && passwordConfirm.length > 0 ? 'password-mismatch' : undefined}
                    />
                    {passwordConfirm.length > 0 && !passwordsMatch && (
                        <p id='password-mismatch' className='mt-1 text-xs text-mh-danger' role='alert'>
                            Passwords do not match
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor='invite-code' className='block font-bold'>
                        Invite code
                    </label>
                    <input
                        id='invite-code'
                        name='inviteCode'
                        type='text'
                        autoComplete='off'
                        required
                        value={inviteCode}
                        onChange={event => setInviteCode(event.target.value)}
                        className='mh-input w-full px-3 py-2'
                        disabled={isLoading}
                    />
                </div>

                <div className='flex items-start gap-2'>
                    <input
                        id='terms-accepted'
                        name='termsAccepted'
                        type='checkbox'
                        required
                        checked={termsAccepted}
                        onChange={event => setTermsAccepted(event.target.checked)}
                        className='mt-1 h-4 w-4 accent-mh-accent'
                        disabled={isLoading}
                    />
                    <label htmlFor='terms-accepted' className='text-sm leading-relaxed text-mh-textMuted'>
                        I agree to the{' '}
                        <a
                            href='https://subcult.tv/terms'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-mh-link hover:underline'
                        >
                            Terms of Service
                        </a>
                        {' '}and{' '}
                        <a
                            href='https://subcult.tv/privacy'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-mh-link hover:underline'
                        >
                            Privacy Policy
                        </a>
                    </label>
                </div>

                <button
                    type='submit'
                    disabled={isLoading || !handleLabelValid || !passwordsMatch || !termsAccepted}
                    className='mh-button mh-button--primary px-4 py-2 font-bold w-full sm:w-auto'
                >
                    {isLoading ? 'Creating account…' : 'Create account'}
                </button>

                <p className='text-xs leading-relaxed text-mh-textSoft'>
                    Already have an account?{' '}
                    <a href={`/login${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className='text-mh-link hover:underline'>
                        Sign in
                    </a>
                </p>
            </form>
            <div aria-live='polite' aria-atomic='true' className='mh-login-status'>
                {isLoading ? 'Creating your account…' : null}
            </div>
            {error && (
                <div id='signup-error' role='alert' className='mh-alert mh-login-error p-4'>
                    <p>{error.message}</p>
                    <p>{signupErrorMessage(error)}</p>
                    <button type='button' onClick={() => setError(null)}>
                        Try again
                    </button>
                </div>
            )}
        </main>
    );
};
