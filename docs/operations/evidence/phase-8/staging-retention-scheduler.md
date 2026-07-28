# NUC staging retention scheduler observation

Date: 2026-07-28 (America/Chicago)

Result: **the immutable API and moderation runtimes enforced expired data on
their normal deployed hourly cadence**.

## Method

The system under observation was the signed four-image
`995338c584524a84c2365c6a5658a6242399fd10` NUC release. Both service
containers configured a 3,600-second retention interval and had already
reported one successful startup pass.

The bounded probe inserted:

- one expired synthetic OAuth callback-state row; and
- one expired synthetic resolved moderation case with one expired audit row.

The markers used reserved example/invalid identities and contained no
credential, token, cookie, user content, private report detail, real DID, or
real AT record URI. No interval, service configuration, or container state was
changed. The services were not restarted.

## Result

Before the interval, all three probe rows existed. On the next natural pass:

- API last success advanced from `1785267387` to `1785270987`;
- moderation last success advanced from `1785267373` to `1785270973`;
- each delta was exactly 3,600 seconds;
- the synthetic OAuth state, moderation audit, and resolved case counts all
  changed from one to zero;
- both last-attempt-success gauges remained `1`;
- both container restart counts remained zero; and
- Prometheus reported zero firing retention alerts.

The API completion log reported three expired OAuth states. One was the
synthetic probe and two were independently eligible pre-existing expired
callback states. Only the aggregate was observed; identities and encrypted
payloads were not inspected. The moderation completion log reported one audit
record and one resolved case, matching its synthetic probe.

The redacted machine-readable observation is
`staging-retention-scheduler.json`.

## Boundary

This proves startup and repeated deployed scheduling, transactional deletion
of representative expired API/moderation state, metric advancement, alert
health, and zero-restart execution on home staging. It does not constitute
privacy or legal approval, prove independent backup deletion, or change the
PDS/AT-repository boundary. Those human-policy decisions keep `RETENTION` and
the overall alpha decision open.
