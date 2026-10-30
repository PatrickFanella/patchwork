export interface StripeEvent {
    id: string;
    type: string;
    livemode: boolean;
    /** Unix seconds. */
    created: number;
    account?: string;
    data: { object: Record<string, unknown> };
}

/**
 * Pinned so request and response shapes do not change with the account
 * default. Parsers still accept pre-Basil field locations, because events are
 * rendered with the version in effect when Stripe created them.
 */
export const STRIPE_API_VERSION = '2025-03-31.basil';

export type StripeApiErrorCode =
    | 'NOT_FOUND'
    | 'INVALID_REQUEST'
    | 'CONFLICT'
    | 'UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'UNAVAILABLE'
    | 'INVALID_RESPONSE';

export class StripeApiError extends Error {
    constructor(
        readonly code: StripeApiErrorCode,
        readonly retryable: boolean,
    ) {
        super(`Stripe request failed: ${code}`);
        this.name = 'StripeApiError';
    }
}

export interface StripeCheckoutSession {
    id: string;
    url: string | null;
    status: 'open' | 'complete' | 'expired';
    paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
    mode: 'payment' | 'subscription' | 'setup';
    livemode: boolean;
    customer?: string;
    paymentIntent?: string;
    subscription?: string;
    amountTotal?: number;
    currency?: string;
}

export interface StripeSubscription {
    id: string;
    status: string;
    livemode: boolean;
    customer?: string;
    cancelAtPeriodEnd: boolean;
    /** Unix seconds; read from the subscription item on Basil and later. */
    currentPeriodEnd?: number;
    collectionPaused: boolean;
    metadata: Record<string, string>;
}

export interface StripeCharge {
    id: string;
    paymentIntent?: string;
    refunded: boolean;
}

export interface StripeDispute {
    id: string;
    paymentIntent?: string;
    status: string;
}

export type StripeFormValue =
    | string
    | number
    | boolean
    | undefined
    | StripeFormValue[]
    | { [key: string]: StripeFormValue };

/**
 * The narrow Stripe surface Patchwork uses. Tests substitute a fake; the
 * production adapter calls the REST API directly so no SDK is required.
 */
export interface StripeGateway {
    /** Fetch an event from Stripe rather than trusting a delivered payload. */
    retrieveEvent(eventId: string, accountId?: string): Promise<StripeEvent>;
    createCheckoutSession(
        params: Record<string, StripeFormValue>,
        idempotencyKey: string,
    ): Promise<StripeCheckoutSession>;
    retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession>;
    createMonthlyPrice(
        input: { amountMinor: number; currency: string; productName: string; metadata: Record<string, string> },
        idempotencyKey: string,
    ): Promise<{ id: string }>;
    createBillingPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }>;
    retrieveSubscription(subscriptionId: string): Promise<StripeSubscription>;
    retrieveCharge(chargeId: string): Promise<StripeCharge>;
    retrieveDispute(disputeId: string): Promise<StripeDispute>;
}

const eventIdPattern = /^evt_[A-Za-z0-9]{1,255}$/u;
const accountIdPattern = /^acct_[A-Za-z0-9]{1,255}$/u;
export const stripeIdPatterns = {
    checkoutSession: /^cs_(test|live)_[A-Za-z0-9]{1,255}$/u,
    customer: /^cus_[A-Za-z0-9]{1,255}$/u,
    paymentIntent: /^pi_[A-Za-z0-9]{1,255}$/u,
    subscription: /^sub_[A-Za-z0-9]{1,255}$/u,
    price: /^price_[A-Za-z0-9]{1,255}$/u,
    charge: /^(ch|py)_[A-Za-z0-9]{1,255}$/u,
    dispute: /^(dp|du)_[A-Za-z0-9]{1,255}$/u,
    invoice: /^in_[A-Za-z0-9]{1,255}$/u,
} as const;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value) ?
        (value as Record<string, unknown>)
    :   undefined;

