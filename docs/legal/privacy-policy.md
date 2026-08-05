# Privacy Policy

> **Unapproved draft — not in force.** Patchwork is `NO-GO` and has no approved
> public service. Described user-rights workflows such as export, account
> deactivation, correction, and consent controls are commitments that must be
> implemented and legally approved before this document can become effective.

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
- **Offers and coordination state** -- offers, accept/decline state,
  connections, scheduling windows, activity-inbox events, and structured
  outcome feedback.
- **Groups and chat** -- group membership, roles, rooms, invitation lifecycle,
  and bounded message history for active authorized scopes. Message text is
  readable by Patchwork's server and is not end-to-end encrypted. Conversation
  lists and external notifications do not include message text.
- **Private attachments** -- files you deliberately attach for an allowed
  verification or request purpose, plus scan, transformation, access, and
  deletion metadata. File bodies are held in private object storage, not in
  public AT records.
- **Feedback** -- post-handoff outcome feedback and reports you submit.

### 2.3 Location Data

- **Approximate personal location** -- when you enable geo-sharing, public
  records enforce a minimum precision of 1 km.
- **Ephemeral exact personal location** -- after both participants in an
  active connection consent, browsers may exchange an exact coordinate over
  an encrypted peer data channel. Patchwork signaling does not contain the
  coordinate, and Patchwork does not persist it or provide a server fallback.
- **Approved public-resource address** -- a verified organization may request
  a separate moderator approval for a non-confidential facility address.
  Approved addresses are intentionally public until approval expires or is
  revoked.
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
| **Communication**              | Workflow notifications and contact preferences|
| **Platform improvement**       | Aggregated and anonymised usage data       |
| **Verification**               | Identity, profile, verification records    |

We do **not** sell your data. We do **not** use your data for advertising. We
do **not** build behavioural profiles for marketing purposes.

## 4. Data Sharing

### 4.1 AT Protocol Federation

Patchwork operates on the AT Protocol, which is a federated network. Public AT
records you publish (aid requests, volunteer profiles, and directory
resources) are available to other services on the AT Protocol network.
Private offers, connections, evidence, and attachments are not published as
AT records. Group state, schedules, and chat messages also remain private
PostgreSQL state rather than AT records. Federated data is subject to the
privacy policies of receiving services.

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

Private attachments are sent to configured object-storage, malware-scanning,
and supported file-transformation services. If you opt in, email and browser
push providers receive the minimum delivery payload. External notification
payloads exclude exact location, private evidence, private contact details,
and attachment bodies.

## 5. Data Retention

We retain your data only as long as necessary for the purposes described in
this policy:

| Data Type             | Retention Period                             |
| --------------------- | -------------------------------------------- |
| Patchwork account/session data | Until deactivation; a hash-only suppression marker remains while the account is deactivated |
| Patchwork aid-post projections and workflows | Until deletion or account deactivation |
| Offers, connections, schedules, inbox items, and outcomes | Until deletion, policy expiry, or account deactivation, subject to bounded safety retention |
| Groups, memberships, rooms, and invitations | Until departure, removal, closure, invitation expiry, account deactivation, or the applicable bounded retention deadline |
| Chat messages and conversation state | Up to 365 days; sender redaction is available for 24 hours and deactivation redacts authored text |
| Chat abuse-report evidence | Digest, character count, identifiers, and timestamps only; 30 days, with no stored message body in the evidence record |
| Private attachments | Until content deletion, account deactivation, purpose expiry, or moderator removal |
| Notifications and delivery records | Until archive, channel cleanup, policy expiry, or account deactivation |
| Verification evidence metadata | Through the decision/appeal period and bounded policy retention; file bodies follow attachment deletion |
| Independently hosted AT records | Controlled by the user's PDS and AT repository, not Patchwork deactivation |
| Moderation audit logs and resolved casework | 7 days from the policy decision |
| Server/technical logs | 30 days                                      |
| Verification records  | Duration of verification tier validity        |

The PostgreSQL moderation runtime assigns an explicit seven-day expiry to every
policy audit and resolved case. A new report or appeal reopens the case and
clears its case-expiry deadline. The worker enforces elapsed deadlines hourly;
active queued casework is never removed by age alone. This retention period may
change only through a migration, runtime policy update, and documentation in
this policy and the
[policy changelog](./changelog.md).

## 6. Your Rights

You have the following rights regarding your data:

### 6.1 Access

You may request a copy of the personal data Patchwork holds about you. The
Settings page provides a machine-readable export derived from your
authenticated session. It excludes credentials, internal security payloads,
third-party moderation casework, and a complete copy of your independently
portable AT repository.

### 6.2 Deletion

You may deactivate your Patchwork account through the Settings page. The
authenticated command immediately revokes Patchwork browser and OAuth sessions,
removes Patchwork discovery projections and owned workflow state, and prevents
future event replay or login from recreating them. It does not delete records
from an independently hosted AT Protocol repository; those remain under the
user's PDS controls.

Some data may be retained after deletion where required for:

- Moderation audit trail integrity (within the retention window).
- Legal compliance obligations.
- Pseudonymized operational audit data for no more than 30 days.
- A hash-only suppression marker while the account remains deactivated, used to
  prevent silent account or projection resurrection. Controlled reactivation
  removes this marker after identity and safety review.
- The final deactivation command receipt for up to seven days so retries return
  a stable result; it contains a request hash and response counts, not the
  submitted body or credential material.

Safety blocks, reports, and related moderator attribution involving a
deactivated account are stripped of free-text details or pseudonymized and
retained for no more than seven days. Reactivation is not automatic and requires
a controlled support and safety review.

### 6.3 Correction

You may update or correct your profile information at any time through the
platform.

### 6.4 Data Portability

You may export Patchwork-held data in a machine-readable format using the data
export function in Settings. The export includes account metadata and durable
data owned by or addressed to you: public profiles and projections,
organization/verification state, workflows, offers, connections, inbox items,
outcomes, notifications, and safe attachment metadata. It never includes file
bodies, signed object URLs, credentials, private third-party casework, or exact
personal coordinates.

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
- **UI state** -- non-sensitive route and presentation preferences.

We do not use third-party tracking cookies. We do not use analytics cookies
that track you across websites.

## 8. Data Security

We implement appropriate technical and organisational measures to protect your
data, including:

- Sensitive identifiers (DIDs, AT URIs) are redacted in public diagnostic and
  log views.
- Exact personal coordinates are not exposed in public API responses or map
  markers. A separately approved, non-confidential public-resource address is
  intentionally public while its approval is active.
- Moderation and ingestion logs follow a short retention window.
- Secrets rotation procedures are documented in
  [secrets rotation](../operations/secrets-rotation.md).

No system is perfectly secure. If you discover a security vulnerability,
please report it to [SECURITY_CONTACT_EMAIL].

## 9. Children's Privacy

Patchwork is not intended for users under the age of 18. We do not knowingly
collect data from children. If you believe a child under 18 has provided data
to us, please contact us and we will delete it.

## 10. Showcase Data

Synthetic records are generated from fictional identities and non-routable
contact data. Public-source organization references include provenance,
retrieval/verification dates, and a non-participation disclosure. Server-owned
origin labels keep these records separate from visitor-created content during
refresh, moderation, export, and deletion.

## 11. International Data Transfers

If you access Patchwork from outside [JURISDICTION], your data may be
transferred to and processed in [JURISDICTION]. By using the platform you
consent to this transfer. We ensure appropriate safeguards are in place for
international transfers.

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be
communicated through the platform at least 30 days before taking effect. All
changes are recorded in the [policy changelog](./changelog.md).

## 13. Contact

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
