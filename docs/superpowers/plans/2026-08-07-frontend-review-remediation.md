# Frontend review remediation sprint

Date: 2026-08-07

Sources: the executive review, findings register, remediation and verification
plan, and evidence README supplied with the review package.

## Outcome and evidence boundary

This sprint remediates frontend and operational gaps that can be changed and
verified from the repository. It does not convert an observed write
acknowledgement into proof of public projection, treat an unperformed
destructive action as tested, or mark policy text approved without the named
human approvers.

The review was captured before commit `fc091438`, which corrected the deployed
browser API origin. A 2026-08-07 read-only production recheck returned HTTP 200
for `/api/status`, `/api/query/feed`, `/api/query/directory`,
`/api/query/volunteers`, and `/api/organizations`. This supersedes the generic
read-outage observations in PW-FE-001 through PW-FE-003, but authenticated
create workflows still require a controlled live verification.

## User stories and acceptance criteria

### US-1: Understand the discovery area

As a visitor, I need to know which area is being searched so that sample data
is not mistaken for my detected location.

- With no explicit center in the URL, Map, Feed, and Resources identify New
  York City as a demo area and state that it is not detected location.
- Choosing the demo area writes an explicit center and radius into discovery
  state and the shareable URL.
- Advanced coordinates are collapsed by default, constrained to valid ranges,
  and described as an approximate public search center.
- Resetting filters returns to the visibly labelled demo state.

### US-2: Scan discovery without a 100-card wall

As a visitor using desktop, mobile, keyboard, or assistive technology, I need a
bounded result set with controls that distinguish records.

- Initial Feed, Map, Resources, and Volunteer queries request no more than 20
  records.
- Repeated actions include the relevant request, activity, or resource name in
  their accessible name.
- Mobile navigation wraps without horizontal clipping or hidden controls.
- Primary navigation is limited to Home, Map, Feed, and Resources; workflows
  remain available through contextual calls to action and More/account menus.

### US-3: Publish with informed location privacy

As a person requesting aid, I need to understand publication scope before I
submit and receive honest acknowledgement afterward.

- Title and description use native required and length constraints matching
  the shared schema.
- Latitude, longitude, and precision use native range constraints matching the
  public geoprivacy boundary.
- Raw coordinates are placed under an advanced approximate-area disclosure.
- A pre-publish summary distinguishes public/federated fields, authenticated
  private data, and data never included in the public post.
- Success copy distinguishes source acceptance/local preview from confirmed
  discovery projection. It never says “persisted via API/DB” as a substitute
  for an indexed read.

### US-4: Operate high-impact controls safely

As an authorized moderator, I need the shutdown control to make identity,
authority, environment, scope, reason, and impact visible before execution.

- The page has a visible H1.
- The authenticated actor, required capability, build environment, and global
  scope are shown together.
- At least one declared reason and a non-empty public message are required.
- The full blast radius is stated, including what remains readable.
- A separate explicit confirmation is required and resets after execution.
- Resume remains disabled while an environment override is active.
- The server remains the authorization boundary for
  `maintenance_mode:manage`; the UI is not treated as authorization.

### US-5: Navigate and recover confidently

As any user, I need page context and service failures that do not blame my
input when a dependency is unavailable.

- Every client-side route updates the document title to “Route · Patchwork”.
- Generic request failures say that entries may still be valid and direct the
  user to retry or inspect service status.
- Push revoke is unavailable when there are zero active subscriptions.
- New English and Spanish copy has exact key parity and the production-source
  localization test remains green.

## Finding disposition

| Finding | Sprint disposition | Required evidence |
| --- | --- | --- |
| PW-FE-001–003 | Production reads recovered after API-origin correction; keep dependency smoke | HTTP status/body shape plus browser route smoke |
| PW-FE-004 | Honest pending-projection UX implemented; end-to-end projection proof remains a release gate | Isolated authenticated post found by stable URI in Feed and Map |
| PW-FE-005 | External gate; not code-completable | Named product/privacy/T&S approval and effective versions |
| PW-FE-006 | Remediated by explicit demo-area disclosure and selection | UI, URL-state, and accessibility tests |
| PW-FE-007 | Remediated by wrapping mobile hierarchy | 320/375/768 px browser checks |
| PW-FE-008–010 | Initial query cap reduced from 100 to 20 | Request assertions and large-data browser check |
| PW-FE-011 | Contextual accessible labels added to repeated high-volume actions | Accessible-name assertions |
| PW-FE-012–013 | Native constraints, advanced coordinates, and publication summary added | Browser constraint and posting-unit tests |
| PW-FE-014 | Read path recovered; authenticated private-group creation still needs controlled live proof | Create, discover, invite, accept, cleanup lifecycle |
| PW-FE-015 | Shutdown qualification and confirmation implemented | Role-denial tests plus non-production declare/resume drill |
| PW-FE-016 | New copy translated with parity gate; existing hardcoded-copy scan remains required | English/Spanish route sweep |
| PW-FE-017 | Covered by contextual names and existing named-link gate | Automated accessibility scan and screen-reader spot check |
| PW-FE-018 | Remediated with route-specific document titles | Route-navigation assertions |
| PW-FE-019 | Generic failure copy no longer blames form input | Offline/5xx route tests |
| PW-FE-020 | Primary navigation reduced to four destinations | Desktop/mobile navigation checks |
| PW-FE-021 | Revoke disabled at zero active subscriptions | Notification component test |
| PW-FE-022 | External policy-content review | Privacy counsel/product approval |

## Verification matrix

Automated gates:

1. Web typecheck and all web unit/component tests.
2. Repository lint, typecheck, full tests, exact-location absence check, and
   operations checks.
3. Production build with the public API origin and a bundle-origin assertion.
4. Read-only production smoke for health and all public discovery dependencies.

Controlled pre-release gates (must not be inferred from unit tests):

1. An isolated authenticated aid request is acknowledged at source, appears by
   stable URI in Feed and Map within the projection objective, and is cleaned
   up afterward.
2. Organization and private-group create/discover/invite/accept flows complete
   with specific recoverable errors on failure.
3. Shutdown declare/resume runs only in a non-production environment with an
   authorized moderator and audit verification.
4. Keyboard, screen-reader, Spanish, 320/375/768 px, offline, slow, 401, 403,
   409, 429, and 5xx coverage is recorded without destructive production use.

## Release decision

Code completion does not by itself change the review's launch decision. A
protected public launch remains NO-GO until policy approval, authenticated
projection evidence, controlled group/organization evidence, and the manual
accessibility/device matrix are recorded. Patrick Fanella remains the accepted
primary on-call escalation owner; secondary coverage and independent policy
owners remain required by the existing readiness record.
