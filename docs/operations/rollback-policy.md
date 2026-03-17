# Rollback Policy -- Immutable Versioning & Safe Rollback (#109)

## Immutable Image Tagging

All deployable artifacts use immutable tags in the format:

```
<semver>-<git-sha-short>
```

Example: `0.9.0-a1b2c3d`

### Tag Rules

1. **Never overwrite tags.** Once an image is tagged, that tag is permanent.
2. **Tags are derived from source.** The semver comes from `BUILD_VERSION`, the
   SHA from `git rev-parse --short=7 HEAD`.
3. **OCI labels** are embedded in every image for traceability:
   - `org.opencontainers.image.revision` -- git SHA
   - `org.opencontainers.image.version` -- semver
   - `org.opencontainers.image.ref.name` -- branch name
   - `com.patchwork.ci.run-id` -- CI run ID
   - `com.patchwork.service` -- service name

### Generating Tags

```bash
# Print the current tag
make image-tag

# Build all images with immutable tags
make image-build

# Build with a custom version
make image-build BUILD_VERSION=1.0.0
```

## One-Command Rollback

To roll back a service to a previously-deployed tag:

```bash
make rollback SERVICE=api ROLLBACK_TAG=0.9.0-a1b2c3d
```

This command:
1. Locates the specified image tag in the local registry
2. Re-tags it as the deployment target
3. Restarts the service with the previous version

### Rollback Policy Defaults

| Parameter | Value |
|-----------|-------|
| Retained versions | 5 |
| Rollback window | 1 hour after deploy |
| Requires approval | No (auto for listed triggers) |
| Auto-rollback triggers | SLO burn exceeded, error rate spike, health check failure, smoke test failure |

See `DEFAULT_ROLLBACK_POLICY` in `packages/shared/src/versioning.ts`.

## Database Migration Rollback

Migrations are classified into three rollback strategies based on their
characteristics:

### 1. Backward-Compatible (Preferred)

**When:** Migration is additive only -- new columns, new tables, no drops.

**Rollback procedure:**
- Roll back the application to the previous version.
- The previous app version can run against the new schema.
- No schema rollback needed.

**Example:** Adding a new nullable column, creating a new index.

### 2. Separate Rollback Migration

**When:** Migration has a paired down-migration script.

**Rollback procedure:**
1. Run the down-migration: `npm run db:migrate:down -w @patchwork/api`
2. Verify data integrity.
3. Roll back the application.

**Example:** Renaming a column with both up and down migrations.

### 3. Manual DBA (Emergency Only)

**When:** Migration involves destructive schema changes (DROP, irreversible renames).

**Rollback procedure:**
1. **ALWAYS** take a database snapshot before applying.
2. If rollback is needed, restore from the pre-migration snapshot.
3. Roll back the application.
4. DBA must verify data consistency.

**Example:** Dropping a table, removing a column with data.

### Migration Classification

Use `classifyMigrationRollback()` from `packages/shared/src/versioning.ts` to
programmatically determine the rollback strategy:

```typescript
import { classifyMigrationRollback } from '@patchwork/shared';

const guidance = classifyMigrationRollback({
    hasDropStatements: false,
    hasRenameStatements: false,
    hasDownMigration: true,
});
// guidance.strategy === 'separate-rollback-migration'
// guidance.safeRollback === true
```

## Release Notes Template

Every release should include artifact and version references:

```markdown
## Release v0.9.0

### Artifacts
- API: `patchwork-api:0.9.0-a1b2c3d`
- Indexer: `patchwork-spool:0.9.0-a1b2c3d`
- Moderation: `patchwork-thimble:0.9.0-a1b2c3d`
- Web: `patchwork-web:0.9.0-a1b2c3d`

### Git
- Commit: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
- Branch: main
- CI Run: https://github.com/org/repo/actions/runs/12345

### Migrations
- `001_add_verification_table.sql` (backward-compatible, safe rollback)

### Rollback
To roll back all services:
\`\`\`bash
make rollback SERVICE=api ROLLBACK_TAG=<previous-tag>
make rollback SERVICE=spool ROLLBACK_TAG=<previous-tag>
make rollback SERVICE=thimble ROLLBACK_TAG=<previous-tag>
make rollback SERVICE=web ROLLBACK_TAG=<previous-tag>
\`\`\`
```

---

*Tracks #109. Part of Wave 4, Lane 1: Release Environment & Promotion.*
