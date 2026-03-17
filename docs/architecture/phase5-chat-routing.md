# Phase 5 chat triage and routing (P5.1-P5.4)

This document captures the Phase 5 implementation scope for roadmap issue #41.

## Modules

- Shared chat domain + rules: `packages/shared/src/messaging.ts`
- Shared Phase 5 tests: `packages/shared/src/messaging.test.ts`
- API chat adapter: `services/api/src/chat-service.ts`
- API route wiring: `services/api/src/index.ts`
- API Phase 5 tests: `services/api/src/phase5.test.ts`
- Web chat UX state model: `apps/web/src/chat-ux.ts`
- Web chat UX tests: `apps/web/src/chat-ux.test.ts`

## P5.1 post-linked 1:1 initiation

`createPostLinkedChatContext` builds deterministic 1:1 conversation context from map/feed/detail surfaces.

Key behaviors:

- Validates participant identity (`did:*`) and post URI (`at://...`).
- Rejects self-chat and unauthorized initiation attempts.
- Produces deterministic conversation URI from `(aidPostUri, sorted participants)`.
- Persists request context metadata for source surface (`map | feed | detail`).

## P5.2 deterministic routing assistant

`DeterministicRoutingAssistant` selects destination in strict deterministic priority order:

1. Post author
2. Volunteer pool
3. Verified resource
4. Manual fallback

Rule output includes:

- Stable `matchedRule`
- Ordered scored candidates
- Machine-readable reasons
- Human-readable rationale

Tie-breakers are deterministic (`priority desc`, then `destinationId asc`).

## P5.3 metadata persistence + recipient capability fallback

`ConversationMetadataStore` persists conversation metadata records (`app.patchwork.conversation.meta`) and keeps them queryable by:

- Conversation URI
- Aid post URI
- Fallback-required subset

Capability handling:

- Transport path resolves to `atproto-direct`, `resource-fallback`, or `manual-fallback`.
- Missing AT-native capability emits explicit user-safe fallback notice.

## P5.4 safety controls and abuse protections

`ChatSafetyControls` provides:

- Participant block controls
- Conversation mute controls
- Keyword abuse flagging with moderation signal hooks
- Sliding-window rate limiting with explicit user feedback
- Moderation report creation (`app.patchwork.moderation.report`) with emitted review signals

## API routes added

- `GET /chat/initiate`
- `GET /chat/route`
- `GET /chat/conversations`
- `GET /chat/safety/evaluate`
- `GET /chat/safety/block`
- `GET /chat/safety/mute`
- `GET /chat/safety/report`
- `GET /chat/safety/signals/drain`

## Test coverage

- Deterministic initiation and authorization rejection
- Fixture-driven routing decisions and tie-break determinism
- Capability fallback persistence/query behavior
- Block/mute/report/keyword/rate-limit safety scenarios
- API-level initiation paths from map + feed
- Web UX-level fallback notice and error/success state transitions
