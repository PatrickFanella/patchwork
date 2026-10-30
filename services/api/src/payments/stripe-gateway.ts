export interface StripeEvent {
    id: string;
    type: string;
    livemode: boolean;
    /** Unix seconds. */
    created: number;
    account?: string;
    data: { object: Record<string, unknown> };
}

export type StripeApiErrorCode =
    | 'NOT_FOUND'
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

/**
 * The narrow Stripe surface Patchwork uses. Tests substitute a fake; the
 * production adapter calls the REST API directly so no SDK is required.
 */
export interface StripeGateway {
    /** Fetch an event from Stripe rather than trusting a delivered payload. */
    retrieveEvent(eventId: string, accountId?: string): Promise<StripeEvent>;
}

const eventIdPattern = /^evt_[A-Za-z0-9]{1,255}$/u;
const accountIdPattern = /^acct_[A-Za-z0-9]{1,255}$/u;

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
        const body = await this.get(`/v1/events/${eventId}`, accountId);
        return parseStripeEvent(body);
    }

    private async get(path: string, accountId?: string): Promise<unknown> {
        const fetchImpl = this.options.fetch ?? fetch;
        let response: Response;
        try {
            response = await fetchImpl(
                `${this.options.baseUrl ?? 'https://api.stripe.com'}${path}`,
                {
                    method: 'GET',
                    headers: {
                        authorization: `Bearer ${this.secretKey}`,
                        ...(accountId ? { 'stripe-account': accountId } : {}),
                    },
                    signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
                },
            );
        } catch {
            throw new StripeApiError('UNAVAILABLE', true);
        }
        if (response.status === 404) throw new StripeApiError('NOT_FOUND', false);
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
