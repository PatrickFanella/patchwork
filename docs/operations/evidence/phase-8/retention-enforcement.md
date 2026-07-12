# API private-data retention enforcement

Status: **implemented and locally verified; moderation retention and policy
approval pending**

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
- nine Prometheus rules validate with `promtool`.

This does not close the `RETENTION` go/no-go condition. The moderation worker
must independently enforce its seven-day queue/audit policy, and the complete
backup/deletion policy still requires privacy approval.
