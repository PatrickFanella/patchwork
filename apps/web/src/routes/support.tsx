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
    fetchOrganizationPaymentsViaApi,
    fetchSupportCheckoutViaApi,
    fetchSupportOptionsViaApi,
    openSupportPortalViaApi,
    startOrganizationOnboardingViaApi,
    fetchPublicSupportersViaApi,
    fetchSupporterBadgesViaApi,
    updateSupportRecognitionViaApi,
    fetchModeratedPaymentRecipientsViaApi,
    moderatePaymentRecipientViaApi,
    type ModeratedPaymentRecipient,
    type SupporterRecognition,
    type AccountSupport,
    type OrganizationPayments,
    type SupportCheckoutRequest,
    type SupportRecipient,
    type SupportCheckoutStatus,
    type SupportOptions,
} from '../features/api-client';
import { useLocale } from '../i18n';
import { AccountName } from '../features/identity/AccountName';
import { useHandles } from '../features/identity/useHandles';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';

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

/** DIDs (from the given list) that currently show a supporter badge. */
export const useSupporterBadges = (dids: readonly string[]): ReadonlySet<string> => {
    const key = [...new Set(dids)].sort().join(' ');
    const [holders, setHolders] = useState<ReadonlySet<string>>(new Set());
    useEffect(() => {
        const requested = key ? key.split(' ') : [];
        if (requested.length === 0) {
            setHolders(new Set());
            return;
        }
        const controller = new AbortController();
        void fetchSupporterBadgesViaApi(requested, controller.signal).then((result) => {
            if (!controller.signal.aborted) setHolders(new Set(result.ok ? result.data : []));
        });
        return () => controller.abort();
    }, [key]);
    return holders;
};

export const SupporterBadge = () => {
    const { t } = useLocale();
    return <Badge tone='success'>{t('support.badge')}</Badge>;
};

const PublicSupporters = () => {
    const { t } = useLocale();
    const [dids, setDids] = useState<string[]>([]);
    useEffect(() => {
        const controller = new AbortController();
        void fetchPublicSupportersViaApi(controller.signal).then((result) => {
            if (!controller.signal.aborted && result.ok) setDids(result.data);
        });
        return () => controller.abort();
    }, []);
    const handles = useHandles(dids);
    if (dids.length === 0) return null;
    return (
        <Surface title={t('support.supporters.title')} description={t('support.supporters.help')}>
            <ul className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                {dids.map((did) => (
                    <li key={did}><AccountName did={did} handles={handles} /></li>
                ))}
            </ul>
        </Surface>
    );
};

/** Load giving options once; undefined while loading, null when unavailable. */
export const useSupportOptions = (): { options: SupportOptions | undefined; loadFailed: boolean } => {
    const [options, setOptions] = useState<SupportOptions>();
    const [loadFailed, setLoadFailed] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        void fetchSupportOptionsViaApi(controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) setOptions(result.data);
            else setLoadFailed(true);
        });
        return () => controller.abort();
    }, []);
    return { options, loadFailed };
};

/** One-time or monthly gift to a single recipient, ending in Stripe Checkout. */
const GivingForm = ({
    options,
    recipient,
    idPrefix,
}: {
    options: SupportOptions;
    recipient: SupportRecipient;
    idPrefix: string;
}) => {
    const { t } = useLocale();
    const money = useMoney();
    const [mode, setMode] = useState<'one-time' | 'monthly'>('one-time');
    const [amountText, setAmountText] = useState('25');
    const [amountError, setAmountError] = useState<string>();
    const checkout = useCheckout();

    const limits = { min: money(options.oneTime.minMinor), max: money(options.oneTime.maxMinor) };
    const amountMinor = parseDollarsToMinor(amountText);
    const amountValid =
        amountMinor !== undefined &&
        amountMinor >= options.oneTime.minMinor &&
        amountMinor <= options.oneTime.maxMinor;
    const amountId = `${idPrefix}-amount`;

    const submitOneTime = () => {
        if (!amountValid) {
            setAmountError(String(t('support.oneTime.invalidAmount', limits)));
            return;
        }
        setAmountError(undefined);
        void checkout.start({ recipient, mode: 'one-time', amountMinor: amountMinor! });
    };

    return (
        <div className='space-y-4'>
            {options.mode === 'test' ? <Banner tone='warning'>{t('support.testMode')}</Banner> : null}
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
                    <label className='block text-sm font-bold' htmlFor={amountId}>
                        {t('support.oneTime.amountLabel')}
                    </label>
                    <input
                        id={amountId}
                        className='mh-input w-full max-w-xs px-3 py-2'
                        inputMode='decimal'
                        autoComplete='off'
                        value={amountText}
                        aria-describedby={`${amountId}-hint`}
                        aria-invalid={amountError ? true : undefined}
                        onChange={(event) => setAmountText(event.target.value)}
                    />
                    <p id={`${amountId}-hint`} className='text-xs text-mh-textMuted'>
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
                                        onClick={() => void checkout.start({ recipient, mode: 'monthly', tierKey: tier.key })}
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
        </div>
    );
};

