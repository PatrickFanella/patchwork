import {
    StripeApiError,
    type StripeAccountScope,
    type StripeCharge,
    type StripeCheckoutSession,
    type StripeConnectedAccount,
    type StripeDispute,
    type StripeEvent,
    type StripeFormValue,
    type StripeGateway,
    type StripeSubscription,
} from '../stripe-gateway.js';

/**
 * In-memory Stripe for tests. Objects are stored per account, so a lookup
 * made against the wrong account fails the same way Stripe does.
 */
export class FakeStripe implements StripeGateway {
    private readonly objects = new Map<string, unknown>();
    events = new Map<string, StripeEvent>();
    accounts = new Map<string, StripeConnectedAccount>();
    checkoutCalls: Array<{
        params: Record<string, StripeFormValue>;
        idempotencyKey: string;
        accountId?: string;
    }> = [];
    priceCalls: Array<{ idempotencyKey: string; accountId?: string }> = [];
    pauseCalls: Array<{ subscriptionId: string; idempotencyKey: string; accountId: string }> = [];
    accountCalls: Array<{ businessName: string; idempotencyKey: string }> = [];
    linkCalls: Array<{ accountId: string; refreshUrl: string; returnUrl: string }> = [];
    failNextCheckout = false;
    failPauses = false;
    private sequence = 0;

    private key(kind: string, id: string, scope: StripeAccountScope = {}): string {
        return `${scope.accountId ?? 'platform'}:${kind}:${id}`;
    }

    private find<T>(kind: string, id: string, scope?: StripeAccountScope): T {
        const found = this.objects.get(this.key(kind, id, scope));
        if (!found) throw new StripeApiError('NOT_FOUND', false);
        return found as T;
    }

    setSession(session: StripeCheckoutSession, scope?: StripeAccountScope): void {
        this.objects.set(this.key('session', session.id, scope), session);
    }

    session(id: string, scope?: StripeAccountScope): StripeCheckoutSession {
        return this.find('session', id, scope);
    }

    sessionByUrl(url: string): { session: StripeCheckoutSession; scope: StripeAccountScope } {
        for (const [key, value] of this.objects) {
            const session = value as StripeCheckoutSession;
            if (key.includes(':session:') && session.url === url) {
                const account = key.split(':')[0]!;
                return { session, scope: account === 'platform' ? {} : { accountId: account } };
            }
        }
        throw new Error(`No fake session for ${url}`);
    }

    setSubscription(subscription: StripeSubscription, scope?: StripeAccountScope): void {
        this.objects.set(this.key('subscription', subscription.id, scope), subscription);
    }

    setCharge(charge: StripeCharge, scope?: StripeAccountScope): void {
        this.objects.set(this.key('charge', charge.id, scope), charge);
    }

    setDispute(dispute: StripeDispute, scope?: StripeAccountScope): void {
        this.objects.set(this.key('dispute', dispute.id, scope), dispute);
    }

    async retrieveEvent(eventId: string, accountId?: string): Promise<StripeEvent> {
        const event = this.events.get(eventId);
        if (!event || (event.account ?? undefined) !== accountId) {
            throw new StripeApiError('NOT_FOUND', false);
        }
        return event;
    }

    async createCheckoutSession(
        params: Record<string, StripeFormValue>,
        idempotencyKey: string,
        scope: StripeAccountScope = {},
    ): Promise<StripeCheckoutSession> {
        this.checkoutCalls.push({ params, idempotencyKey, ...(scope.accountId ? { accountId: scope.accountId } : {}) });
        if (this.failNextCheckout) {
            this.failNextCheckout = false;
            throw new StripeApiError('UNAVAILABLE', true);
        }
        const id = `cs_test_${idempotencyKey.replace(/[^A-Za-z0-9]/gu, '')}`;
        const existing = this.objects.get(this.key('session', id, scope));
        if (existing) return existing as StripeCheckoutSession;
        const session: StripeCheckoutSession = {
            id,
            url: `https://checkout.stripe.test/${(this.sequence += 1)}`,
            status: 'open',
            paymentStatus: 'unpaid',
            mode: params['mode'] === 'subscription' ? 'subscription' : 'payment',
            livemode: false,
        };
        this.setSession(session, scope);
        return session;
    }

    async retrieveCheckoutSession(sessionId: string, scope?: StripeAccountScope): Promise<StripeCheckoutSession> {
        return this.find('session', sessionId, scope);
    }

    async createMonthlyPrice(
        _input: unknown,
        idempotencyKey: string,
        scope: StripeAccountScope = {},
    ): Promise<{ id: string }> {
        this.priceCalls.push({ idempotencyKey, ...(scope.accountId ? { accountId: scope.accountId } : {}) });
        return { id: `price_${idempotencyKey.replace(/[^A-Za-z0-9]/gu, '').slice(-24)}` };
    }

    async createBillingPortalSession(
        input: { customer: string; returnUrl: string },
        scope: StripeAccountScope = {},
    ): Promise<{ url: string }> {
        const account = scope.accountId ? `${scope.accountId}/` : '';
        return { url: `https://billing.stripe.test/${account}${input.customer}?return=${encodeURIComponent(input.returnUrl)}` };
    }

    async retrieveSubscription(id: string, scope?: StripeAccountScope): Promise<StripeSubscription> {
        return this.find('subscription', id, scope);
    }

    async pauseSubscriptionCollection(
        subscriptionId: string,
        idempotencyKey: string,
        scope: Required<StripeAccountScope>,
    ): Promise<StripeSubscription> {
        this.pauseCalls.push({ subscriptionId, idempotencyKey, accountId: scope.accountId });
        if (this.failPauses) throw new StripeApiError('UNAVAILABLE', true);
        const subscription = this.find<StripeSubscription>('subscription', subscriptionId, scope);
        const paused = { ...subscription, collectionPaused: true };
        this.setSubscription(paused, scope);
        return paused;
    }

    async retrieveCharge(id: string, scope?: StripeAccountScope): Promise<StripeCharge> {
        return this.find('charge', id, scope);
    }

    async retrieveDispute(id: string, scope?: StripeAccountScope): Promise<StripeDispute> {
        return this.find('dispute', id, scope);
    }

    async createConnectedAccount(
        input: { businessName: string; metadata: Record<string, string> },
        idempotencyKey: string,
    ): Promise<StripeConnectedAccount> {
        this.accountCalls.push({ businessName: input.businessName, idempotencyKey });
        const id = `acct_${idempotencyKey.replace(/[^A-Za-z0-9]/gu, '').slice(-20)}`;
        const account = this.accounts.get(id) ?? {
            id, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false,
        };
        this.accounts.set(id, account);
        return account;
    }

    async retrieveConnectedAccount(accountId: string): Promise<StripeConnectedAccount> {
        const account = this.accounts.get(accountId);
        if (!account) throw new StripeApiError('NOT_FOUND', false);
        return account;
    }

    async createAccountOnboardingLink(input: {
        accountId: string;
        refreshUrl: string;
        returnUrl: string;
    }): Promise<{ url: string }> {
        this.linkCalls.push(input);
        return { url: `https://connect.stripe.test/setup/${input.accountId}` };
    }
}
