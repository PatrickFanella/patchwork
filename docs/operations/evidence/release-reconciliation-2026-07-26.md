# Release reconciliation evidence

Date: 2026-07-26 (America/Chicago)

Decision: **deployment hold**

This record captures the source and runtime state found before reconciling the
frontend overhaul with the PDS signup and interactive-map work. It contains no
secret values.

## Source reconciliation

- The local checkout and its cached `origin/main` initially pointed to
  `8882c4c7f6a69f2d8845ca95d5d887f495a42ff5`.
- A fresh fetch advanced `origin/main` to
  `fb23d9888fde6cc8a8181db60622a6e02af81c31`.
- The NUC checkout and its `origin/main` already pointed to `fb23d988`.
- The sixteen intervening commits contain invite-gated PDS signup, the
  privacy-safe interactive map, the content-addressed PMTiles deployment, and
  their deployment evidence.
- Local `main` fast-forwarded to `fb23d988`; no history rewrite was required.
- `safety/pre-reconcile-20260726` preserves the former local head.
- The four-file frontend worktree was preserved in
  `stash@{0}` before the fast-forward and then reapplied without conflicts.
  The stash remains available until the reconciled commit is independently
  verified.
- `.codex/` was not added, removed, or modified.

`/srv/server/projects/patchwork` and
`/home/onnwee/Projects/subcult/patchwork` on the NUC are two symlinks to the
same `/srv/repos/subcult/patchwork` checkout. Their different Compose labels
are therefore cosmetic, not distinct source trees.

## Runtime inventory before remediation

| Runtime | Image ID | OCI revision |
| --- | --- | --- |
| Web | `sha256:1be0f74ecb5d...` | `8882c4c-worktree-ef0ad7804079` |
| API | `sha256:4c112532c401...` | `1c8ebece1f3da37eb61b112b1d36224875f4e919` |
| Indexer (`spool`) | `sha256:c00cec477560...` | `1c8ebece1f3da37eb61b112b1d36224875f4e919` |
| Moderation (`thimble`) | `sha256:2a2eb7c09e8e...` | `1c8ebece1f3da37eb61b112b1d36224875f4e919` |

The running system is healthy at the container/readiness level but is not one
reproducible release:

- `/api/health/ready` returned `200`.
- `/map` returned the application shell.
- The documented content-addressed PMTiles URL returned a 906-byte HTML
  application shell rather than a 1,024-byte PMTiles range.
- The running web image predates the interactive map and invite signup UI.

Observed configuration fingerprints:

- `docker-compose.yml`:
  `3b1585625d172665299f5a50a175b2937f72f1bb45c23c85`
- `docker-compose.override.yml`:
  `a8009e65438bdd7d568ac52f814a620f92281b56304ecd002c3467e332bad73c`
- NUC `.env`:
  `33d1a2d2a4b196cadcd80e994d70030270b44e4987cc8281c74e16ec1d84173b`

The `.env` value above is a fingerprint only; its contents were not printed.

## Backup boundary

The newest valid observed NUC logical backup is:

```text
/srv/backups/patchwork/patchwork-pre-signup-20260720T021759Z.dump
size: 78,882 bytes
```

Two older zero-byte predeployment attempts remain in the backup directory.
No current timer or cron entry for `backup-postgres.sh` was found. A fresh
validated backup and checksum sidecar are mandatory immediately before any
new deployment.

## Reconciliation changes

The candidate source now:

- contains both invite-only signup and the interactive geographic map;
- retains the frontend overhaul's route headers, record cards, callback
  recovery treatment, token fixes, and responsive styling;
- uses same-origin `/api` by default and proxies that path to the local API
  during Vite development, matching the production CSP;
- supplies names and autocomplete policy for alpha-critical form controls;
- restores visible focus for the main skip-link target and `<summary>`;
- meets automated contrast checks for secondary actions and map help text;
- carries the content-addressed map URL in the immutable release manifest;
- derives the mounted PMTiles filename from that manifest;
- verifies the map URL in the built bundle, a 1,024-byte range response, the
  unversioned 404, and matching OCI revisions across all four services during
  deploy and rollback.

## Verification

- `npm run check`: passed; 874 tests passed and 62 database cases were
  intentionally skipped in the non-database layer.
- Fresh PostgreSQL 16 migrations: API 13, indexer 3, moderation 3.
- Database-enabled workspace tests: 936 passed.
- Direct service integration: 9 passed.
- Chromium: 49 passed, 1 authorized external two-account case skipped.
- Eight axe route scans: zero detected WCAG 2 A/AA violations.
- 320 CSS-pixel reflow: passed.
- Production web build: passed with the expected content-addressed PMTiles URL
  and same-origin API base embedded in generated assets.
- `npm audit --omit=dev --audit-level=high`: zero production vulnerabilities.
- `git fsck --no-reflogs --no-dangling`: passed for the active object graph.

## Remaining release gate

Do not deploy this candidate from a mutable worktree. Before deployment:

1. commit and push the reconciled source;
2. clone the pushed revision into a clean directory and rerun the release
   contract checks;
3. create and validate a fresh NUC database backup;
4. build all four images from that one full Git SHA;
5. create a manifest containing those four digests and the exact PMTiles URL;
6. retain a compatible previous manifest for rollback;
7. deploy through one canonical Compose invocation and collect the new
   readiness evidence.

This reconciliation does not change the standing alpha `NO-GO`: the authorized
two-account AT browser journey and the other external Phase 7/8 gates remain
open.
