# Buyer-ready Phase 7 moderation and maintenance evidence

Date: 2026-07-28  
Verified revision: `e14cc6a6` plus the coordination-harness correction in the
next documentation commit.

## Implemented boundary

- Public aid-post, directory-resource, and volunteer-profile creates and
  updates pass strict lexicon parsing and the durable moderation service before
  any PDS mutation. Only an explicit `accepted` decision continues.
- Deterministic checks cover length, required public fields, U.S. service-area
  bounds (including Alaska and Hawaii), minimum one-kilometre public precision,
  emergency intent, prohibited content, sensitive personal data, embedded
  files, and ownership plus clean-scan state for referenced private
  attachments. The existing authenticated API perimeter supplies the bounded
  rate limit before the internal review call.
- Uncertain/high-risk content is durably quarantined with a stable user-safe
  reason, suspended projection visibility, a privacy-safe preview, and no raw
  submission body. Automation providers are replaceable; failure or malformed
  response publishes nothing.
- Urgent holds create deduplicated durable events. The notification sweep fans
  each event to configured moderator/admin in-app and enabled external
  channels exactly once across restart.
- `/moderation` is no longer a production fixture. It requires
  `moderate:content`, provides queue/status/priority/appeal/type filters, safe
  previews, one-action quarantine, delist/restore, appeal decisions, audit
  history, and links to the existing verification, exact-address, and private
  attachment controls. It displays the required two-business-day best-effort
  wording and retains the operational emergency-response NO-GO.
- Durable maintenance mode accepts only the declared privacy, authorization,
  abuse, integrity, moderation-backlog, monitoring, and backup reasons. It
  blocks all new submissions and exact-location exchange, preserves `/status`
  and safe reads, and requires an audited moderator resume. An environment
  override cannot be cleared from the browser.
- Review, urgent-event, and maintenance-audit rows carry explicit retention
  deadlines. Account deactivation pseudonymizes actor DIDs and shortens those
  deadlines. Retention schedulers delete elapsed rows transactionally.

## Verification

All commands used `NODE_ENV=test`; PostgreSQL checks used a fresh
`patchwork_phase7_20260728` database migrated from zero.

| Gate | Result |
| --- | --- |
| Fresh migrations | API 21, indexer 5, moderation 4; clean replay covered |
| Lint and typecheck | All workspaces passed |
| Unit and PostgreSQL suites | Web 237; API 372 plus 1 environment skip; indexer 52; moderation 71; AT client 26; lexicons 5; shared 322; map and exact-location absence passed |
| API PostgreSQL integration | 64 passed |
| Web service integration | 8 passed |
| Production build | All workspaces passed |
| New moderation browser suite | 2 passed: authorized workflow and access denial |
| Full browser suite | 71 passed, 1 credentialed external journey skipped; one coordination harness assertion failed because anonymous `/status` has no POST body, then passed after the harness accepted bodyless GET requests |
| Coverage | 981 passed, 105 environment skips; 46.23% statements, 36.25% branches, 41.00% functions, 47.11% lines |
| Prometheus rules | `promtool check rules` passed, 18 rules |
| Dependency audit | Production and full trees: 0 vulnerabilities |

The browser artifacts are subject to the repository redaction gate at the
feature-completion phase. No staging alert-delivery, credentialed signup, legal
approval, independent accessibility approval, or production-launch
certification is claimed here.

## Operational status

Phase 7’s software exit criterion is satisfied locally: unsafe content cannot
bypass the production publication path, moderator actions and appeals are
durable/audited, and maintenance fails closed in API and browser tests.
Patchwork remains an operational **NO-GO** for emergency response, guaranteed
fulfillment, or launch until the separately owned external gates are approved.
