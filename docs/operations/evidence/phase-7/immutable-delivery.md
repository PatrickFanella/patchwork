# Phase 7 immutable delivery: local evidence

Date: 2026-07-11

This evidence covers the locally verifiable Task 7.2 delivery mechanism. It
does not claim that images were published, signed in the GitHub OIDC context,
or deployed to the staging host.

## Build and publication contract

`.github/workflows/deploy-staging.yml` runs only after successful `CI` on
`main`, or after a protected manual dispatch whose SHA has successful
`quality-gates` and `e2e-production` checks. A four-entry matrix builds API,
indexer, moderation, and web exactly once from that SHA. Each local image is
scanned for high/critical findings before push, pushed to GHCR, resolved to its
registry digest, keyless-signed with Cosign, verified, and assembled into
`artifact-digests.json`.

## Deployment and rollback contract

The protected `staging` environment transfers the digest manifest, Compose
file, and host scripts over pinned-host-key SSH. The deployment script:

1. rejects any image reference without a 64-character SHA-256 digest;
2. preserves the current manifest as `previous-artifact-digests.json`;
3. pulls exact images and runs API, indexer, and moderation migrations;
4. starts services using `--no-build --wait`;
5. verifies each internal `/health/ready` endpoint;
6. records the current manifest only after readiness succeeds.

Workflow failure invokes the rollback script. Rollback restores all four
previous digests together with `--no-build --no-deps`, verifies readiness, and
does not attempt unsafe down migrations. The schema must remain compatible
with the previous application digest throughout the rollback window.

After host readiness, the workflow runs the real two-account OAuth/PDS browser
journey and the artifact redaction gate. These commands, not echoed success
text, decide deployment success.

## Local verification

- Workflow and Compose YAML parse successfully.
- Deployment and rollback scripts pass Bash syntax checks.
- Seven focused delivery/topology tests pass, including behavioral rejection
  of a mutable `:latest` manifest before Docker invocation.
- Database-enabled repository gate: 836 passed.
- PostgreSQL/HTTP integration: 24 passed.
- Direct service integration: 9 passed.
- Chromium: 39 passed; one real-environment journey skipped.
- Coverage: 58.22% statements, 45.95% branches, 51.44% functions, 59.44% lines.
- Workspace build, migration replay, and high-severity audit: passed.

## External blockers

Execution requires GHCR package permission, GitHub OIDC signing, a protected
`staging` environment, pinned SSH credentials, a host deployment path and
secret environment file, staging public origins, and two disposable OAuth
storage states. Until those are supplied and the workflow completes, the
publish/deploy/post-deploy checklist items and Phase 7 exit gate remain open.
