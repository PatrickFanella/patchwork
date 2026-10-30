import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '../components/Banner';
import { Button, ButtonLink } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusMessage } from '../components/StatusMessage';
import { Surface } from '../components/Surface';
import {
    createSupportCheckoutViaApi,
    fetchAccountSupportViaApi,
    fetchSupportCheckoutViaApi,
    fetchSupportOptionsViaApi,
    openSupportPortalViaApi,
    type AccountSupport,
    type SupportCheckoutRequest,
    type SupportCheckoutStatus,
    type SupportOptions,
} from '../features/api-client';
import { useLocale } from '../i18n';

const dollarsPattern = /^\d{1,5}(\.\d{1,2})?$/u;

/** Parse a dollar amount typed by the donor into cents, or undefined. */
export const parseDollarsToMinor = (value: string): number | undefined => {
    const trimmed = value.trim().replace(/^\$/u, '');
    if (!dollarsPattern.test(trimmed)) return undefined;
    const [whole, fraction = ''] = trimmed.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

const useMoney = () => {
    const { fmt } = useLocale();
    return useCallback((minor: number) => fmt.currency(minor / 100, 'USD'), [fmt]);
};

/** Send the browser to Stripe Checkout; a new key per attempt, reused on double clicks. */
const useCheckout = () => {
    const { t } = useLocale();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const attempt = useRef<{ request: string; key: string } | undefined>(undefined);
    const start = async (request: SupportCheckoutRequest) => {
        const serialized = JSON.stringify(request);
        if (attempt.current?.request !== serialized) {
            attempt.current = { request: serialized, key: globalThis.crypto.randomUUID() };
        }
        setPending(true);
        setError(undefined);
        const result = await createSupportCheckoutViaApi(request, attempt.current.key);
        if (!result.ok) {
            setPending(false);
            setError(`${t('common.error')}: ${t('support.checkoutFailed')}`);
            return;
        }
        window.location.assign(result.data.url);
    };
    return { start, pending, error };
};

const ReceiptNotice = ({ options }: { options: SupportOptions }) => {
    const { t } = useLocale();
    return (
        <p className='text-sm text-mh-textMuted'>
            {options.receipt.mode === 'charitable' ?
                t('support.receipt.charitable', {
                    legalName: options.receipt.legalName,
                    ein: options.receipt.ein,
                })
            :   t('support.receipt.nonDeductible')}
        </p>
    );
};

export const SupportRoute = () => {
    const { t } = useLocale();
    const money = useMoney();
    const [options, setOptions] = useState<SupportOptions>();
    const [loadFailed, setLoadFailed] = useState(false);
    const [mode, setMode] = useState<'one-time' | 'monthly'>('one-time');
    const [amountText, setAmountText] = useState('25');
    const [amountError, setAmountError] = useState<string>();
    const checkout = useCheckout();

    useEffect(() => {
        const controller = new AbortController();
        void fetchSupportOptionsViaApi(controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) setOptions(result.data);
            else setLoadFailed(true);
        });
        return () => controller.abort();
    }, []);

    const header = (
        <PageHeader
            eyebrow={t('support.eyebrow')}
            title={t('support.title')}
            description={t('support.intro')}
        >
            <p className='mt-2 text-sm'>{t('support.boundary')}</p>
        </PageHeader>
    );

    if (!options) {
        return (
            <section className='space-y-6'>
                {header}
                {loadFailed ?
                    <Banner tone='warning'>{t('support.loadFailed')}</Banner>
                :   <StatusMessage message={String(t('support.thanks.checking'))} />}
            </section>
        );
    }
    if (!options.paymentsEnabled) {
        return (
            <section className='space-y-6'>
                {header}
                <Banner tone='info'>{t('support.unavailable')}</Banner>
            </section>
        );
    }

    const limits = { min: money(options.oneTime.minMinor), max: money(options.oneTime.maxMinor) };
    const amountMinor = parseDollarsToMinor(amountText);
    const amountValid =
        amountMinor !== undefined &&
        amountMinor >= options.oneTime.minMinor &&
        amountMinor <= options.oneTime.maxMinor;

    const submitOneTime = () => {
        if (!amountValid) {
            setAmountError(String(t('support.oneTime.invalidAmount', limits)));
            return;
        }
        setAmountError(undefined);
        void checkout.start({ recipient: 'general-fund', mode: 'one-time', amountMinor: amountMinor! });
    };

    return (
        <section className='space-y-6'>
            {header}
            {options.mode === 'test' ? <Banner tone='warning'>{t('support.testMode')}</Banner> : null}
            <Surface title={t('support.mode.label')}>
                <div className='space-y-4'>
                    <SegmentedControl
                        label={String(t('support.mode.label'))}
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: 'one-time', label: t('support.mode.oneTime') },
                            { value: 'monthly', label: t('support.mode.monthly') },
                        ]}
                    />
                    {mode === 'one-time' ? (
                        <form
                            className='space-y-3'
                            aria-label={String(t('support.oneTime.title'))}
                            onSubmit={(event) => {
                                event.preventDefault();
                                submitOneTime();
                            }}
                        >
                            <div className='flex flex-wrap gap-2'>
                                {options.oneTime.suggestedMinor.map((suggested) => (
                                    <Button
                                        key={suggested}
                                        variant={amountMinor === suggested ? 'primary' : 'secondary'}
                                        size='sm'
                                        aria-pressed={amountMinor === suggested}
                                        onClick={() => {
                                            setAmountText(String(suggested / 100));
                                            setAmountError(undefined);
                                        }}
                                    >
                                        {money(suggested)}
                                    </Button>
                                ))}
                            </div>
                            <label className='block text-sm font-bold' htmlFor='support-amount'>
                                {t('support.oneTime.amountLabel')}
                            </label>
                            <input
                                id='support-amount'
                                className='mh-input w-full max-w-xs px-3 py-2'
                                inputMode='decimal'
                                autoComplete='off'
                                value={amountText}
                                aria-describedby='support-amount-hint'
                                aria-invalid={amountError ? true : undefined}
                                onChange={(event) => setAmountText(event.target.value)}
                            />
                            <p id='support-amount-hint' className='text-xs text-mh-textMuted'>
                                {t('support.oneTime.amountHint', limits)}
                            </p>
                            {amountError ? <StatusMessage message={`${t('common.error')}: ${amountError}`} /> : null}
                            <Button type='submit' disabled={checkout.pending}>
                                {checkout.pending ?
                                    t('support.redirecting')
                                :   t('support.oneTime.submit', {
                                        amount: amountValid ? money(amountMinor!) : '',
                                    })}
                            </Button>
                        </form>
                    ) : (
                        <div className='space-y-3'>
                            <ul className='grid gap-3 sm:grid-cols-3' aria-label={String(t('support.monthly.title'))}>
                                {options.tiers.map((tier) => (
                                    <li key={tier.key}>
                                        <Surface as='article' tone='plain' title={t(tier.nameKey)} headingLevel='h3'>
                                            <p className='text-lg font-bold'>
                                                {t('support.monthly.perMonth', { amount: money(tier.amountMinor) })}
                                            </p>
                                            <p className='mt-1 text-sm text-mh-textMuted'>{t(tier.descriptionKey)}</p>
                                            <Button
                                                className='mt-3'
                                                size='sm'
                                                disabled={checkout.pending}
                                                onClick={() => void checkout.start({
                                                    recipient: 'general-fund',
                                                    mode: 'monthly',
                                                    tierKey: tier.key,
                                                })}
                                            >
                                                {t('support.monthly.choose', { name: t(tier.nameKey) })}
                                            </Button>
                                        </Surface>
                                    </li>
                                ))}
                            </ul>
                            <p className='text-sm text-mh-textMuted'>{t('support.monthly.recognition')}</p>
                            <p className='text-sm text-mh-textMuted'>{t('support.monthly.cancelAnytime')}</p>
                        </div>
                    )}
                    {checkout.error ? <StatusMessage message={checkout.error} /> : null}
                    <p className='text-sm text-mh-textMuted'>{t('support.stripeNotice')}</p>
                    <ReceiptNotice options={options} />
                </div>
            </Surface>
        </section>
    );
};

