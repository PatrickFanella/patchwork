# Phase 7 immutable delivery evidence

Date: 2026-07-28

Task 7.2 is complete for the authorized home-network staging environment. Four
runtime images were built from commit
`55b337e26cd7a32bfc4d3eaf89136345a22b7156`, scanned before publication,
signed, pushed to the NUC registry, deployed by digest without rebuilding, and
accepted by migrations, readiness probes, rollback, and the real two-account
OAuth/PDS browser journey.

## Published release

The registry is available to the NUC Docker daemon through a loopback-only
`127.0.0.1:5000` binding. The additional binding avoids a host-wide insecure
registry setting and does not broaden the existing LAN firewall exposure.

| Service | Deployed digest |
| --- | --- |
| API | `127.0.0.1:5000/subculture-collective/patchwork-api@sha256:6da650e3b75a8d2dc10a9229fa6c613ce6e766ac463e69d64894cacf22838bc5` |
| Indexer | `127.0.0.1:5000/subculture-collective/patchwork-indexer@sha256:b8a44c00978a66f2fd90c992cbe919c41d001bbee9107f7fbbfe2f7d6f8696fa` |
| Moderation | `127.0.0.1:5000/subculture-collective/patchwork-moderation@sha256:900fb7782188e9c0cb93a16b3c1ab4c513665c3746f72f24555caaafc83c78c4` |
| Web | `127.0.0.1:5000/subculture-collective/patchwork-web@sha256:029b8351b491c4887b6fcba54dd3616d3ea98c741c257dd165c982b730b518d1` |

Trivy 0.59.1 reported zero HIGH and zero CRITICAL findings for every published
image. The first scan correctly blocked publication and led to three fixes:
digest-pinned Node/nginx bases, patched OS packages and npm, and removal of
development-only packages from Node runtime layers. A checksum-verified
`brace-expansion` 5.0.8 replacement closed the final npm-bundled HIGH finding.

Cosign 2.6.1 signed and verified all four digest references. The scoped private
key, password file, and public key are `0600` under a `0700` NUC operator
directory. The public-key fingerprint is retained with the release evidence.
Because this is a private home registry, signing used a locally managed key and
disabled transparency-log upload. The signatures prove integrity against the
retained public key; they do not provide GitHub OIDC identity or Rekor
transparency.

## Deployment and rollback execution

The production Compose topology now accepts the same four digest variables as
staging. `deploy-staging-digests.sh` explicitly loaded the NUC host override,
used the external PostgreSQL service, pulled only the manifest images, ran API
13, indexer 4, and moderation 3 migrations, and started all runtimes with
`--no-build --wait`.

The deployment gate verified:

- all four `org.opencontainers.image.revision` labels equal the manifest SHA;
- API, indexer, moderation, web, local Jetstream, and map range readiness;
- the versioned PMTiles URL is embedded in the web bundle and returns exactly
  1,024 bytes for the range probe;
- the unversioned tile URL remains unavailable; and
- `/`, `/api/health/ready`, `/api/contracts`, and `/api/query/directory`
  return HTTP 200.

`rollback-staging-digests.sh` then restored all four digests for the prior
known-good source commit `edf24486493bfc1ed56e93c0d8d767c52e564f29`
without a down migration. Docker had already discarded the original taggable
image metadata, so the rollback candidate was rebuilt from that exact source
commit, published, and signed as rollback-only; it was not represented as the
original binary artifact. The rollback passed revision, service, and map
readiness, after which the scanned `55b337e` manifest was promoted forward
again. Host release state retains current and previous manifests as `0600`
files in a `0750` directory.

## Post-deploy browser acceptance

The first browser attempt published and projected correctly but used Chicago
coordinates while the feed contract queries a 100 km New York radius. The
record projected in two seconds, but the helper could not discover an
out-of-radius result. Both disposable accounts and the orphaned projection
were removed. The harness now rejects coordinates outside the feed radius
before publication.

The corrected two-account run passed in 13.6 seconds:

- two cookie-only OAuth sessions;
- AT record creation and local Jetstream projection;
- independent helper discovery;
- report and durable block;
- owner resolve, AT close, and CID-aware deletion; and
- exact-coordinate, private-marker, URL, DOM, JSON, and token-name privacy
  assertions.

The artifact redaction gate passed with zero retained files. Both successful
run accounts were deactivated in Patchwork and deleted from the PDS. Final
verification found zero disposable projections and zero active disposable
reports.

## Remaining authority boundary

The Phase 7 technical exit gate is complete on the NUC. The GitHub protected
environment/GHCR keyless workflow has still not run, the signing key and
registry share the staging host, backup durability is not independent, and no
human incident acknowledgment is proven. Those are production/pilot
governance risks and keep the alpha decision at `NO-GO`; they are not
represented as missing execution of the home-staging digest deployment.
