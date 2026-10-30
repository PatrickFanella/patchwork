# Donations and supporter tiers

A visitor can give once or monthly. They choose the recipient: the Patchwork general fund, which Subcult spends at its discretion, or a specific verified organization. Monthly giving uses one platform-wide tier ladder for every recipient. Tiers give recognition only: an opt-in supporter badge and an opt-in supporters list. No Patchwork feature depends on paying, and amounts are never shown publicly.

Stripe processes all payments. Patchwork never sees card data and never holds an organization's money.

## Decisions

These were settled on 2026-10-30:

- **Organization payouts:** Stripe Connect. Each organization onboards its own connected account and donations settle to that account.
- **General fund status:** not yet known. Ship with non-deductible wording and a configuration switch for charitable receipts.
- **Subscription scope:** one tier ladder; the donor picks the recipient of each subscription.
- **Tier perks:** recognition only.

Defaults this plan assumes. Change them before step 1 if they are wrong:

- **Charge type for organizations: direct charges.** The organization is the merchant of record. Its name appears on the donor's statement, it issues its own receipts and it handles its own refunds and disputes. The connected account is configured so that Stripe and the organization, not Subcult, carry negative-balance losses. Destination charges would make Subcult the merchant of record and liable for organization chargebacks, so they are not used. Step 0 must confirm the current Stripe account configuration (controller properties versus Express or Standard) supports direct charges and Billing subscriptions on connected accounts.
- **No platform fee.** `application_fee_amount` and `application_fee_percent` are 0. Stripe's processing fee is the only deduction.
- **USD only.** One-time gifts are $1–$10,000. Subscriptions use tier prices only; custom recurring amounts are deferred.
- **No account required to give.** Guests can complete Checkout. Recognition, the Supporting settings page and export need a signed-in account.
- **Mobile links out.** The mobile app opens the web support page in the system browser. App-store rules for donations to the developer versus registered nonprofits must be checked before any in-app flow.

## Recipients and eligibility

There are two recipient kinds:

- `general-fund`: the Patchwork general fund, charged on Subcult's platform Stripe account.
- `organization`: one organization, charged on its connected account.

An organization can receive donations only while all of these hold:

1. It has an `approved`, unexpired `organization` verification application. This uses the existing `verification_applications` table and its annual expiry.
2. An active owner or admin completed Connect onboarding, and the latest `account.updated` event reports `charges_enabled`.
3. A moderator has not suspended its payment recipient record.
4. Its `origin` is not `synthetic`. Synthetic showcase organizations never show a Donate button.

When verification expires or is revoked, or a moderator suspends the recipient, Patchwork hides the Donate button, rejects new Checkout sessions and sets `pause_collection` on that organization's active subscriptions. The existing durable notification outbox notifies affected donors. Restoring eligibility does not resume paused subscriptions automatically; donors resume them in the Stripe Customer Portal. Resuming them in bulk is a separate decision.

## Tiers

One ladder lives in the database, so changing it needs no deploy. The names and amounts below are placeholders for the owner to replace:

| Key | Name | Monthly |
|---|---|---|
| `tier-1` | Neighbor | $5 |
| `tier-2` | Block | $15 |
| `tier-3` | Patch | $40 |

Tiers are versioned. A Stripe Price amount never changes after creation; changing a tier's amount retires the old Price and creates a new one. Existing subscribers keep their old Price until they change plan in the Customer Portal. General-fund Prices exist on the platform account. Organization Prices are created on each connected account the first time someone subscribes to that organization at that tier, and their IDs are stored.

## Data model

Add one migration, `0040_donations_and_supporter_tiers.sql`, with these tables:

- `payment_recipients`: `recipient_id`, `kind`, nullable `organization_id` (unique), `stripe_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`, `status` (`onboarding`, `active`, `suspended`), suspension reason and moderator DID, timestamps. A seeded row represents the general fund.
- `supporter_tiers` and `supporter_tier_versions`: key, localized name and description keys, `amount_minor`, `currency`, `active`, sort order.
- `supporter_tier_prices`: `(tier_version_id, recipient_id) → stripe_price_id`.
- `donor_accounts`: nullable `donor_did` (unique when present), `stripe_customer_id` per Stripe account. The donor's email and card stay in Stripe and are not copied.
- `donations`: one-time gifts. Checkout session ID, payment intent ID, recipient, `amount_minor`, currency, nullable donor DID, status (`pending`, `succeeded`, `failed`, `refunded`, `disputed`), timestamps.
- `supporter_subscriptions`: Stripe subscription ID, recipient, tier version, nullable donor DID, status mirrored from Stripe, `current_period_end`, `cancel_at_period_end`, `paused_reason`.
- `supporter_recognition`: `donor_did`, `badge_visible`, `listed_publicly`, `share_name_with_recipient`. All default to false.
- `payment_webhook_events`: Stripe event ID (primary key), source (`platform` or `connect`), account ID, type, received and processed timestamps, and a processing error. The table stores only the IDs needed for reprocessing, not raw payloads.
- `payment_audit_events`: onboarding, suspension, tier changes and refunds, following the `organization_audit_events` pattern.

