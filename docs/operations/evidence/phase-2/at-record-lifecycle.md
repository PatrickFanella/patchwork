# Phase 2 AT record lifecycle evidence

Verified: 2026-07-10T22:33:12Z

This is redacted evidence from a disposable two-account exercise against the home-network staging PDS at `https://pds-staging.dsaslate.us`. It contains no passwords, access tokens, refresh tokens, or session payloads. The disposable record was deleted at the end of the exercise.

## Accounts and record

- Account A: `did:plc:ktr225xpasn43qsre6gf4aru`
- Account B: `did:plc:mve452mn4vz4lq3p7nzhjws7`
- Record URI: `at://did:plc:ktr225xpasn43qsre6gf4aru/app.patchwork.aid.post/3mqd7dqwijk2p`
- Initial CID SHA-256 prefix: `d3a263cc10b0`
- Updated CID SHA-256 prefix: `da6722949620`
- Closed CID SHA-256 prefix: `662c6d90ef64`

## Results

| Operation | Result |
| --- | --- |
| Account A creates an aid post | HTTP 200 |
| Public read returns the created record | HTTP 200 |
| Account A updates status with the initial CID | HTTP 200 |
| Account B attempts to update account A's repository | HTTP 401, `AuthenticationRequired` |
| Read after the denied mutation returns account A's updated CID and status | HTTP 200 |
| Account A closes using the updated CID | HTTP 200 |
| Read returns the closed CID and status | HTTP 200 |
| Account A deletes using the closed CID | HTTP 200 |
| Read after deletion | HTTP 400, `RecordNotFound` |

The first live attempt also exposed an AT data-model mismatch: floating-point values are not valid AT record values. Patchwork now converts its decimal latitude/longitude and kilometre precision domain values to integer microdegrees and metres at the PDS boundary, and converts them back on reads. The JSON lexicon uses the same integer wire representation.

This exercise authenticated directly to the PDS with disposable test-account sessions. It proves the repository transport and ownership boundary, but it does not prove the Patchwork browser OAuth callback and cookie flow. That remains part of the Phase 2 exit gate.
