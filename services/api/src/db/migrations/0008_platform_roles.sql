CREATE TABLE IF NOT EXISTS platform_roles (
    did TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (
        role IN ('user', 'verified_user', 'volunteer', 'moderator', 'admin', 'super_admin')
    ),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_roles_role_updated
    ON platform_roles (role, updated_at DESC);
