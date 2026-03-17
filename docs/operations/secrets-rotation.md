# Secrets Rotation Workflow

This document describes how to rotate secrets used by the Patchwork
deployment.

## Inventory of secrets

| Secret                       | Used by                       | Source           |
| ---------------------------- | ----------------------------- | ---------------- |
| `PATCHWORK_POSTGRES_PASSWORD`| postgres, patchwork-api       | `.env` on host   |

## Pre-requisites

- SSH access to the deployment host.
- The deployment uses `docker-compose.yml` with a `.env` file in the same
  directory.
- A maintenance window (rotation requires a brief restart).

## Rotation steps

### 1. Generate a new password

```bash
NEW_PW=$(openssl rand -base64 32)
echo "New password: $NEW_PW"
```

### 2. Update Postgres role

Connect to the running Postgres container and alter the role:

```bash
docker compose exec postgres \
  psql -U patchwork -c "ALTER ROLE patchwork PASSWORD '${NEW_PW}';"
```

### 3. Update the `.env` file

Replace the old value:

```bash
sed -i "s|^PATCHWORK_POSTGRES_PASSWORD=.*|PATCHWORK_POSTGRES_PASSWORD=${NEW_PW}|" .env
```

### 4. Restart dependent services

```bash
docker compose up -d patchwork-api
```

The API container will re-read `API_DATABASE_URL` (which references
`PATCHWORK_POSTGRES_PASSWORD`) on startup.

### 5. Verify

```bash
docker compose exec patchwork-api \
  node -e "fetch('http://localhost:4000/xrpc/_health').then(r=>r.json()).then(console.log)"
```

Confirm the health check returns a successful status.

## Rollback

If the new password fails:

1. Restore the previous `.env` value.
2. Run `docker compose up -d patchwork-api` to restart with the old
   password.
3. The Postgres role still has the new password; reset it with
   `ALTER ROLE` using the old password while connected via the Postgres
   container's local socket (which uses `trust` auth by default for the
   `postgres` superuser).

## Testing rotation locally

```bash
# Start the dev stack
npm run db:up

# Rotate
docker compose -f docker-compose.postgres.yml exec postgres \
  psql -U patchwork -c "ALTER ROLE patchwork PASSWORD 'rotated';"

# Update connection string and verify the API still connects
PATCHWORK_POSTGRES_PASSWORD=rotated npm run dev:api:postgres
```

## Schedule

Rotate `PATCHWORK_POSTGRES_PASSWORD` at least once every 90 days or
immediately after any suspected credential exposure.
