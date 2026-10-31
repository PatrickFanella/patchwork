/**
 * SQL condition for an organization recipient that may receive new gifts.
 * Requires `payment_recipients r JOIN organizations o` in the query. The
 * verification check repeats the expiry test so a donation cannot slip in
 * between an approval's expiry and the hourly expiry sweep.
 */
export const eligibleOrganizationRecipientSql = `
    r.kind = 'organization'
    AND r.status = 'active'
    AND r.charges_enabled
    AND o.origin <> 'synthetic'
    AND EXISTS (
        SELECT 1 FROM verification_applications v
         WHERE v.subject_type = 'organization'
           AND v.organization_id = o.organization_id
           AND v.status = 'approved'
           AND (v.expires_at IS NULL OR v.expires_at > NOW())
    )`;
