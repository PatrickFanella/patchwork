# Directory authoring and management evidence

Date: 2026-07-28

## Scope

This slice connects the existing directory lexicon and durable projection to an
authenticated owner workflow. Signed-in stewards can create, read, update, and
delete `app.patchwork.directory.resource` records through the Patchwork API and
their restored AT OAuth session.

## Record authority and safety

- The user PDS remains the public-record authority.
- Repository ownership is derived from the restored OAuth DID. Cross-repository
  reads and mutations are rejected before transport calls.
- Create uses a deterministic PDS record key derived from the durable HTTP
  idempotency key.
- Update and delete require the current CID and use AT compare-and-swap.
- New records are forced to `unverified`. Owner edits preserve the
  server-read verification status and original creation time, so a hostile
  browser cannot self-assert community or partner verification.
- Directory public records are strict; undeclared private fields are rejected.
- Published coordinates must use one-kilometre-or-broader precision.

## AT wire compatibility

Aid-post and directory-resource coordinates now share the canonical integer
wire representation: latitude and longitude in microdegrees and precision in
metres. The AT client encodes this representation before repository writes, and
firehose ingestion decodes it before strict record validation. This closes the
previous gap where an officially written record could fail live projection
normalization.

## Browser workflow

- Public directory browsing remains anonymous.
- Signed-in users receive an integrated publish/manage panel on the resource
  route.
- The responsive form exposes only public directory fields and explains the
  geoprivacy and verification boundaries.
- Owner cards expose management only when the projection author DID matches the
  authenticated DID.
- Create/update responses show eventual-consistency notices rather than
  pretending the projection has already ingested the PDS write.
- Delete requires an explicit confirmation.
- Async owner reads are cancellation-safe so development-mode duplicate effects
  cannot overwrite active edits.

## Verification

- Standard repository gate: lint, typecheck, maps, and 890 tests passed; 66
  database-only tests were skipped.
- Fresh PostgreSQL 16 gate: API 13, indexer 4, and moderation 3 migrations
  applied; all 956 tests passed with no skips.
- Production build completed for every workspace, including the Vite browser
  bundle.
- Rendered Chromium create/read/update/delete workflow passed, including an axe
  scan of the authenticated form.

## NUC reconciliation

Before development continued, the live NUC checkout at
`/srv/repos/subcult/patchwork` was inspected read-only. It was clean at
`7caadcc`, had no other local branches or uncommitted development, and its
running Patchwork images were labeled with the same revision. The preceding
durable-directory commit `dfeb622` was pushed from the workstation; the NUC was
not fetched, rebuilt, restarted, or deployed during this slice.

## Remaining external boundary

This is source-complete local and rendered mocked-transport evidence. It does
not prove a live directory record through browser OAuth, PDS repository write,
Jetstream delivery, durable projection, public query, owner edit, and deletion.
A trusted partner-verification administration workflow is also still absent.
