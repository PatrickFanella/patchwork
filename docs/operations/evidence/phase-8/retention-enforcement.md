# API private-data retention enforcement

Status: **implemented and locally verified; formal policy approval pending**

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

This does not close the `RETENTION` go/no-go condition until the complete
backup/deletion policy receives formal privacy approval and the scheduled jobs
are observed in authorized staging.