/** Read an expandable reference, which Stripe returns as an ID or an object. */
export const stripeIdOf = (value: unknown, pattern: RegExp): string | undefined => {
    const id = typeof value === 'string' ? value : asRecord(value)?.['id'];
    return typeof id === 'string' && pattern.test(id) ? id : undefined;
};

const invalid = (): never => {
    throw new StripeApiError('INVALID_RESPONSE', false);
};

const parseCheckoutSession = (value: unknown): StripeCheckoutSession => {
    const record = asRecord(value) ?? invalid();
    const id = record['id'];
    const status = record['status'];
    const paymentStatus = record['payment_status'];
    const mode = record['mode'];
    if (
        record['object'] !== 'checkout.session' ||
        typeof id !== 'string' || !stripeIdPatterns.checkoutSession.test(id) ||
        !['open', 'complete', 'expired'].includes(String(status)) ||
        !['paid', 'unpaid', 'no_payment_required'].includes(String(paymentStatus)) ||
        !['payment', 'subscription', 'setup'].includes(String(mode)) ||
        typeof record['livemode'] !== 'boolean'
    ) invalid();
    const url = record['url'];
    const customer = stripeIdOf(record['customer'], stripeIdPatterns.customer);
    const paymentIntent = stripeIdOf(record['payment_intent'], stripeIdPatterns.paymentIntent);
    const subscription = stripeIdOf(record['subscription'], stripeIdPatterns.subscription);
    return {
        id: id as string,
        url: typeof url === 'string' && url.startsWith('https://') ? url : null,
        status: status as StripeCheckoutSession['status'],
        paymentStatus: paymentStatus as StripeCheckoutSession['paymentStatus'],
        mode: mode as StripeCheckoutSession['mode'],
        livemode: record['livemode'] as boolean,
        ...(customer ? { customer } : {}),
        ...(paymentIntent ? { paymentIntent } : {}),
        ...(subscription ? { subscription } : {}),
        ...(Number.isInteger(record['amount_total']) ? { amountTotal: record['amount_total'] as number } : {}),
        ...(typeof record['currency'] === 'string' ? { currency: record['currency'] } : {}),
    };
};

const parseSubscription = (value: unknown): StripeSubscription => {
    const record = asRecord(value) ?? invalid();
    const id = record['id'];
    if (
        record['object'] !== 'subscription' ||
        typeof id !== 'string' || !stripeIdPatterns.subscription.test(id) ||
        typeof record['status'] !== 'string' ||
        typeof record['livemode'] !== 'boolean'
    ) invalid();
    const items = asRecord(record['items'])?.['data'];
    const itemPeriodEnds = Array.isArray(items) ?
        items.map(item => asRecord(item)?.['current_period_end']).filter(Number.isInteger) as number[]
    :   [];
    const legacyPeriodEnd = record['current_period_end'];
    const currentPeriodEnd =
        Number.isInteger(legacyPeriodEnd) ? legacyPeriodEnd as number
        : itemPeriodEnds.length > 0 ? Math.min(...itemPeriodEnds)
        : undefined;
    const metadata: Record<string, string> = {};
    for (const [key, entry] of Object.entries(asRecord(record['metadata']) ?? {})) {
        if (typeof entry === 'string') metadata[key] = entry;
    }
    const customer = stripeIdOf(record['customer'], stripeIdPatterns.customer);
    return {
        id: id as string,
        status: record['status'] as string,
        livemode: record['livemode'] as boolean,
        ...(customer ? { customer } : {}),
        cancelAtPeriodEnd: record['cancel_at_period_end'] === true,
        ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
        collectionPaused: asRecord(record['pause_collection']) !== undefined,
        metadata,
    };
};

