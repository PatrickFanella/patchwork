# Test pruning audit

Date: 2026-07-10

## Decision

The standard suite was reduced from 1,988 passing tests to 754, a reduction of 1,234 tests (62%). The retained suite protects the current alpha and its safety-critical boundaries. Tests were deleted rather than hidden behind a legacy command.

## Why the suite reached nearly 2,000 tests

The abandoned project implemented future-wave features as parallel prototypes in three layers: shared domain models, in-memory API services, and web UX state models. Each layer repeated large matrices for groups, matching, scheduling, notifications, verification, organizations, reputation, mobile, tenancy, connectors, multi-region behavior, and staged delivery. Historical Phase 3–8 suites then repeated portions of the same fixture contracts.

## Removed corpus

| Category | Examples | Tests removed |
| --- | --- | ---: |
| Expansion domain/API/web prototypes | groups, matching, scheduling, notifications, verification, organizations, reputation | 952 |
| Historical phase/load/staging suites | Phase 3–8, pilot E2E fixtures, load profiles, progressive/staging checks | 236 |
| Contract-only native mobile tests | API model, navigation model, offline model, push model | 46 |
| **Total** | 55 test files | **1,234** |

Expansion source code remains typechecked. It is not considered release-protected behavior and should be deleted or rebuilt with real persistence and integration tests during the Phase 8 expansion decision.

## Retained protection

- AT lexicons, OAuth adapter, aid-post wire encoding, CRUD and stable errors;
- encrypted OAuth/session persistence and browser-session revocation;
- lifecycle state rules, authorization, ownership, command idempotency and audit;
- privacy redaction and public geography constraints;
- discovery, ranking, firehose normalization and indexer checkpoints;
- messaging safety and moderation queue behavior;
- API perimeter basics, database migrations and durable operational repositories;
- web alpha posting, discovery, chat, auth, accessibility and browser keyboard behavior;
- PostgreSQL/HTTP integration, direct service integration, and Chromium E2E.

## Minimum-suite rule

A new test must protect at least one distinct behavior, failure mode, persistence boundary, authorization boundary, external protocol contract, or browser interaction. Tests that merely restate a type, fixture constant, or the same behavior at another in-memory layer should not be added.
