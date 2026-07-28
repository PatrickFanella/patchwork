# Production alpha-scope UI audit

Date: 2026-07-28

Result: **confirmed defects corrected locally; immutable staging deployment
acceptance pending**.

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

This evidence is not a substitute for the post-deploy immutable acceptance
check or an independent accessibility review.
