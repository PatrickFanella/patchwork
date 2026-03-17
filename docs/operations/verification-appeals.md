# Verification Appeals and Escalation Process

## Overview

This document describes the process for volunteers and organisations to appeal
verification decisions and the escalation path when standard procedures cannot
resolve a case.

## Verification Tiers

| Tier           | Description                                      | Expiry  |
| -------------- | ------------------------------------------------ | ------- |
| unverified     | Default state; no checks completed               | Never   |
| basic          | Email verified, profile completed                | 365 days |
| verified       | Identity check, safety training, community ref   | 180 days |
| trusted        | Long-standing verified volunteer, strong record  | 365 days |
| org_verified   | Partner organisation with verified identity      | 365 days |

## Appeal Process

### Who Can Appeal

Any user whose current tier is below `org_verified` may submit an appeal
requesting an upgrade to a higher tier.

### Step-by-Step

1. **Submit appeal** -- The user navigates to their verification status page
   and selects "Appeal tier decision." They specify the requested tier and
   provide a written reason (10--2000 characters).

2. **Acknowledgement** -- The system immediately creates an appeal record with
   status `pending` and returns a confirmation containing the appeal ID.

3. **Initial review** -- Within **3 business days**, a member of the Trust &
   Safety team reviews the appeal. If additional information is needed the
   appeal moves to `under_review` and the user is notified.

4. **Decision** -- The reviewer either:
   - **Approves** the appeal and upgrades the user's tier (creating a `grant`
     audit entry).
   - **Denies** the appeal with a written reason (the user's tier remains
     unchanged).

5. **Notification** -- The user receives a notification with the outcome and
   any relevant notes.

### Timeline Expectations

| Stage                | Target SLA        |
| -------------------- | ----------------- |
| Acknowledgement      | Immediate         |
| Initial review       | 3 business days   |
| Information request  | +5 business days  |
| Final decision       | 10 business days  |

## Escalation Path

If a user disagrees with the appeal decision they may escalate:

1. **First escalation** -- The user replies to the appeal notification
   requesting escalation. A senior Trust & Safety reviewer is assigned.
   Target resolution: **5 business days**.

2. **Second escalation** -- If the first escalation does not resolve the
   matter, the case is forwarded to the Platform Governance Board.
   Target resolution: **15 business days**.

3. **Final decision** -- The Governance Board's decision is final. The
   outcome is recorded in the audit trail with action `escalate`.

## Decision Criteria

Reviewers evaluate appeals against the published tier criteria (see
`TIER_DEFINITIONS` in the codebase). Key factors:

- Have all automated checkpoints for the requested tier been satisfied?
- Have all manual checkpoints been completed and approved?
- Is the user's moderation record clear?
- Does the user meet minimum tenure requirements (where applicable)?
- For organisation tiers: is a signed partner agreement on file?

## Revocation and Renewal

- **Revocation**: An admin may revoke a user's tier at any time for policy
  violations. A `revoke` audit entry is created. The user may appeal the
  revocation using the standard appeal process.

- **Renewal**: Tiers with expiry dates must be renewed before they lapse.
  Users receive a reminder when their verification is within 30 days of
  expiry. Renewal follows the same checkpoint validation as the original
  grant but does not require a full re-review unless the tier criteria have
  changed.

## Audit Trail

Every verification action (grant, revoke, renew, appeal, escalate) creates
an immutable audit record containing:

- Action type
- Actor DID (who performed the action)
- Timestamp
- Reason / notes
- Previous tier
- New tier

The full audit trail for any subject is available via the
`GET /verification/audit?did=...` endpoint.
