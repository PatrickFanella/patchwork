# Phase 6 directory + volunteer onboarding (P6.1-P6.4)

This document captures the Phase 6 implementation scope for roadmap issue #41.

## Modules

- Directory record schema + fixtures: `packages/at-lexicons/src/validators.ts`
- Directory ingestion/normalization: `packages/shared/src/firehose.ts`
- Directory indexing/query filters: `packages/shared/src/discovery.ts`
- Volunteer onboarding domain store: `packages/shared/src/volunteer-onboarding.ts`
- Preference-aware routing logic: `packages/shared/src/messaging.ts`
- API volunteer/profile routes: `services/api/src/volunteer-service.ts`
- Web resource UX logic: `apps/web/src/resource-directory-ux.ts`
- Web volunteer onboarding logic: `apps/web/src/volunteer-onboarding.ts`

## P6.1 directory record ingest/index

Directory records now carry operational metadata for search and map overlays:

- `location` (approximate lat/lng + precision)
- `openHours`
- `eligibilityNotes`
- `operationalStatus`

Ingestion normalizes these into directory payloads and searchable text. Query/index behavior supports:

- category + verification status
- operational status
- optional geo radius filtering (lat/lng/radius)
- deterministic create/update/delete lifecycle handling

## P6.2 resource directory overlays + detail UX

Resource directory UX logic provides:

- overlay marker projection with minimum precision floor
- shared discovery-filter integration (`text`, `category`, `radius`)
- detail panel model with hours, eligibility, and accessible action labels
- explicit loading/error/empty/ready UI states with aria-live messaging

## P6.3 volunteer onboarding + profile management

Volunteer onboarding flow validates and persists:

- capabilities + availability
- free-text skills + availability windows
- verification checkpoint states
- matching preferences (categories, urgencies, max distance, late-night flag)

Profile upserts preserve deterministic metadata (`createdAt` on first write, `updatedAt` on changes).

## P6.4 preference-aware routing inputs

Volunteer preferences are transformed into routing candidates and fed into deterministic scoring.

### Decision effects

Preference signals influence volunteer routing by:

- boosting category-preferred candidates
- boosting urgency-preferred candidates
- filtering candidates outside `maxDistanceKm`
- adding verification checkpoint confidence bonus

### Edge cases and limits

- If all volunteers are filtered out by preferences/distance, routing falls back to existing deterministic hierarchy.
- If optional preference fields are missing, baseline Phase 5 routing behavior remains valid.
- Tie breaks remain deterministic (`priority desc`, then destination id asc).

## Test coverage

- Directory metadata normalization and query filtering
- Directory create/update/delete lifecycle propagation
- Volunteer onboarding validation + create/edit profile persistence
- Preference-aware routing candidate generation
- API-level volunteer upsert/list + preference-aware route tests
- Web UX tests for overlays, details, and accessible UI states
