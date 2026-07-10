# AT Protocol artifacts

Current implementation and continuation sequencing are governed by
`docs/superpowers/plans/2026-07-10-patchwork-continuation-roadmap.md`. The
documents below describe existing contracts; they do not by themselves imply
that real OAuth, repository writes, or live ingestion are implemented.

Alpha data placement and ingestion are governed by
`docs/architecture/adr/0003-at-alpha-data-boundaries.md`. Only aid posts are an
alpha write collection. Jetstream is the initial filtered live source, backed
by repository reconciliation; it is not treated as record authority or a
complete historical source.

Phase 2 artifacts and guarantees:

- `lexicon-versioning.md` — schema set, field constraints, semver policy.
- `identity-session.md` — DID auth/session lifecycle and error model.
- `tombstone-contract.md` — delete/tombstone lifecycle and downstream guarantees.
