# Buyer-ready HTTP contract map

Updated: 2026-07-28

This is a reader-facing map of the implemented HTTP surface. Executable
validation remains in shared schemas, handler tests, and the service code.
The API advertises no production chat route.

## Common boundaries

- Authenticated commands derive the actor DID from the restored server
  session. Browser-supplied identity, role, origin, verification, and approval
  fields are not authority.
- Browser mutations require the CSRF cookie/header pair. Durable commands also
  require an `Idempotency-Key`.
- Current 18+ policy consent gates protected actions.
- New-submission and exact-exchange routes return `503` with the stable
  maintenance error while read-only mode is active.
- Errors use `{ "error": { "code", "message", "details"? } }`; safe errors
  never reflect credentials, exact coordinates, evidence, or raw moderation
  content.

## Public reads

| Method/path | Result |
| --- | --- |
| `GET /status` | Public maintenance/read-only state |
| `GET /query/map` | Ranked approximate aid markers |
| `GET /query/feed` | Ranked aid cards |
| `GET /query/directory` | Directory cards and only currently approved exact public-resource addresses |
| `GET /query/volunteers` | Public volunteer profiles and approximate service areas |
| `GET /organizations` / `GET /organizations/profile` | Public organization profiles, provenance, and non-participation labels |

Discovery records can include the server-issued `recordOrigin` value
`synthetic`, `sourced-public`, or `visitor-created`. Clients must treat an
absent value from an older server as `visitor-created`, never as synthetic.

## Identity and account

| Family | Routes |
| --- | --- |
| OAuth/session | `/auth/login`, `/auth/callback`, `/auth/session`, `/auth/refresh`, `/auth/logout` |
| Managed account | `POST /auth/signup` followed by the same OAuth flow |
| Consent/preferences | `GET /account/onboarding`, `POST /account/consent`, `GET/PUT /account/preferences` |
| Privacy rights | `GET /account/export`, `POST /account/deactivate` |

Account export labels the subject and public projections with their
server-issued origin. Showcase identities cannot invoke visitor deactivation.

## Public-record owner commands

- `POST/GET/PUT/DELETE /at/aid-posts`
- `POST/GET/PUT/DELETE /at/directory-resources`
- `POST/GET/PUT/DELETE /at/volunteer-profile`

Create/update passes the pre-publication safety gate before any PDS mutation.
Location is approximate and at least 1 km precision. Origin, verification, and
exact-address approval are never accepted from these records.

## Private product workflows

| Domain | Routes |
| --- | --- |
| Lifecycle | `/aid/post/lifecycle`, `/aid/post/transition`, assignment/response/handoff/reconcile routes |
| Organizations | `/organizations/mine`, invitations, members, roles, stewardship, audit |
| Verification | `/verification/mine`, applications, appeals, moderator decisions, exact-address request/review/decision |
| Attachments | `GET /attachments`, upload authorization, access, review, delete |
| Coordination | `/coordination/mine`, offers, offer decisions, connections, matches |
| Activity/outcomes | `/inbox`, `/inbox/read`, `/outcomes`, `/outcomes/mine` |
| Notifications | `/notifications`, read/read-all/archive, email confirmation, push subscription/revocation |
| Exact exchange | `/location/session`, `/location/consent`, `/location/signal`, `/location/revoke` |

Exact-location signaling contains authorization/session and encrypted signaling
material only. Exact latitude/longitude is never an accepted server field.

## Safety and operator routes

- `POST /blocks` and `POST /reports` are session-owned user safety commands.
- Moderator worker routes expose queue, safe review, policy action, appeals,
  and audit only to configured internal/API capability boundaries.
- `GET /maintenance`, `POST /maintenance/declare`, and
  `POST /maintenance/resume` require `maintenance_mode:manage`; resume is
  audited and cannot override an environment shutdown.

## Explicit absence

`/chat/initiate`, `/chat/messages`, and any equivalent production mutation are
not registered or advertised. `/chat` is a web-only, non-mutating placeholder.
