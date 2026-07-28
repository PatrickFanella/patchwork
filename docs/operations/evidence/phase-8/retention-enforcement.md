# API private-data retention enforcement

Status: **implemented, locally verified, and observed on immutable home
staging; formal policy approval pending**

API migration 0012 adds partial indexes for elapsed workflow, block, audit, and
revoked-session cleanup. PostgreSQL startup immediately begins a retention pass
and repeats it at `API_RETENTION_INTERVAL_SECONDS` (one hour by default). Passes
cannot overlap and stop with the server.

Each pass uses one transaction. It removes:

- expired OAuth callback state and browser sessions;
- OAuth sessions revoked for at least seven days;
- completed HTTP idempotency responses older than seven days;
- workflows, blocks, reports, and operational audits whose explicit
  `retention_until` has elapsed.

Workflow deletion uses existing foreign-key cascades for private timeline,
assignment, response, and handoff rows. Future deadlines and active sessions
remain. Failure rolls back the pass, emits a redacted structured event, and
changes scrapeable last-attempt status without erasing the last-success time.
Prometheus rules alert after a failed pass or two hours without success.

Focused evidence:

- four PostgreSQL/scheduler behavior tests pass;
- API retention metrics preserve last success across failure;
- API typecheck and 239-test database-enabled API suite pass;
- eleven Prometheus rules validate with `promtool`.

The moderation worker independently assigns seven-day deadlines to policy
audits and resolved cases, clears case expiry when a new report or appeal
reopens work, and runs a non-overlapping hourly cleanup transaction. Active and
recent casework survive. Worker failure/staleness metrics feed two additional
validated alerts.

The combined focused evidence includes API retention behavior, moderation
migration/store/retention/scheduler behavior, clean API migration 0012 and
moderation migration 003 replay, and eleven valid Prometheus rules.

## Deployed scheduler observation, 2026-07-28

The signed `995338c` NUC runtime was observed without restart or interval
override. One expired synthetic OAuth callback-state row and one expired
resolved moderation case with an expired audit row were inserted. They
contained no user identity, credential, token, cookie, private report content,
or real AT subject.

The existing hourly schedulers removed all three probe rows on their next
natural interval. API and moderation last-success timestamps each advanced by
exactly 3,600 seconds, both last-attempt gauges remained successful, both
containers retained zero restarts, and no retention alert fired. The API log
reported three expired OAuth states because two other already-expired
callback-state rows were also eligible; only the aggregate count was observed.
The moderation log reported one expired audit and one resolved case. Full
redacted evidence is in `staging-retention-scheduler.json` and
`staging-retention-scheduler.md`.

The technical deployed-observation gap is closed. The `RETENTION` go/no-go
condition remains open solely for formal approval of the complete
backup/deletion, retained-exception, suppression-marker, and independent
AT-repository boundary policy.
