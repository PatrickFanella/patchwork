import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { deleteAccountViaApi } from '../features/api-client';
import { useLocale } from '../i18n';
import { Button } from '../components/Button';

/** Public request path; applying deletion always requires fresh authenticated authority. */
export const AccountDeletionPage = () => {
    const auth = useAuth();
    const { t } = useLocale();
    const [confirmed, setConfirmed] = useState(false);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const remove = async () => {
        if (!confirmed || pending) return;
        setPending(true);
        const result = await deleteAccountViaApi();
        setPending(false);
        if (result.ok) {
            setMessage(t('deletion.complete'));
            setConfirmed(false);
            await auth.restore();
        } else {
            setMessage(t('deletion.retry'));
        }
    };
    return <main id='main-content' className='mx-auto max-w-2xl space-y-5 p-6'>
        <a href='/'>{t('app.title')}</a>
        <h1 className='text-2xl font-bold'>{t('deletion.title')}</h1>
        <p>{t('deletion.scope')}</p>
        <p>{t('deletion.retention')}</p>
        <p>{t('deletion.identity')}</p>
        <a href='/legal/privacy'>{t('legal.privacyTitle')}</a>
        {message ? <p role='status'>{message}</p> : null}
        <p>{t('deletion.signInHelp')}</p>
        <a href='/login?returnTo=%2Faccount%2Fdelete'>{t('deletion.signIn')}</a>
        {auth.status === 'authenticated' ? <div className='space-y-4'>
            <p>{auth.session?.did}</p>
            <label className='flex items-start gap-2'>
                <input type='checkbox' checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                {t('deletion.confirm')}
            </label>
            <Button type='button' variant='danger' disabled={!confirmed || pending} onClick={() => void remove()}>
                {t(pending ? 'deletion.pending' : 'deletion.submit')}
            </Button>
        </div> : null}
    </main>;
};
