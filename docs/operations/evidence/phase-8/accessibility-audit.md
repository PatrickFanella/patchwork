# Local WCAG 2.2 AA accessibility audit

Date: 2026-07-11

Scope: home, map, feed, posting, resources, volunteer, chat, and login routes in
the local production-data-mode web application.

Result: **no locally detected launch-blocking violation; independent review
still required**.

## Automated evidence

`@axe-core/playwright` is now a committed browser dependency. Each critical
route is scanned without exclusions or impact filtering using WCAG 2 A/AA,
2.1 A/AA, and 2.2 AA rule tags. All eight route scans report zero violations.

One cross-route reflow case renders every route at 320 CSS pixels and proves
that document content does not create page-level horizontal scrolling. The
full Chromium suite now passes 48 cases with only the authorized real OAuth/PDS
journey skipped.

Playwright now starts Patchwork on the dedicated strict port `41739` with
server reuse disabled. During this audit, the former port-5173 configuration
reused an unrelated Roberts Rules development server; a failure screenshot
exposed the mismatch. Results from that run were discarded, and the isolated
48-pass rerun is the authoritative browser evidence.

The database-enabled coverage gate also passes all 848 tests. Coverage-file
parallelism is disabled because the PostgreSQL suites intentionally share one
disposable database and concurrent migration/TRUNCATE setup can deadlock.
Current diagnostic coverage is 64.50% statements, 51.20% branches, 58.46%
functions, and 65.71% lines.

## Manual repository/browser review

| Area | Evidence | Result |
| --- | --- | --- |
| Keyboard | Skip link is first, navigation/buttons are keyboard-operable, Escape dismisses overlays | Pass locally |
| Focus | Visible `focus-visible` ring, main target, trap/restore helpers, disabled controls excluded | Pass locally |
| Names and labels | Native labels, `aria-describedby`, invalid/required state, named actions | Pass locally |
| Structure | Main/navigation landmarks, articles, named regions, route headings | Pass locally |
| Dynamic state | Polite/assertive announcers, status and alert roles, loading live regions | Pass locally |
| Contrast | axe route scans include applicable WCAG contrast rules | No detected violation |
| Motion | `prefers-reduced-motion` disables animation and transition duration | Pass by source inspection |
| Reflow | Eight routes at 320 CSS pixels | Pass in Chromium |

## Residual risk

Automated tools cannot prove usability with VoiceOver, NVDA, JAWS, switch
control, speech input, cognitive accessibility needs, 200% text-only resizing,
or real user workflows. No independent auditor has reviewed Patchwork, and the
real authenticated two-account flow is not available for accessibility testing.

The `ACCESSIBILITY` go/no-go condition therefore remains open until an
independent WCAG 2.2/assistive-technology review covers the deployed alpha and
has no unresolved launch blocker. This local audit reduces uncertainty but is
not a conformance certification or VPAT.
