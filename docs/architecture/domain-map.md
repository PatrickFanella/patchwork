# Domain map (Phase 1 baseline)

This map defines bounded contexts, ownership, and primary interface boundaries for v1.

| Domain               | Primary owner service                 | Key records/interfaces                   | Notes                                                    |
| -------------------- | ------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Identity             | `services/api`                        | DID auth/session contracts               | Web clients only interact through API boundary           |
| Aid records          | `services/api`, `services/indexer`    | Query contracts + ingestion events       | API writes/query surface; indexer normalizes/searches    |
| Geo                  | `services/indexer`                    | Approximate-area and geo index contracts | No exact coordinate exposure in public APIs              |
| Ranking              | `services/indexer`                    | Ranked feed/map response contracts       | Deterministic ranking pipeline boundary                  |
| Messaging            | `services/api`                        | 1:1 chat initiation/request contracts    | Moderation hooks via async events                        |
| Moderation           | `services/moderation-worker`          | Review queue + policy/audit contracts    | Isolated async worker boundary with appeal lifecycle     |
| Directory            | `services/indexer`                    | Resource directory index/query contracts | Consumed by API responses                                |
| Volunteer onboarding | `services/api`                        | Volunteer profile + preference contracts | Integrated into deterministic routing inputs (Phase 6)   |
| Anti-spam            | `services/api`                        | Chat safety evaluation + metrics         | Duplicate/rate burst controls and suspicious signaling   |
| Privacy              | `packages/shared`, `services/indexer` | Geoprivacy + log redaction contracts     | Enforces approximate coordinates and minimal diagnostics |

## Anti-corruption boundaries

- External ATproto SDK/data models are adapted at service edges before entering domain contracts.
- Shared contract types live in `packages/shared/src/contracts.ts`.
- Shared env/config validation lives in `packages/shared/src/config.ts`.
