# Authenticated account data export

Date: 2026-07-11

Result: **self-service Patchwork-held data export complete locally;
deactivation/erasure remains separate**.

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

Two PostgreSQL/HTTP cases prove authenticated subject derivation, cross-subject
projection exclusion, credential/session-hash exclusion, explicit scope
disclosures, and unauthenticated rejection. A web-client case proves the
request is a cookie-authenticated GET containing no DID.

## Remaining boundary

This is a data-access/portability mechanism, not account deletion. Durable
deactivation, future-ingestion suppression, session revocation, retained-data
exceptions, and operator review are tracked separately and remain `NO-GO`.