Badge state is a server-side projection. It is not written as an AT Protocol record, so it disappears immediately when a subscription lapses, the donor opts out or the account is deactivated.

## API

New handlers follow the existing router, CSRF and idempotent-mutation patterns:

- `GET /support/tiers`: the active ladder, public.
- `GET /support/recipients/:organizationId`: whether an organization can receive donations, public. It does not disclose why an organization is ineligible.
- `POST /support/checkout`: authenticated or guest, idempotent and rate-limited. The body is `{ recipient, mode: 'one-time' | 'monthly', amountMinor?, tierKey? }`. The handler rechecks eligibility, creates a Checkout session on the correct account and returns its URL. This handler is the only place amounts and recipients are validated; client values are never trusted.
- `POST /support/portal`: authenticated. Returns a Customer Portal URL for each Stripe account where the donor has a customer.
- `GET /account/support` and `PUT /account/support/recognition`: the donor's own gifts and subscriptions, and their recognition toggles.
- `POST /organizations/:id/payments/onboarding`: owner or admin. Creates or reuses the connected account and returns an Account Link URL.
- `GET /organizations/:id/payments`: owner or admin. Onboarding state, a Stripe dashboard login link, and aggregate counts and totals by month. Donor names appear only when the donor turned on `share_name_with_recipient`.
- `POST /moderation/payment-recipients/:id/suspend` and `/restore`: capability-gated, audited, require a reason.
- `POST /internal/payments/stripe/webhook` and `POST /internal/payments/stripe/connect-webhook`: one endpoint per signing secret.

The webhook handlers need a new `readRawBody`, because the existing `readJsonBody` parses the body and Stripe's signature check needs the exact bytes. Each event is inserted into `payment_webhook_events` with `ON CONFLICT DO NOTHING`, and a duplicate returns 200 without reprocessing. Handlers re-fetch the object from Stripe instead of trusting event ordering. They cover `checkout.session.completed`, `checkout.session.async_payment_*`, `payment_intent.*`, `charge.refunded`, `charge.dispute.*`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` and `account.updated`.

Configuration, all off by default:

