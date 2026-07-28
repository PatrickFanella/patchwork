# Production alpha-scope UI audit

Date: 2026-07-28

Result: **confirmed defects corrected and accepted on immutable NUC staging**.

## Deployed observation

A manual browser review of `https://patchwork.subcult.tv/` found that the
deployed public home route did not accurately describe the implemented alpha:

- it displayed fabricated activity totals (`127`, `11m`, and `42`);
- it exposed localhost service addresses as if they were useful runtime status;
- it promoted fixture-only Volunteer and Chat routes as primary navigation;
- it claimed that the community network was online without a live status
  source; and
- production Settings rendered fixture preferences, hiding the already
  implemented durable export and account-deactivation paths.

These were release-scope and user-trust defects. They did not indicate that
fixture backend data had entered the durable production query path.

## Correction

The production-data-mode shell now:

- replaces fake activity totals with static, truthful capability statements;
- presents a clear pre-alpha operating boundary and links the community
  guidelines;
- removes localhost addresses and unsupported online-status claims;
- keeps Volunteer and Chat behind the More menu and their existing
  `Deferred from alpha` notice;
- presents Settings as the only account navigation item in production; and
- connects Settings to session-derived `GET /account/export` and
  `POST /account/deactivate`, with no browser-supplied DID, an explicit
  destructive-action confirmation, and session refresh after deactivation.

Fixture development mode retains the broader prototype settings surface for
local design work.

## Verification

- Production-mode Playwright coverage rejects the old fake values, localhost
  addresses, direct deferred-route promotion, and fixture privacy controls.
- The authenticated Settings scenario verifies export, confirmation cancel,
  a CSRF-protected empty-body deactivation command, and transition to
  `Sign in required` after session revocation.
- Settings participates in landmark, image-alternative, axe WCAG 2/2.1/2.2,
  320-pixel reflow, 200% text-sizing, and reduced-motion checks.
- The complete local Chromium gate passes 56 runnable cases with one controlled
  external OAuth/PDS case skipped.
- The final built shell passed semantic and visual browser inspection locally.
- A release built from
  `40f06b65059c3d6f67520c7874458a3ba29a29c9` retained the production `tsx`
  launcher after dependency pruning and all four images passed Trivy with zero
  HIGH/CRITICAL findings before publication.
- Every published digest verified against the retained NUC Cosign public key.
  The exact-digest deployment replayed API/indexer/moderation migrations at
  13/4/3, reached healthy state with zero restarts, passed the API, contracts,
  directory, and content-addressed map probes, and retained
  `995338c584524a84c2365c6a5658a6242399fd10` as the rollback manifest.
- A post-deploy in-app browser inspection confirmed the pre-alpha label,
  capability posture, operating boundary, Settings navigation, and anonymous
  Settings authentication boundary. It found none of the former fake activity
  values, primary Volunteer/Chat links, localhost display, or online claim.

The four deployed digest references are retained in the NUC release manifest
at
`/home/onnwee/.local/share/patchwork/releases/40f06b65059c3d6f67520c7874458a3ba29a29c9/artifact-digests.json`.
A validated 133,707-byte PostgreSQL backup was captured immediately before
deployment with SHA-256
`ab2ed9b39556e4d2f9e4bd9d84874e9fd698ae50fa6c194ff3b90ce149674722`.

This home-staging acceptance is not an independent accessibility review.
