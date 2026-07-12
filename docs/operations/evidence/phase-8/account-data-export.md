# Authenticated account data export

Date: 2026-07-11

Result: **self-service Patchwork-held data export and durable account
deactivation complete locally**.

## Behavior

`GET /account/export` restores the HttpOnly browser session and derives the
subject DID exclusively from that session. It accepts no DID, actor, token, or
filter in the URL or request body. The API reads a repeatable PostgreSQL
snapshot and returns versioned machine-readable JSON.
The response is marked `Cache-Control: no-store` and carries an attachment
filename so intermediaries do not intentionally retain it.

Included categories are:

- non-secret OAuth/browser-session metadata and the current platform role;
- the subject's durable public aid-post projections with approximate geography;
- workflows requested by the subject;
- lifecycle, assignment, and handoff actions involving the subject;
- blocks and reports submitted by the subject without third-party identifiers;
- sanitized operational-action and idempotency metadata.

The export deliberately excludes encrypted OAuth payloads, tokens, session
lookup hashes, idempotency response bodies, internal audit payloads, and
private moderation casework. It also states that projected aid posts are not a
complete export of the user's portable AT repository.

The web downloads the response as `patchwork-account-export.json` rather than
claiming an asynchronous link or sending the browser DID to the API.

## Evidence

Three PostgreSQL/HTTP cases prove authenticated subject derivation, cross-subject
projection exclusion, credential/session-hash exclusion, explicit scope
disclosures, and unauthenticated rejection. A web-client case proves the
request is a cookie-authenticated GET containing no DID.

## Deactivation behavior

`POST /account/deactivate` restores the HttpOnly browser session, ignores any
browser identity fields, and executes through the PostgreSQL idempotency ledger.
One transaction takes the same per-account advisory lock used by session
creation and indexing, writes a hash-only suppression receipt, removes public
projections and owned workflow/role/block state, revokes browser and OAuth
sessions, and strips or pseudonymizes retained safety and audit exceptions.
The response contains counts and timestamps but no raw DID.

The indexer checks the durable suppression receipt under that account lock
before every create/update projection. Live events and complete rebuild replay
therefore cannot resurrect deactivated content. OAuth and browser-session stores
also check the receipt under the same lock, preventing a later OAuth callback or
concurrent login from silently reactivating the account. All other durable HTTP
mutations take the same account lock and reject a suppressed actor before their
effect, so an in-flight command either finishes before deactivation removes its
state or fails afterward; it cannot recreate private state after the receipt.
The browser sends an empty command body, clears both session cookies after
success, and makes no reversibility promise.

Retained exceptions are bounded and documented: safety casework/attribution for
up to seven days, pseudonymized operational audit data for up to 30 days, and a
hash-only suppression marker for the duration of deactivation. That minimal
marker is necessary to honor the user's choice and prevent automatic
resurrection; controlled reactivation removes it after identity and safety
review. The final idempotency receipt keeps the actor key, request hash, and
response counts for up to seven days so retries remain stable; it stores neither
the submitted body nor credentials. Patchwork deactivation does not delete
records from the user's independently hosted AT repository; controlled
reactivation or complete AT-repository deletion remains an external process.

## Deactivation evidence

PostgreSQL/HTTP coverage proves authenticated subject derivation, hostile-body
identity rejection, projection/workflow removal, session revocation, cookie
clearing, cross-subject isolation, retained exception reporting, and stable
idempotency conflicts. PostgreSQL store tests prove deactivated accounts cannot
restore browser or OAuth sessions. Indexer PostgreSQL tests prove both live
application and rebuild replay remain suppressed. The web-client test proves
the mutation carries no DID and uses an idempotency key. The durable command
executor test proves post-deactivation mutations are rejected before their
effect executes.

## Remaining boundary

This closes the locally feasible Patchwork account-deactivation path, not
independent AT-repository deletion or formal privacy approval. Controlled
external review must still approve retention and exercise the behavior through
real OAuth, staging ingestion, backup/restore, and operator procedures before
alpha launch. The overall decision therefore remains `NO-GO`.
