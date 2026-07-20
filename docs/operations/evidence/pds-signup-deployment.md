# Subcult PDS signup deployment evidence

Date: 2026-07-20

## Deployment

- Patchwork revision: `ad222b5ddb1eb62546120b6701906c2e111c9140`
- PDS edge policy revision: `737c09c`
- Public routes: `https://patchwork.subcult.tv/signup` and `https://patchwork.subcult.tv/login`
- Account admission route: `POST https://patchwork.subcult.tv/api/auth/signup`
- PDS account origin: LAN-bound private origin; the public `createAccount` procedure is blocked at Caddy.
- Rollback images: `patchwork-patchwork-{api,spool,thimble,web}:pre-signup-20260720`

## Data protection

- Pre-deploy backup: `/srv/backups/patchwork/patchwork-pre-signup-20260720T021759Z.dump`
- Backup SHA-256: `3b926129b185d7455a979afbd2c3d2886046d3463c525e6d2139b8b22badbf30`
- The inherited placeholder database credential was rotated before rollout and connectivity was verified without displaying the replacement.
- Runtime images were checked to confirm `.env` and `docker-compose.override.yml` are absent.

## Validation

- `npm run check` passed: lint, typechecking, and 862 tests; 62 integration tests remained intentionally skipped by their existing environment gates.
- API, indexer, and moderation migrations completed with no pending migrations.
- API, indexer, moderation, web, and all public/LAN readiness checks passed.
- Deployed API, indexer, moderation, and web images report revision `ad222b5ddb1eb62546120b6701906c2e111c9140`.
- `/signup` and `/login` return HTTP 200.
- Production CSP is present and restricts scripts/connections to self, objects and frames to none, and base/form targets to self.
- Wrong-origin signup returned HTTP 403 with a safe CSRF origin error.
- A reserved `security.subcult.tv` request returned `RESERVED_HANDLE` without contacting the PDS.
- A non-destructive invalid-invite request returned `INVALID_INVITE_CODE`; no account or invite was created or consumed.
- Public direct PDS `com.atproto.server.createAccount` returned HTTP 404.
- Independent auth review returned `DEPLOY`; independent UI source review returned `PASS` with no blocking concerns.

## Known follow-ups

- Automated browser execution was unavailable because Playwright does not provide a Chromium build for the host's Ubuntu 26.04 platform. React interaction tests and source-level UI review passed.
- Add a `name.subcult.tv` example to the login handle field and improve the generic error-dismiss button label.
- Configure PDS SMTP before offering self-service password recovery.
- The single API replica logs the ATProto OAuth client's no-lock warning; add a shared lock before horizontal API scaling.
