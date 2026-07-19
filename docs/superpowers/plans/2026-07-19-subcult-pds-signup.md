# Subcult PDS Signup Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Let invited people create a `name.subcult.tv` AT Protocol account from Patchwork and continue immediately into Patchwork's existing OAuth login.

**Architecture:** Patchwork's API is the signup admission gate: it validates the fixed Subcult handle domain, blocks reserved labels, rate-limits requests, requires the Patchwork browser origin, forwards credentials to the configured Subcult PDS without logging them, and returns only the new DID and handle. The public Caddy route blocks direct access to `com.atproto.server.createAccount`, while the API reaches the LAN-bound PDS origin. The React page never stores PDS session tokens and starts the existing OAuth flow after account creation.

**Tech Stack:** TypeScript, Node HTTP server, React, Vitest, Docker Compose, Caddy, AT Protocol XRPC.

---

### Task 1: Add the API signup admission service

**Files:**
- Create: `services/api/src/auth/pds-signup-service.ts`
- Create: `services/api/src/auth/pds-signup-service.test.ts`
- Modify: `packages/shared/src/config.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.staging.yml`

- [ ] **Step 1: Write service tests for accepted and rejected signup requests**

Cover a successful upstream response, reserved labels (`patchwork`, `grafana`, `edda`), malformed labels, invalid invites, duplicate handles, upstream timeouts, and proof that the public result contains only `did` and `handle`.

- [ ] **Step 2: Run the focused service test and verify it fails**

Run: `npm test -w @patchwork/api -- pds-signup-service.test.ts`

Expected: FAIL because `pds-signup-service.ts` does not exist.

- [ ] **Step 3: Implement the bounded signup service**

Implement `createPdsSignupService({ pdsUrl, fetchImpl })` with `createAccount(input)`. Accept `handle`, `email`, `password`, and `inviteCode`; require a 3–18 character lowercase service-domain label; require the `.subcult.tv` suffix; cap all field lengths; reject Subcult service labels; POST JSON to `/xrpc/com.atproto.server.createAccount` with a ten-second timeout; map known XRPC errors to stable public errors; and return only `{ did, handle }`.

- [ ] **Step 4: Add explicit production configuration**

Add `ATPROTO_ACCOUNT_PDS_URL` to the API schema and Compose environment with `https://pds.subcult.tv` as the deployment value. Do not expose this URL as browser build configuration because account creation goes through the API gate.

- [ ] **Step 5: Run the focused service test**

Run: `npm test -w @patchwork/api -- pds-signup-service.test.ts`

Expected: PASS.

### Task 2: Expose the protected signup route

**Files:**
- Modify: `services/api/src/index.ts`
- Modify: `services/api/src/rate-limiter.ts`
- Create: `services/api/src/http/pds-signup-route.test.ts`
- Modify: `apps/web/src/auth/auth-api.ts`

- [ ] **Step 1: Write route tests for the public contract**

Test `POST /auth/signup` with valid JSON, the wrong Origin, a malformed payload, a reserved handle, an upstream PDS error, and an existing session without a CSRF token. Assert that neither passwords, invite codes, nor upstream JWTs appear in responses.

- [ ] **Step 2: Run the focused route test and verify it fails**

Run: `npm test -w @patchwork/api -- pds-signup-route.test.ts`

Expected: FAIL with the route not found.

- [ ] **Step 3: Add the signup route**

Handle only `POST /auth/signup`; require `Origin` to equal `API_PUBLIC_ORIGIN`; retain the existing double-submit CSRF check for browsers with a Patchwork session; classify the route under the auth limiter; call the signup service; and emit stable JSON errors through the existing public error boundary.

- [ ] **Step 4: Add the browser API helper**

Add `createSubcultAccount(input)` to `auth-api.ts`. POST same-origin JSON with `credentials: 'include'` and the existing CSRF header, parse only `{ did, handle }`, and never expose or retain PDS JWT fields.

