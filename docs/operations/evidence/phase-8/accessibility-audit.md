# Local WCAG 2.2 AA accessibility audit

Date: 2026-07-28

Scope: production-mode home, map, feed, posting, resources, volunteer,
organizations, verification, inbox, notifications, moderation, chat, settings,
login, and three legal-policy routes, plus the previously recorded manual
public-route review of the deployed home-staging web application.

Result: **no locally detected launch-blocking violation; independent review
still required**.

## Automated evidence

`@axe-core/playwright` is a committed browser dependency. Each included route
is scanned without exclusions or impact filtering using WCAG 2 A/AA, 2.1
A/AA, and 2.2 AA rule tags.

One cross-route reflow case renders every route at 320 CSS pixels and proves
that document content does not create page-level horizontal scrolling. A
second cross-route case applies 200% root text sizing with
`prefers-reduced-motion: reduce`, proves that page-level horizontal overflow
does not appear, and verifies that animation and transition duration collapse
to the reduced-motion budget. A focused Phase 8 accessibility/presentation run
passed 70 cases before the three legal-policy routes were added. The
superseding complete production-mode Chromium run passed 96 runnable cases
with one credentialed external journey skipped; all eighteen unfiltered axe
route scans passed.

Playwright now starts Patchwork on the dedicated strict port `41739` with
server reuse disabled. During this audit, the former port-5173 configuration
reused an unrelated Roberts Rules development server; a failure screenshot
exposed the mismatch. Results from that run were discarded. Current runs keep
the same isolated server boundary.

The repository, disposable PostgreSQL, service-integration, build, coverage,
and complete Chromium counts change as the feature program advances. The
Phase 9 feature-completion evidence is the authoritative final gate rather than
these earlier audit-era totals.

## Manual repository/browser review

| Area | Evidence | Result |
| --- | --- | --- |
| Keyboard | Skip link is first, navigation/buttons are keyboard-operable, Escape dismisses overlays | Pass locally |
| Focus | Visible `focus-visible` ring, main target, trap/restore helpers, disabled controls excluded | Pass locally |
| Names and labels | Native labels, `aria-describedby`, invalid/required state, named actions | Pass locally |
| Structure | Main/navigation landmarks, articles, named regions, route headings | Pass locally |
| Dynamic state | Polite/assertive announcers, status and alert roles, loading live regions | Pass locally |
| Contrast | axe route scans include applicable WCAG contrast rules | No detected violation |
| Motion | `prefers-reduced-motion` disables animation and transition duration | Pass in Chromium |
| Reflow | All included routes at 320 CSS pixels and at 200% text sizing | Pass in Chromium |
| Account controls | Export and deactivation have named controls, busy/error status, and an explicit confirmation dialog | Pass in Chromium |
| Offline/stale state | Offline is announced, mutations are explicitly not queued, retained data is labeled potentially stale, and retry remains available | Pass in Chromium |
| Policy routes | 18+, no-chat, location, attachment, best-effort review, draft, and NO-GO boundaries are readable without authentication | Pass in Chromium |

The deployed-browser review also found a product-scope defect rather than a
WCAG rule failure: the public home screen advertised fabricated activity
metrics, localhost service addresses, and deferred chat/volunteer routes, while
the durable export/deactivation UI was hidden behind the fixture settings
route. The corrected immutable NUC deployment now presents only implemented alpha
capabilities, labels itself as a pre-alpha environment, keeps deferred routes
behind explicit scope notices, and exposes the durable account controls on
Settings. Behavioral coverage prevents those misleading claims and fixture
controls from returning.

## Residual risk

Automated tools cannot prove usability with VoiceOver, NVDA, JAWS, switch
control, speech input, cognitive accessibility needs, or real user workflows.
No independent auditor has reviewed Patchwork. The authenticated two-account
flow is executable, but it has not received a screen-reader, switch-control,
speech-input, or cognitive-accessibility review.

The `ACCESSIBILITY` go/no-go condition therefore remains open until an
independent WCAG 2.2/assistive-technology review covers the deployed alpha and
has no unresolved launch blocker. This local audit reduces uncertainty but is
not a conformance certification or VPAT.
