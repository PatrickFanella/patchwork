# Privacy Policy

**Effective date:** [DATE]
**Last updated:** [DATE]

---

## 1. Introduction

This Privacy Policy describes how Patchwork ("we", "us", "the platform")
collects, uses, shares, and protects your information when you use our mutual
aid coordination platform. Patchwork is built on the AT Protocol and operates
as a federated service.

We are committed to transparency and to protecting your privacy. This policy
is written in plain language so you can understand exactly what happens with
your data.

## 2. Data We Collect

### 2.1 Account and Identity Data

- **AT Protocol DID** -- your Decentralized Identifier, which serves as your
  unique account identity.
- **Handle** -- your public username on the AT Protocol network.
- **Profile information** -- display name, bio, and any other profile fields
  you choose to fill in.
- **Verification status** -- your current verification tier and associated
  records (see
  [verification appeals](../operations/verification-appeals.md)).

### 2.2 Content Data

- **Aid requests and offers** -- the content of requests and offers you post,
  including category, description, urgency, and status.
- **Messages** -- direct messages and conversation content exchanged through
  the platform's chat features.
- **Feedback** -- post-handoff outcome feedback and reports you submit.

### 2.3 Location Data

- **Approximate location** -- when you enable geo-sharing, we collect location
  data at the precision level you choose (neighbourhood, city, or region).
  Exact coordinates are never exposed publicly; a minimum precision of 1 km is
  enforced (see `PUBLIC_MIN_PRECISION_KM` in the codebase).
- **You may disable geo-sharing entirely** in your privacy settings.

### 2.4 Usage and Technical Data

- **Log data** -- server logs that may include IP addresses, request
  timestamps, and browser/device information.
- **Moderation records** -- reports, moderation actions, and audit trail
  entries associated with your content or account.

## 3. How We Use Your Data

We use your data for the following purposes:

| Purpose                        | Data Used                                  |
| ------------------------------ | ------------------------------------------ |
| **Matching and discovery**     | Aid requests, location, profile, categories|
| **Moderation and safety**      | Content, reports, audit trail, identity     |
| **Platform operation**         | Account data, technical logs               |
| **Communication**              | Messages, notifications, contact preferences|
| **Platform improvement**       | Aggregated and anonymised usage data       |
| **Verification**               | Identity, profile, verification records    |

We do **not** sell your data. We do **not** use your data for advertising. We
do **not** build behavioural profiles for marketing purposes.

## 4. Data Sharing

### 4.1 AT Protocol Federation

Patchwork operates on the AT Protocol, which is a federated network. Content
you publish (aid requests, offers, profile information) is made available to
other services on the AT Protocol network. Federated data is subject to the
privacy policies of those receiving services.

### 4.2 Moderator Access

Moderators and Trust & Safety team members have access to reported content,
moderation audit trails, and limited account information as required to
perform their duties. Moderator actions are logged in an immutable audit
trail. See [Moderation SOPs](../operations/moderation-sops.md) for details.

### 4.3 Legal Requirements

We may disclose your information if required by law, regulation, legal
process, or governmental request.

### 4.4 Third-Party Services

Patchwork may integrate with third-party services for infrastructure,
monitoring, or operational purposes. Any such services are bound by data
processing agreements. We do not share personal data with third parties for
their own independent use.

## 5. Data Retention

We retain your data only as long as necessary for the purposes described in
this policy:

| Data Type             | Retention Period                             |
| --------------------- | -------------------------------------------- |
| Account and profile   | Until you deactivate your account            |
| Aid requests/offers   | Until you delete them, or account deactivation|
| Messages              | Until you delete them, or account deactivation|
| Moderation audit logs | 7 days from creation (aligned with `MODERATION_LOG_RETENTION_DAYS`)|
| Server/technical logs | 30 days                                      |
| Verification records  | Duration of verification tier validity        |

Moderation audit logs follow a 7-day retention window as defined in the
platform's privacy module. This retention period may change; any changes will
be documented in this policy and the
[policy changelog](./changelog.md).

## 6. Your Rights

You have the following rights regarding your data:

### 6.1 Access

You may request a copy of the personal data we hold about you. The Settings
page provides a data export function.

### 6.2 Deletion

You may request deletion of your account and associated data. Deletion
requests are processed through the Settings page (account deactivation) or by
contacting us directly.

Some data may be retained after deletion where required for:

- Moderation audit trail integrity (within the retention window).
- Legal compliance obligations.

### 6.3 Correction

You may update or correct your profile information at any time through the
platform.

### 6.4 Data Portability

You may export your data in a machine-readable format using the data export
function in Settings. Exported data includes your profile, aid requests,
offers, and messages.

### 6.5 Withdraw Consent

Where processing is based on consent (such as geo-sharing), you may withdraw
consent at any time through your privacy settings.

### 6.6 Object to Processing

You may object to certain processing activities by contacting us. We will
review your request and cease processing unless we have compelling legitimate
grounds.

## 7. Cookies and Local Storage

Patchwork uses local storage and session storage in your browser for:

- **Authentication state** -- keeping you signed in.
- **User preferences** -- your privacy settings, notification preferences, and
  UI state.
- **Offline queue** -- pending actions stored locally for offline sync.

We do not use third-party tracking cookies. We do not use analytics cookies
that track you across websites.

## 8. Data Security

We implement appropriate technical and organisational measures to protect your
data, including:

- Sensitive identifiers (DIDs, AT URIs) are redacted in public diagnostic and
  log views.
- Exact geo coordinates are not exposed in public API responses or map
  markers.
- Moderation and ingestion logs follow a short retention window.
- Secrets rotation procedures are documented in
  [secrets rotation](../operations/secrets-rotation.md).

No system is perfectly secure. If you discover a security vulnerability,
please report it to [SECURITY_CONTACT_EMAIL].

## 9. Children's Privacy

Patchwork is not intended for users under the age of 16. We do not knowingly
collect data from children. If you believe a child under 16 has provided data
to us, please contact us and we will delete it.

## 10. International Data Transfers

If you access Patchwork from outside [JURISDICTION], your data may be
transferred to and processed in [JURISDICTION]. By using the platform you
consent to this transfer. We ensure appropriate safeguards are in place for
international transfers.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be
communicated through the platform at least 30 days before taking effect. All
changes are recorded in the [policy changelog](./changelog.md).

## 12. Contact

For questions about this Privacy Policy or to exercise your data rights,
contact:

- **Email:** [PRIVACY_CONTACT_EMAIL]
- **AT Protocol handle:** [HANDLE]

For privacy-related complaints, you may also contact your local data
protection authority.

---

*See also: [Terms of Service](./terms-of-service.md) |
[Community Guidelines](./community-guidelines.md) |
[Acceptable Use Policy](./acceptable-use-policy.md) |
[Policy Changelog](./changelog.md)*