const parseCharge = (value: unknown): StripeCharge => {
    const record = asRecord(value) ?? invalid();
    const id = record['id'];
    if (record['object'] !== 'charge' || typeof id !== 'string' || !stripeIdPatterns.charge.test(id)) invalid();
    const paymentIntent = stripeIdOf(record['payment_intent'], stripeIdPatterns.paymentIntent);
    return { id: id as string, ...(paymentIntent ? { paymentIntent } : {}), refunded: record['refunded'] === true };
};

const parseDispute = (value: unknown): StripeDispute => {
    const record = asRecord(value) ?? invalid();
    const id = record['id'];
    if (
        record['object'] !== 'dispute' || typeof id !== 'string' ||
        !stripeIdPatterns.dispute.test(id) || typeof record['status'] !== 'string'
    ) invalid();
    const paymentIntent = stripeIdOf(record['payment_intent'], stripeIdPatterns.paymentIntent);
    return { id: id as string, ...(paymentIntent ? { paymentIntent } : {}), status: record['status'] as string };
};

/** Encode nested parameters the way Stripe's form API expects: a[b][0]=c. */
export const encodeStripeForm = (params: Record<string, StripeFormValue>): URLSearchParams => {
    const form = new URLSearchParams();
    const append = (key: string, value: StripeFormValue): void => {
        if (value === undefined) return;
        if (Array.isArray(value)) {
            value.forEach((entry, index) => append(`${key}[${index}]`, entry));
        } else if (typeof value === 'object') {
            for (const [child, entry] of Object.entries(value)) append(`${key}[${child}]`, entry);
        } else {
            form.append(key, String(value));
        }
    };
    for (const [key, value] of Object.entries(params)) append(key, value);
    return form;
};

export const parseStripeEvent = (value: unknown): StripeEvent => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new StripeApiError('INVALID_RESPONSE', false);
    }
    const record = value as Record<string, unknown>;
    const data = record['data'];
    const object =
        data && typeof data === 'object' && !Array.isArray(data) ?
            (data as Record<string, unknown>)['object']
        :   undefined;
    if (
        record['object'] !== 'event' ||
        typeof record['id'] !== 'string' ||
        !eventIdPattern.test(record['id']) ||
        typeof record['type'] !== 'string' ||
        typeof record['livemode'] !== 'boolean' ||
        typeof record['created'] !== 'number' ||
        !Number.isInteger(record['created']) ||
        (record['account'] !== undefined &&
            record['account'] !== null &&
            (typeof record['account'] !== 'string' ||
                !accountIdPattern.test(record['account']))) ||
        !object ||
        typeof object !== 'object' ||
        Array.isArray(object)
    ) {
        throw new StripeApiError('INVALID_RESPONSE', false);
    }
    return {
        id: record['id'],
        type: record['type'],
        livemode: record['livemode'],
        created: record['created'],
        ...(typeof record['account'] === 'string' ?
            { account: record['account'] }
        :   {}),
        data: { object: object as Record<string, unknown> },
    };
};

export class HttpStripeGateway implements StripeGateway {
    constructor(
        private readonly secretKey: string,
        private readonly options: {
            baseUrl?: string;
            timeoutMs?: number;
            fetch?: typeof fetch;
        } = {},
    ) {}

    async retrieveEvent(eventId: string, accountId?: string): Promise<StripeEvent> {
        if (!eventIdPattern.test(eventId)) {
            throw new StripeApiError('NOT_FOUND', false);
        }
        if (accountId !== undefined && !accountIdPattern.test(accountId)) {
            throw new StripeApiError('NOT_FOUND', false);
        }
        const body = await this.request('GET', `/v1/events/${eventId}`, { accountId });
        return parseStripeEvent(body);
    }

    async createCheckoutSession(
        params: Record<string, StripeFormValue>,
        idempotencyKey: string,
    ): Promise<StripeCheckoutSession> {
        return parseCheckoutSession(await this.request('POST', '/v1/checkout/sessions', {
            form: encodeStripeForm(params),
            idempotencyKey,
        }));
    }