const checkoutIdFromLocation = (): string =>
    typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('checkout') ?? '';

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 6;

export const SupportThanksRoute = () => {
    const { t } = useLocale();
    const money = useMoney();
    const [status, setStatus] = useState<SupportCheckoutStatus>();
    const [missing, setMissing] = useState(false);
    const [settled, setSettled] = useState(false);
    const [round, setRound] = useState(0);

    useEffect(() => {
        const checkoutId = checkoutIdFromLocation();
        const controller = new AbortController();
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        setSettled(false);
        const poll = async () => {
            attempts += 1;
            const result = await fetchSupportCheckoutViaApi(checkoutId, controller.signal);
            if (controller.signal.aborted) return;
            if (!result.ok) {
                setMissing(result.code === 'CHECKOUT_NOT_FOUND');
                setSettled(true);
                return;
            }
            setStatus(result.data);
            const done = result.data.status !== 'open' && result.data.status !== 'creating';
            if (done || attempts >= POLL_ATTEMPTS) {
                setSettled(true);
                return;
            }
            timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        };
        void poll();
        return () => {
            controller.abort();
            if (timer) clearTimeout(timer);
        };
    }, [round]);

    const message = (() => {
        if (missing) return t('support.thanks.missing');
        if (!status) return settled ? t('support.loadFailed') : t('support.thanks.checking');
        const values = { amount: money(status.amountMinor), recipient: status.recipientName };
        if (status.status === 'complete') {
            if (status.paymentStatus === 'failed') return t('support.thanks.failed');
            if (status.mode === 'one-time' && status.paymentStatus !== 'succeeded') {
                return t('support.thanks.pending');
            }
            return status.mode === 'monthly' ?
                    t('support.thanks.confirmedMonthly', values)
                :   t('support.thanks.confirmedOneTime', values);
        }
        if (status.status === 'expired' || status.status === 'failed') return t('support.thanks.failed');
        return settled ? t('support.thanks.waiting') : t('support.thanks.checking');
    })();
    const waiting = settled && status && (status.status === 'open' || status.status === 'creating');

    return (
        <section className='space-y-6'>
            <PageHeader eyebrow={t('support.eyebrow')} title={t('support.thanks.title')} />
            <Surface tone='plain'>
                <p role='status' className='text-base'>{message}</p>
                <div className='mt-4 flex flex-wrap gap-2'>
                    {waiting ? (
                        <Button variant='secondary' size='sm' onClick={() => setRound((value) => value + 1)}>
                            {t('support.thanks.checkAgain')}
                        </Button>
                    ) : null}
                    <ButtonLink variant='neutral' size='sm' href='/settings'>
                        {t('support.thanks.manage')}
                    </ButtonLink>
                </div>
            </Surface>
        </section>
    );
};

