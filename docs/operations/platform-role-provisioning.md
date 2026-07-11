# Platform role provisioning

Patchwork resolves authenticated platform roles from PostgreSQL. A DID without
an explicit row receives the safe `user` role. Role changes are operator-only;
the API intentionally exposes no role-management endpoint during alpha.

## Provision or change a role

Run the following through an audited PostgreSQL administration session, replacing
all three values:

```sql
INSERT INTO platform_roles (did, role, updated_by, updated_at)
VALUES ('did:plc:account', 'volunteer', 'did:plc:operator', NOW())
ON CONFLICT (did) DO UPDATE
SET role = EXCLUDED.role,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;
```

Allowed authenticated roles are `user`, `verified_user`, `volunteer`,
`moderator`, `admin`, and `super_admin`. The database rejects other values and
does not allow `anonymous` to be assigned to an authenticated DID.

## Revoke elevated access

Set the account back to `user`; do not delete the row when an explicit revocation
record is operationally useful. Confirm the result with:

```sql
SELECT did, role, updated_by, updated_at
FROM platform_roles
WHERE did = 'did:plc:account';
```

Role changes affect subsequent requests. Existing browser sessions contain only
the DID, so no logout or token replacement is required.
