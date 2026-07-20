# Staging secret injection

Patchwork staging fails closed when required identity, OAuth, database, or
service-auth values are absent. Compose files contain variable references only;
do not commit resolved Compose output or an environment file.

## Required values

| Variable | Requirement | Consumer |
| --- | --- | --- |
| `PATCHWORK_STAGING_POSTGRES_PASSWORD` | Random database password, URL-safe | PostgreSQL and all migration/runtime services |
| `STAGING_ATPROTO_SERVICE_DID` | Real staging service DID; never `did:example` | API, indexer, moderation, migrations |
| `ATPROTO_PDS_URL` | Controlled PDS HTTPS origin | AT runtimes |
| `STAGING_ATPROTO_OAUTH_CLIENT_ID` | Public HTTPS OAuth client metadata URL | API |
| `STAGING_ATPROTO_OAUTH_REDIRECT_URI` | Registered HTTPS callback URL | API |
| `STAGING_ATPROTO_SESSION_ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes | API session encryption |
| `STAGING_PUBLIC_ORIGIN` | Canonical staging web HTTPS origin | API origin/CSRF policy |
| `STAGING_VITE_API_BASE_URL` | Browser-visible staging API HTTPS origin | Web build |
| `STAGING_VITE_MAP_TILE_URL` | Same-origin content-addressed URL matching `/tiles/us.<sha256>.pmtiles` | Web build |
| `STAGING_MODERATION_SERVICE_TOKEN` | Random internal bearer secret | API and moderation worker |
| `INDEXER_FIREHOSE_URL` | Approved Jetstream/WebSocket source | Indexer |

Generate the session key with `openssl rand -base64 32`. Generate database and
service tokens with an approved password manager or secret platform. Never put
these values in shell history, issue text, screenshots, logs, Playwright state,
or repository files.

## Injection contract

Inject values through the deployment platform's protected environment or a
root-owned runtime environment file outside the checkout. Render and validate
without printing resolved values:

```bash
docker compose -f docker-compose.staging.yml config --quiet
```

Do not use `docker compose config` without `--quiet` in CI logs because it
expands secrets. Rotate the OAuth/session key by invalidating existing browser
sessions and redeploying the API. Rotate the moderation token by updating API
and worker atomically. Database credential rotation requires updating all three
migration jobs and all three database-backed runtimes in one maintenance step.

## Startup order

Compose enforces this dependency chain:

1. PostgreSQL becomes healthy.
2. API, indexer, and moderation one-shot migrations complete successfully.
3. Indexer and moderation readiness checks validate their dependencies.
4. API starts only after its schema, the projection schema, fresh indexer, and
   moderation worker are ready.
5. Web starts only after API deep readiness succeeds.

Any missing secret, failed migration, unavailable dependency, or stale stream
keeps the dependent service unready rather than producing simulated success.