    async retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
        this.requireId(sessionId, stripeIdPatterns.checkoutSession);
        return parseCheckoutSession(await this.request('GET', `/v1/checkout/sessions/${sessionId}`));
    }

    async createMonthlyPrice(
        input: { amountMinor: number; currency: string; productName: string; metadata: Record<string, string> },
        idempotencyKey: string,
    ): Promise<{ id: string }> {
        const body = asRecord(await this.request('POST', '/v1/prices', {
            form: encodeStripeForm({
                currency: input.currency,
                unit_amount: input.amountMinor,
                recurring: { interval: 'month' },
                product_data: { name: input.productName },
                metadata: input.metadata,
            }),
            idempotencyKey,
        }));
        const id = stripeIdOf(body?.['id'], stripeIdPatterns.price);
        if (!id) throw new StripeApiError('INVALID_RESPONSE', false);
        return { id };
    }

    async createBillingPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }> {
        this.requireId(input.customer, stripeIdPatterns.customer);
        const body = asRecord(await this.request('POST', '/v1/billing_portal/sessions', {
            form: encodeStripeForm({ customer: input.customer, return_url: input.returnUrl }),
        }));
        const url = body?.['url'];
        if (typeof url !== 'string' || !url.startsWith('https://')) {
            throw new StripeApiError('INVALID_RESPONSE', false);
        }
        return { url };
    }

    async retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
        this.requireId(subscriptionId, stripeIdPatterns.subscription);
        return parseSubscription(await this.request('GET', `/v1/subscriptions/${subscriptionId}`));
    }

    async retrieveCharge(chargeId: string): Promise<StripeCharge> {
        this.requireId(chargeId, stripeIdPatterns.charge);
        return parseCharge(await this.request('GET', `/v1/charges/${chargeId}`));
    }

    async retrieveDispute(disputeId: string): Promise<StripeDispute> {
        this.requireId(disputeId, stripeIdPatterns.dispute);
        return parseDispute(await this.request('GET', `/v1/disputes/${disputeId}`));
    }

    private requireId(id: string, pattern: RegExp): void {
        if (!pattern.test(id)) throw new StripeApiError('NOT_FOUND', false);
    }

    private async request(
        method: 'GET' | 'POST',
        path: string,
        options: { accountId?: string; form?: URLSearchParams; idempotencyKey?: string } = {},
    ): Promise<unknown> {
        const fetchImpl = this.options.fetch ?? fetch;
        let response: Response;
        try {
            response = await fetchImpl(
                `${this.options.baseUrl ?? 'https://api.stripe.com'}${path}`,
                {
                    method,
                    headers: {
                        authorization: `Bearer ${this.secretKey}`,
                        'stripe-version': STRIPE_API_VERSION,
                        ...(options.accountId ? { 'stripe-account': options.accountId } : {}),
                        ...(options.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
                        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
                    },
                    ...(options.form ? { body: options.form.toString() } : {}),
                    signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
                },
            );
        } catch {
            throw new StripeApiError('UNAVAILABLE', true);
        }
        if (response.status === 404) throw new StripeApiError('NOT_FOUND', false);
        if (response.status === 400 || response.status === 402) {
            throw new StripeApiError('INVALID_REQUEST', false);
        }
        if (response.status === 409) throw new StripeApiError('CONFLICT', true);
        if (response.status === 401 || response.status === 403) {
            // A rotated or under-scoped key is an operator fault; keep retrying
            // so events recover once the key is fixed.
            throw new StripeApiError('UNAUTHORIZED', true);
        }
        if (response.status === 429) throw new StripeApiError('RATE_LIMITED', true);
        if (!response.ok) throw new StripeApiError('UNAVAILABLE', true);
        try {
            return await response.json();
        } catch {
            throw new StripeApiError('INVALID_RESPONSE', true);
        }
    }
}