export const SupportCancelledRoute = () => {
    const { t } = useLocale();
    return (
        <section className='space-y-6'>
            <PageHeader eyebrow={t('support.eyebrow')} title={t('support.cancelled.title')} />
            <Surface tone='plain'>
                <p className='text-base'>{t('support.cancelled.body')}</p>
                <ButtonLink className='mt-4' variant='secondary' size='sm' href='/support'>
                    {t('support.cancelled.tryAgain')}
                </ButtonLink>
            </Surface>
        </section>
    );
};

/** Settings section listing the signed-in account's own gifts and monthly giving. */
export const SupportingSection = () => {
    const { t, fmt } = useLocale();
    const money = useMoney();
    const [support, setSupport] = useState<AccountSupport>();
    const [loadFailed, setLoadFailed] = useState(false);
    const [portalStatus, setPortalStatus] = useState<string>();
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        void fetchAccountSupportViaApi(controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) setSupport(result.data);
            else setLoadFailed(true);
        });
        return () => controller.abort();
    }, []);

    const openPortal = async () => {
        setOpening(true);
        setPortalStatus(undefined);
        const result = await openSupportPortalViaApi();
        if (!result.ok) {
            setOpening(false);
            setPortalStatus(`${t('common.error')}: ${t('support.account.portalFailed')}`);
            return;
        }
        window.location.assign(result.data.url);
    };

    const statusLabel = (status: string) => t(`support.account.status.${status}`, { defaultValue: status });

    return (
        <Surface as='article' tone='quiet' title={String(t('support.account.title'))}>
            {loadFailed ? <p className='text-sm text-mh-textMuted'>{t('support.account.loadFailed')}</p> : null}
            {support && support.donations.length === 0 && support.subscriptions.length === 0 ? (
                <p className='text-sm text-mh-textMuted'>{t('support.account.empty')}</p>
            ) : null}
            {support && support.subscriptions.length > 0 ? (
                <>
                    <h3 className='mt-2 text-sm font-bold'>{t('support.account.subscriptions')}</h3>
                    <ul className='mt-1 space-y-1 text-sm'>
                        {support.subscriptions.map((subscription) => (
                            <li key={subscription.subscriptionId}>
                                {t('support.monthly.perMonth', { amount: money(subscription.amountMinor) })}
                                {' · '}{t(subscription.nameKey)}{' · '}{subscription.recipientName}
                                {' · '}{statusLabel(subscription.status)}
                                {subscription.currentPeriodEnd && subscription.status !== 'canceled' ? (
                                    <>
                                        {' · '}
                                        {subscription.cancelAtPeriodEnd ?
                                            t('support.account.ends', { date: fmt.shortDate(subscription.currentPeriodEnd) })
                                        :   t('support.account.renews', { date: fmt.shortDate(subscription.currentPeriodEnd) })}
                                    </>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
            {support && support.donations.length > 0 ? (
                <>
                    <h3 className='mt-3 text-sm font-bold'>{t('support.account.gifts')}</h3>
                    <ul className='mt-1 space-y-1 text-sm'>
                        {support.donations.map((donation) => (
                            <li key={donation.donationId}>
                                {money(donation.amountMinor)}{' · '}{donation.recipientName}
                                {' · '}{fmt.shortDate(donation.createdAt)}{' · '}{statusLabel(donation.status)}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
            <div className='mt-3 flex flex-wrap items-center gap-2'>
                {support?.canManage ? (
                    <Button variant='secondary' size='sm' disabled={opening} onClick={() => void openPortal()}>
                        {t('support.account.manage')}
                    </Button>
                ) : null}
                <ButtonLink variant='neutral' size='sm' href='/support'>
                    {t('support.account.give')}
                </ButtonLink>
            </div>
            {support?.canManage ? (
                <p className='mt-2 text-xs text-mh-textMuted'>{t('support.account.manageHelp')}</p>
            ) : null}
            {portalStatus ? <StatusMessage className='mt-2' message={portalStatus} /> : null}
        </Surface>
    );
};
