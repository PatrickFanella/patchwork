# Buyer-ready Phase 1 identity and consent evidence

Date: 2026-07-28

Scope: Phase 1 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 1 is complete at the repository and local durable-runtime boundary.

- The managed-PDS adapter validates signup inputs and returned DIDs, rejects
  browser-supplied identity, role, verification, and origin, applies the
  dedicated signup limiter, and maps PDS failures without returning tokens or
  unsafe upstream details.
- Signup requires the current policy version, the complete five-document
  policy set, and an affirmative 18+ assertion. It then directs the new account
  through the existing OAuth/session path rather than inventing a browser DID.
- Policy acceptance is versioned and durable. A session without the current
  version is blocked from protected API and production-web actions until every
  document and the age assertion are renewed.
- Privacy, notification-channel, profile-visibility, language,
  approximate-or-hidden location, and no-permanent-address preferences persist
  in PostgreSQL with a private change audit. Exact personal location is rejected.
- Account export includes policy consent and current preferences. Deactivation
  deletes consent, preferences, and their audit along with the previously
  covered Patchwork state.
- The UI states that the AT identity is user-owned and federated. It does not
  claim that Patchwork can delete the independent PDS repository or that
  recovery email is operationally configured.

If the post-PDS local consent write fails, signup does not falsely roll back the
already-created user-owned identity. The failure emits a PII-free operational
event and the same fail-closed onboarding gate requires consent again after
OAuth.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 230, API 271 plus 41 environment skips, indexer 35 plus 16 skips, moderation 53 plus 11 skips, AT client 24, lexicons 3, shared 316 |
| API PostgreSQL integration | 35 passed across 7 files |
| Web direct service integration | 9 passed |
| `npm run build` | Passed |
| Web Chromium E2E | 58 passed, 1 credential-gated live-PDS journey skipped |
| `npm run test:coverage` | 932 passed, 68 environment-gated tests skipped; 57.01% statements, 46.11% branches, 50.38% functions, 58.15% lines |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

Migration `0014_account_onboarding.sql` was applied to the local PostgreSQL
acceptance database. Direct integration proved missing/current/stale consent,
restart survival, preference audit, exact-location rejection, subject-isolated
export, and deactivation removal.

The browser gate used the existing Playwright-managed Chrome-for-Testing 151
binary through `PATCHWORK_E2E_CHROMIUM_EXECUTABLE`. One local retry is allowed
for the constrained Vite/Chromium acceptance host; a prior run produced a
transient completely blank navigation, while the complete recorded gate passed
without a product assertion failure.

## External and operational boundary

The real PDS/OAuth adapters remain externally integrated from earlier
controlled evidence, but this phase did not consume a fresh managed-signup
invite or exercise recovery email. Those require external PDS credentials and
operations and are not represented as newly verified here.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. This phase
does not approve public availability, refresh launch evidence, or make later
buyer-ready subsystems operational.
