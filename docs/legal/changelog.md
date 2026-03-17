# Policy Changelog

All material changes to Patchwork's legal and policy documents are recorded
here. Each entry includes the date, affected document(s), and a summary of
the change.

---

## Version History

### v1.0.0 -- [DATE]

**Initial publication of all policy documents.**

| Document                                            | Change           |
| --------------------------------------------------- | ---------------- |
| [Terms of Service](./terms-of-service.md)           | Initial release  |
| [Privacy Policy](./privacy-policy.md)               | Initial release  |
| [Community Guidelines](./community-guidelines.md)   | Initial release  |
| [Acceptable Use Policy](./acceptable-use-policy.md) | Initial release  |

Key decisions for v1.0.0:

- Minimum age set to 16.
- Moderation log retention set to 7 days (aligned with
  `MODERATION_LOG_RETENTION_DAYS` in `packages/shared/src/privacy.ts`).
- Geo-privacy minimum precision enforced at 1 km (aligned with
  `PUBLIC_MIN_PRECISION_KM`).
- Graduated enforcement model: warning, delist, suspend-visibility, account
  suspension.
- Appeal process with two escalation levels and Governance Board as final
  authority.
- AT Protocol federation disclosure included in privacy policy and terms.

---

## Change Process

Policy changes follow this process:

1. **Proposal** -- A change is proposed via pull request updating the relevant
   document(s) and this changelog.
2. **Review** -- Trust & Safety and Product Management review the change (see
   [RACI matrix](../operations/raci.md) -- row 21: Legal/privacy compliance
   review).
3. **Approval** -- Trust & Safety lead and Product Management approve the
   change.
4. **Notice period** -- Material changes are communicated to users at least 30
   days before taking effect.
5. **Effective date** -- The change takes effect on the published date. The
   "Last updated" field in each document is updated accordingly.

---

*This changelog tracks: [Terms of Service](./terms-of-service.md) |
[Privacy Policy](./privacy-policy.md) |
[Community Guidelines](./community-guidelines.md) |
[Acceptable Use Policy](./acceptable-use-policy.md)*