- `PATCHWORK_PAYMENTS_MODE`: `off`, `test` or `live`. Production refuses `live` unless all secrets are present.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`. These come from the existing secret store; they are never committed or logged.
- `PATCHWORK_GENERAL_FUND_RECEIPT_MODE`: `non-deductible` (default) or `charitable`. `charitable` requires `PATCHWORK_GENERAL_FUND_LEGAL_NAME` and `PATCHWORK_GENERAL_FUND_EIN`, and switches receipt and page wording to a tax acknowledgement stating that no goods or services were provided.

## Web

English and Spanish strings:

- `/support`: general-fund one-time form and tier cards, with the receipt-mode wording. In `non-deductible` mode it says contributions to Patchwork are not tax-deductible.
- Organization profile: a Donate button only for eligible recipients. The dialog offers one-time or a tier and states: "Your gift goes directly to <organization>. Patchwork does not decide whether it is tax-deductible."
- `/support/thanks` and `/support/cancelled` return pages. The thanks page reads status from the API, not from query parameters.
- Settings → Supporting: gifts, subscriptions, Manage in Stripe links, and the three recognition toggles.
- Organization management: a Payments panel for onboarding status and totals.
- The supporter badge in profile views when `badge_visible` is on and an active subscription exists.
- An opt-in supporters list on `/support` that shows handles only, without tiers or amounts.

## Privacy, safety and moderation

- Export includes the account's own gifts, subscriptions and recognition settings. It excludes Stripe customer IDs and other donors' information.
- Deactivation first shows active subscriptions, then sets them to cancel at period end and removes recognition. It redacts the donor DID on retained `donations` rows. Payment records are kept for the accounting retention period, which the owner must set; the plan assumes 7 years. The privacy policy must state this period.
- Notifications use the existing outbox. Templates cover receipt, failed payment, subscription ending and organization no longer receiving donations. External push payloads omit amounts and recipient names, and the in-app body may show them.
- Reports of fraudulent fundraising go through the existing report flow. The moderator suspension switch is the response.
- Card testing protection: rate-limit `POST /support/checkout` per IP and per account, enforce the minimum amount and rely on Stripe Radar.
- Prometheus: webhook failures, unprocessed events older than 15 minutes, signature failures and Checkout creation errors, with alert rules beside the existing notification alerts.

## Implementation and verification

0. **Decisions and legal review.** Before any live code ships, confirm the Stripe Connect configuration and the direct charges plus Billing behavior on connected accounts in current Stripe documentation. Counsel reviews state charitable-solicitation registration for the general fund and for platform-facilitated organization fundraising, the general fund's tax status, refund policy and record retention. Update the privacy policy, terms of service and acceptable use policy. The owner finalizes tier names and amounts. Live mode cannot be enabled until this step is complete.
1. **Schema, Stripe adapter and webhooks.** Add the migration, a thin Stripe client interface behind which tests use fakes, `readRawBody`, both webhook endpoints, idempotent event recording and configuration validation. PostgreSQL tests: duplicate and out-of-order events, refetch on conflicting state, signature rejection and replay after restart.
2. **General fund.** Add one-time and tier Checkout, the Customer Portal, `/support`, return pages, the Supporting settings page and receipt-mode wording. Unit tests cover amount and recipient validation. Chromium tests cover both modes with Checkout mocked at the HTTP boundary.
3. **Organizations.** Add Connect onboarding, eligibility, lazy per-account Prices, the Donate dialog and Payments panel, and the hooks into verification expiry and revocation that pause collection. PostgreSQL tests: ineligible organizations at each condition, role checks on onboarding, synthetic organizations, pause on revoke and the scheduler-driven expiry path.
4. **Recognition.** Add the toggles, badge projection and supporters list. Tests prove nothing is shown without opt-in and that the badge disappears when a subscription lapses.
5. **Lifecycle.** Add export, deactivation, retention, notification templates, moderator suspension, metrics and alerts. Tests follow the existing export and deactivation suites.
6. **End-to-end in Stripe test mode.** Run against a real Stripe test account with the Stripe CLI forwarding webhooks: one-time and monthly gifts to the general fund and to a test connected account, a failed renewal, a refund, a dispute, a tier price change and suspension. Record the evidence under `docs/operations/evidence/`.
7. Run focused tests, workspace typecheck and build, full unit, PostgreSQL and browser suites, operations and documentation checks. Publish a PR and wait for hosted checks.

## Rollout and rollback

Apply the migration before the matching API. Ship with `PATCHWORK_PAYMENTS_MODE=off`, enable `test` in staging, and enable `live` only after step 0 sign-off. Patchwork is still a development preview that is not approved to operate publicly, so live mode belongs to the launch gate, not this change.

To roll back, set `PATCHWORK_PAYMENTS_MODE=off`. This hides every Donate entry point and rejects new Checkout sessions. Webhook endpoints keep accepting events so that renewals, refunds and disputes on existing subscriptions are still recorded. Do not drop payment tables or cancel subscriptions during a rollback; those are separate, explicit owner decisions.

## Open questions

- Whether Subcult or a fiscal sponsor receives the general fund, which decides the receipt mode and legal name.
- Whether to keep the 0% platform fee permanently.
- Refund window for general-fund gifts. Organizations set their own.
- Whether paused organization subscriptions resume automatically when eligibility returns.
- Whether to allow custom recurring amounts besides the tier ladder.
- Whether currencies other than USD are needed.

## Step 1 record

Step 1 adds migration `0040_donations_and_supporter_tiers.sql` with every table in the data model, plus a seeded general-fund recipient. Organization and donor references are nullable and never cascade. Owner deactivation can delete an organization, so recipients keep a display-name snapshot and move to `closed`. Payment configuration is validated as a set: test and live modes require a key of the matching kind, and live mode requires `NODE_ENV=production`. Charitable receipts require a legal name and EIN.

The webhook endpoints, signature check, Stripe REST adapter, idempotent event table, re-fetching sweep, metrics, alerts and runbook entry are in place. No Stripe SDK was added. The adapter does not pin a Stripe API version, so fetched events use the account default; step 2 should pin one before parsing Checkout and subscription objects. No event processors exist yet, so recorded events are marked `ignored`. Step 2 adds processors, which only apply events received after they are deployed. Before step 2 is enabled, requeue or ignore any events received earlier.

Local verification on 2026-10-30: `npm run check` passed, with 1,099 unit tests and the operations checks. `npm run test:integration` passed all 211 PostgreSQL tests against a disposable PostgreSQL 16 with a clean replay of all migrations. The new PostgreSQL tests cover duplicate delivery, creation-order application, Connect account fetches, mismatched fetched events, processor rollback and backoff, Stripe outages, missing events, retry exhaustion, requeue, restart replay, abandoned-lock recovery and concurrent sweeps. No real Stripe account was contacted; step 6 covers that.