export const SupportRoute = () => {
    const { t } = useLocale();
    const { options, loadFailed } = useSupportOptions();

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

    return (
        <section className='space-y-6'>
            {header}
            <Surface title={t('support.mode.label')}>
                <div className='space-y-3'>
                    <GivingForm options={options} recipient='general-fund' idPrefix='support' />
                    <ReceiptNotice options={options} />
                </div>
            </Surface>
            <PublicSupporters />
        </section>
    );
};

/**
 * Donate control on an organization card. The gift goes directly to the
 * organization's own Stripe account; Patchwork makes no tax claim for it.
 */
export const OrganizationDonate = ({
    organizationId,
    organizationName,
    options,
}: {
    organizationId: string;
    organizationName: string;
    options: SupportOptions;
}) => {
    const { t } = useLocale();
    const [open, setOpen] = useState(false);
    const panelId = `donate-${organizationId}`;
    return (
        <div className='mt-3'>
            <Button
                size='sm'
                variant={open ? 'neutral' : 'primary'}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
            >
                {open ? t('support.organization.close') : t('support.organization.donate')}
            </Button>
            {open ? (
                <div id={panelId} className='mt-3 space-y-3' role='group' aria-label={String(t('support.organization.label', { name: organizationName }))}>
                    <p className='text-sm'>{t('support.organization.direct', { name: organizationName })}</p>
                    <p className='text-sm text-mh-textMuted'>{t('support.boundary')}</p>
                    <GivingForm options={options} recipient={{ organizationId }} idPrefix={panelId} />
                </div>
            ) : null}
        </div>
    );
};

const formatMonth = (month: string, locale: string): string => {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
};

