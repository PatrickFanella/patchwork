# Stripe sandbox run for donations and supporter tiers

Date: 2026-10-31. Branch `feat/donations-tiered-subscriptions` (plan step 6).

## Setup

- **Stripe account:** "Patchwork sandbox", `acct_1UWgfzEzMmTYc5v3`, US, test mode only. The secret key stayed in a private file and was never logged or committed.
- **Organization stand-in:** the sandbox's existing test connected account `acct_1UWgkyEzMmYN8LQ2`, which has the full Dashboard and charges enabled, played an organization that had finished onboarding.
- **Customer Portal:** a default configuration, `bpc_1UWgvIEzMmTYc5v3iHrHIGg0`, was created for this run. It allows cancellation at period end, payment method updates and invoice history.
- **Local stack:**
  - The API ran from the branch with `PATCHWORK_PAYMENTS_MODE=test`, against a disposable PostgreSQL 16 with every API, indexer and moderation-worker migration applied.
  - Stripe CLI 1.55.6 (`stripe listen`) forwarded the 16 subscribed event types to both webhook endpoints. The sandbox delivers events under API version `2026-10-28.endive`, and the API re-fetches each one under its pinned `2025-03-31.basil`.
  - No indexer ran; a stand-in heartbeat row satisfied the API's startup check.
- **Test users:** a donor, a moderator and an organization owner were signed in through browser-session rows with policy consent. No AT Protocol login was involved.
- **Payments:** a Playwright script paid on the real Stripe-hosted Checkout page with Stripe test cards.

## Results

| Scenario | Result |
|---|---|
| A. Signed-in one-time gift, $25, to the general fund | Checkout `complete`, gift `succeeded`, receipt notice queued. |
| B. Signed-in monthly gift, tier 1 ($5), to the general fund | Subscription `active` locally and in Stripe at 500/month; receipt from `invoice.paid`. |
| C. Guest one-time gift, $10, to the organization | The PaymentIntent exists only on the connected account (direct charge) and has no application fee; no donor identity stored. |
| D. Signed-in monthly gift, tier 2 ($15), to the organization | Subscription `active` on the connected account, using the Price Patchwork created there on first use. |
| E. Failed renewal | A renewal forced onto a declining card moved the gift to `past_due` and queued the failed-payment notice. Paying the open invoice with a working card returned it to `active`. |
| F. Full refund of the gift from A | `charge.refunded` marked it `refunded`. |
| G. Dispute (test card `4000000000000259`) | It failed at first, then passed after the fix described below. |
| H. Tier price change | After a new tier 1 version at $7, the offered tier and new Checkout line were 700, and the existing subscription stayed at 500. |
| I. Moderator suspension | New organization checkout returned `409 RECIPIENT_UNAVAILABLE`. The sweep paused the monthly gift (`pause_collection=void` in Stripe, `recipient-suspended` locally) and notified the donor. Restoring set the recipient back to `active` and left the gift paused. |
| J. Onboarding a second verified organization | Created a connected account with the full Dashboard, `fees.payer=account` and `losses.payments=stripe`, and returned a `connect.stripe.com` Account Link. The first organization's panel showed one monthly supporter, $15 a month and $10 in October one-time gifts. |
| K. Customer Portal and export | The portal opened on `billing.stripe.com`. The export listed 3 gifts and 2 monthly gifts and contained no Stripe identifiers. |
| M. Donor deactivation | Two cancellation commands were queued and sent. Both subscriptions show `cancel_at_period_end=true` in Stripe and locally, and no payment row still names the donor. |

Across the run, 23 webhook events were applied (16 platform, 7 Connect). None were retried or dead-lettered, and there were no signature failures.

## Defect found and fixed

The dispute test card disputes the charge immediately. Its `charge.dispute.created` event (18:37:49) was older than `checkout.session.completed` (18:37:50). Because the sweep applies events in creation order, the dispute was processed before the gift existed and changed nothing. The gift was then recorded as succeeded.

Migration `0044_payment_charge_states.sql` keeps refund and dispute state by PaymentIntent. Refund and dispute events record it whether or not the gift exists yet, and recording a gift applies it. Such a gift gets no receipt notice. A PostgreSQL test covers a dispute and a refund that both arrive before completion, and a dispute later closing in the organization's favour. After the fix, the same sandbox flow recorded the gift as `disputed`.

## Not covered

- **Onboarding forms:** completing Stripe's hosted onboarding forms. Only creating the account and the link was tested.
- **Production webhook endpoints:** registering webhook endpoints in the Dashboard. The run used `stripe listen`.
- **Live mode:** no live-mode calls were made. Live mode still waits on the legal review in plan step 0.
- **Malformed session tokens:** a request with an unknown bearer token returns 500 instead of 401 on authenticated routes such as `/account/export`. This was found during setup, predates this branch, and is unchanged.