- [ ] **Step 5: Run API tests**

Run: `npm test -w @patchwork/api`

Expected: PASS.

### Task 3: Build the accessible signup experience

**Files:**
- Create: `apps/web/src/auth/SignupPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/auth/LoginPage.tsx`
- Modify: `apps/web/src/styles/index.css`
- Modify: `apps/web/src/auth/auth-flow.test.tsx`

- [ ] **Step 1: Add failing rendering and interaction tests**

Assert that `/signup` exposes labelled username, email, password, password-confirmation, invite-code, and terms controls; displays the fixed `.subcult.tv` suffix; rejects mismatched passwords before fetch; never renders a returned JWT; and starts OAuth with the returned handle after successful creation.

- [ ] **Step 2: Run the web auth tests and verify they fail**

Run: `npm test -w @patchwork/web -- auth-flow.test.tsx`

Expected: FAIL because `SignupPage` and the signup helper do not exist.

- [ ] **Step 3: Implement `SignupPage`**

Use existing Patchwork cards, inputs, buttons, spacing, and focus styles. Keep passwords in component state only until submission, clear them after completion or failure, require privacy/terms acknowledgement, provide safe messages for invite/handle/password/PDS errors, and call `auth.login(created.handle, safeReturnTo)` after success.

- [ ] **Step 4: Wire navigation**

Route `/signup` in `App.tsx`, add “Create a Subcult account” to `/login`, and add “Already have an account?” back to `/login` from signup.

- [ ] **Step 5: Run the web tests**

Run: `npm test -w @patchwork/web`

Expected: PASS.

### Task 4: Harden the public browser and PDS perimeter

**Files:**
- Modify: `docker/nginx/patchwork-web.conf`
- Modify in sibling repository: `../subcult-pds/deploy/caddy/subcult-pds.Caddyfile`
- Modify in sibling repository: `../subcult-pds/docs/OPERATIONS.md`

- [ ] **Step 1: Add a production Content Security Policy**

Restrict scripts and connections to self, deny frames and object embedding, restrict base/form targets, and retain only the inline-style allowance required by the current React/Tailwind output.

- [ ] **Step 2: Block public direct account creation**

In the exact `pds.subcult.tv` Caddy site, return 404 for `/xrpc/com.atproto.server.createAccount` before the general reverse proxy. Keep health, OAuth, repository sync, and wildcard handle resolution unchanged.

- [ ] **Step 3: Validate and reload Caddy**

Save a timestamped rollback copy, run `caddy validate`, reload, verify public direct createAccount is blocked, and verify the LAN PDS endpoint remains reachable from the Patchwork API host.

- [ ] **Step 4: Document the admission boundary**

Record that account creation must go through Patchwork, direct public creation is intentionally blocked, the API handles signup credentials only in memory, and logs must never include request bodies.

### Task 5: Validate, commit, deploy, and smoke test

**Files:**
- Modify: `docs/operations/evidence/` with signup deployment evidence if the repository convention requires it.

- [ ] **Step 1: Run repository checks**

Run: `npm run check`

Expected: all formatting, lint, type, and test checks pass.

- [ ] **Step 2: Commit the reviewed implementation in logical commits**

Commit the plan, backend admission gate, frontend signup experience, and PDS perimeter/docs separately. Never commit host `.env` files or generated credentials.

- [ ] **Step 3: Back up and deploy**

Take a fresh Patchwork database backup, preserve prior image tags, build images with the current Git SHA, deploy only after migrations succeed, and recreate the API/web services with `ATPROTO_ACCOUNT_PDS_URL=https://pds.subcult.tv`.

- [ ] **Step 4: Run non-destructive public smoke tests**

Verify `/signup` and `/login` return 200, CSP is present, public PDS createAccount is blocked, Patchwork API rejects wrong-origin and invalid-invite attempts safely, all readiness endpoints remain 200, and deployed image revision labels equal the committed SHA. Do not consume an invite or create an account without explicit approval.