/** Stripe onboarding status and giving totals for organization owners and admins. */
export const OrganizationPaymentsPanel = ({ organizationId }: { organizationId: string }) => {
    const { t, locale } = useLocale();
    const money = useMoney();
    const [payments, setPayments] = useState<OrganizationPayments>();
    const [statusMessage, setStatusMessage] = useState<string>();
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setPayments(undefined);
        setStatusMessage(undefined);
        void fetchOrganizationPaymentsViaApi(organizationId, controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) setPayments(result.data);
            else setStatusMessage(`${t('common.error')}: ${t('support.payments.loadFailed')}`);
        });
        return () => controller.abort();
    }, [organizationId, t]);

    const startOnboarding = async () => {
        setStarting(true);
        setStatusMessage(undefined);
        const result = await startOrganizationOnboardingViaApi(organizationId);
        if (!result.ok) {
            setStarting(false);
            setStatusMessage(`${t('common.error')}: ${
                result.code === 'ORGANIZATION_NOT_VERIFIED' ? t('support.payments.needsVerification')
                : result.code === 'ORGANIZATION_PAYMENTS_UNAVAILABLE' ? t('support.payments.unavailable')
                : result.code === 'PAYMENT_RECIPIENT_SUSPENDED' ? t('support.payments.suspended')
                : t('support.payments.stripeFailed')
            }`);
            return;
        }
        window.location.assign(result.data.url);
    };

    const stateText = !payments ? undefined
        : payments.status === 'suspended' ? t('support.payments.suspended')
        : !payments.verified ? t('support.payments.needsVerification')
        : payments.status === 'not-started' ? t('support.payments.notStarted')
        : !payments.chargesEnabled ? t('support.payments.onboarding')
        : payments.eligible ? t('support.payments.active')
        : t('support.payments.unavailable');
    const canOnboard = payments && payments.verified && payments.status !== 'suspended' && !payments.chargesEnabled;

    return (
        <Surface as='article' tone='quiet' title={String(t('support.payments.title'))}>
            <p className='text-sm text-mh-textMuted'>{t('support.payments.help')}</p>
            {stateText ? <p className='mt-2 text-sm font-bold' role='status'>{stateText}</p> : null}
            {payments?.chargesEnabled && !payments.payoutsEnabled ? (
                <p className='mt-1 text-sm'>{t('support.payments.payoutsPending')}</p>
            ) : null}
            <div className='mt-3 flex flex-wrap gap-2'>
                {canOnboard ? (
                    <Button size='sm' disabled={starting} onClick={() => void startOnboarding()}>
                        {payments.status === 'not-started' ? t('support.payments.start') : t('support.payments.continue')}
                    </Button>
                ) : null}
                {payments?.dashboardUrl ? (
                    <ButtonLink variant='secondary' size='sm' href={payments.dashboardUrl} target='_blank' rel='noreferrer'>
                        {t('support.payments.dashboard')}
                    </ButtonLink>
                ) : null}
            </div>
            {payments && payments.status !== 'not-started' ? (
                <div className='mt-3 text-sm'>
                    <p>{t('support.payments.monthly', {
                        count: payments.activeMonthlySupporters,
                        amount: money(payments.monthlyRecurringMinor),
                    })}</p>
                    {payments.months.length ? (
                        <ul className='mt-1 space-y-1'>
                            {payments.months.map((month) => (
                                <li key={month.month}>
                                    {t('support.payments.month', {
                                        month: formatMonth(month.month, locale),
                                        count: month.giftCount,
                                        amount: money(month.giftTotalMinor),
                                    })}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className='mt-1 text-mh-textMuted'>{t('support.payments.noGifts')}</p>
                    )}
                </div>
            ) : null}
            {payments && payments.status !== 'not-started' ? (
                <NamedSupporters dids={payments.namedSupporterDids} />
            ) : null}
            {statusMessage ? <StatusMessage className='mt-2' message={statusMessage} /> : null}
        </Surface>
    );
};

const NamedSupporters = ({ dids }: { dids: string[] }) => {
    const { t } = useLocale();
    const handles = useHandles(dids);
    return (
        <p className='mt-2 text-sm'>
            {dids.length === 0 ?
                t('support.payments.namedNone')
            :   t('support.payments.named', {
                    names: dids.map((did) => (handles[did] ? `@${handles[did]}` : did)).join(', '),
                })}
        </p>
    );
};

const RecognitionSettings = ({
    initial,
    isSupporter,
}: {
    initial: SupporterRecognition;
    isSupporter: boolean;
}) => {
    const { t } = useLocale();
    const [value, setValue] = useState(initial);
    const [status, setStatus] = useState<string>();
    const [saving, setSaving] = useState(false);
    const save = async () => {
        setSaving(true);
        setStatus(undefined);
        const result = await updateSupportRecognitionViaApi(value);
        setSaving(false);
        if (!result.ok) {
            setStatus(`${t('common.error')}: ${t('support.recognition.failed')}`);
            return;
        }
        setValue(result.data);
        setStatus(String(t('support.recognition.saved')));
    };
    const settings = [
        ['badgeVisible', 'support.recognition.badge'],
        ['listedPublicly', 'support.recognition.listed'],
        ['shareNameWithRecipient', 'support.recognition.share'],
    ] as const;
    return (
        <fieldset className='mt-4'>
            <legend className='text-sm font-bold'>{t('support.recognition.title')}</legend>
            <p className='text-xs text-mh-textMuted'>{t('support.recognition.help')}</p>
            {!isSupporter ? <p className='mt-1 text-xs text-mh-textMuted'>{t('support.recognition.notActive')}</p> : null}
            <div className='mt-2 space-y-1'>
                {settings.map(([key, label]) => (
                    <label key={key} className='flex items-start gap-2 text-sm'>
                        <input
                            type='checkbox'
                            className='mt-1'
                            checked={value[key]}
                            onChange={(event) => setValue((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        {t(label)}
                    </label>
                ))}
            </div>
            <div className='mt-2 flex items-center gap-3'>
                <Button size='sm' variant='secondary' disabled={saving} onClick={() => void save()}>
                    {t('support.recognition.save')}
                </Button>
                {status ? <StatusMessage message={status} /> : null}
            </div>
        </fieldset>
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

    const openPortal = async (recipientId: string) => {
        setOpening(true);
        setPortalStatus(undefined);
        const result = await openSupportPortalViaApi(recipientId);
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
                {support?.manageable.map((recipient) => (
                    <Button
                        key={recipient.recipientId}
                        variant='secondary'
                        size='sm'
                        disabled={opening}
                        onClick={() => void openPortal(recipient.recipientId)}
                    >
                        {support.manageable.length > 1 ?
                            t('support.account.manageFor', { name: recipient.recipientName })
                        :   t('support.account.manage')}
                    </Button>
                ))}
                <ButtonLink variant='neutral' size='sm' href='/support'>
                    {t('support.account.give')}
                </ButtonLink>
            </div>
            {support?.manageable.length ? (
                <p className='mt-2 text-xs text-mh-textMuted'>{t('support.account.manageHelp')}</p>
            ) : null}
            {portalStatus ? <StatusMessage className='mt-2' message={portalStatus} /> : null}
            {support ? (
                <RecognitionSettings initial={support.recognition} isSupporter={support.isSupporter} />
            ) : null}
        </Surface>
    );
};

/** Shown in the deactivation confirmation: monthly gifts that will stop. */
export const DeactivationGiftsNotice = () => {
    const { t, fmt } = useLocale();
    const money = useMoney();
    const [gifts, setGifts] = useState<AccountSupport['subscriptions']>([]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchAccountSupportViaApi(controller.signal).then((result) => {
            if (controller.signal.aborted || !result.ok) return;
            setGifts(result.data.subscriptions.filter((subscription) =>
                !subscription.cancelAtPeriodEnd
                && !['canceled', 'incomplete_expired'].includes(subscription.status)));
        });
        return () => controller.abort();
    }, []);

    if (gifts.length === 0) return null;
    return (
        <div className='mt-2 text-xs'>
            <p className='font-bold'>{t('support.deactivation.title', { count: gifts.length })}</p>
            <ul className='mt-1 list-disc pl-4'>
                {gifts.map((gift) => (
                    <li key={gift.subscriptionId}>
                        {t('support.monthly.perMonth', { amount: money(gift.amountMinor) })}{' · '}{gift.recipientName}
                        {gift.currentPeriodEnd ?
                            <>{' · '}{t('support.deactivation.lastPeriod', { date: fmt.shortDate(gift.currentPeriodEnd) })}</>
                        :   null}
                    </li>
                ))}
            </ul>
            <p className='mt-1'>{t('support.deactivation.help')}</p>
        </div>
    );
};

/** Moderator switch for organization fundraising. */
export const PaymentRecipientModeration = () => {
    const { t, fmt } = useLocale();
    const [recipients, setRecipients] = useState<ModeratedPaymentRecipient[]>();
    const [unavailable, setUnavailable] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState<string>();
    const [statusMessage, setStatusMessage] = useState<string>();

    useEffect(() => {
        const controller = new AbortController();
        void fetchModeratedPaymentRecipientsViaApi(controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) setRecipients(result.data);
            else setUnavailable(true);
        });
        return () => controller.abort();
    }, []);

    const act = async (action: 'suspend' | 'restore', recipient: ModeratedPaymentRecipient) => {
        if (!reason.trim()) {
            setStatusMessage(String(t('support.moderation.reasonRequired')));
            return;
        }
        setBusy(recipient.recipientId);
        setStatusMessage(undefined);
        const result = await moderatePaymentRecipientViaApi(action, recipient.recipientId, reason.trim());
        setBusy(undefined);
        if (!result.ok) {
            setStatusMessage(`${t('common.error')}: ${t('support.moderation.failed')}`);
            return;
        }
        setRecipients((current) => current?.map((row) =>
            row.recipientId === result.data.recipientId ? result.data : row));
        setReason('');
        setStatusMessage(String(t(action === 'suspend' ? 'support.moderation.suspended' : 'support.moderation.restored', {
            name: result.data.displayName,
        })));
    };

    const statusLabel = (status: ModeratedPaymentRecipient['status']) => t(`support.moderation.status.${status}`);

    return (
        <Surface title={t('support.moderation.title')}>
            <p className='text-sm text-mh-textMuted'>{t('support.moderation.help')}</p>
            {unavailable ? <p className='mt-2 text-sm'>{t('support.moderation.unavailable')}</p> : null}
            {recipients && recipients.length === 0 ? (
                <p className='mt-2 text-sm'>{t('support.moderation.empty')}</p>
            ) : null}
            {recipients && recipients.length > 0 ? (
                <>
                    <label className='mt-3 block text-sm font-bold'>
                        {t('support.moderation.reason')}
                        <Input value={reason} maxLength={2_000} onChange={(event) => setReason(event.target.value)} />
                    </label>
                    <ul className='mt-3 space-y-2 text-sm'>
                        {recipients.map((recipient) => (
                            <li key={recipient.recipientId} className='border-2 border-mh-border p-2'>
                                <p className='font-bold'>{recipient.displayName}</p>
                                <p>
                                    {statusLabel(recipient.status)}{' · '}
                                    {t('support.moderation.monthlyGifts', { count: recipient.activeMonthlyGifts })}{' · '}
                                    {t('support.moderation.updated', { date: fmt.shortDate(recipient.updatedAt) })}
                                </p>
                                {recipient.suspensionReason ? (
                                    <p className='text-mh-textMuted'>
                                        {t('support.moderation.currentReason', { reason: recipient.suspensionReason })}
                                    </p>
                                ) : null}
                                <div className='mt-2'>
                                    {recipient.status === 'suspended' ? (
                                        <Button size='sm' variant='secondary' disabled={busy !== undefined}
                                            onClick={() => void act('restore', recipient)}>
                                            {t('support.moderation.restore', { name: recipient.displayName })}
                                        </Button>
                                    ) : (
                                        <Button size='sm' variant='danger' disabled={busy !== undefined}
                                            onClick={() => void act('suspend', recipient)}>
                                            {t('support.moderation.suspend', { name: recipient.displayName })}
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
            {statusMessage ? <StatusMessage className='mt-2' message={statusMessage} /> : null}
        </Surface>
    );
};
