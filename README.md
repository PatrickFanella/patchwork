# Patchwork

Patchwork is a full-stack mutual aid platform built on the AT Protocol. I designed it as a portfolio project to demonstrate practical product engineering across frontend, backend, data flow, moderation, testing, and deployment.

## What this project demonstrates

- Building a **TypeScript monorepo** with shared contracts across multiple services
- Delivering a **React + Vite + Tailwind** web experience backed by Node.js services
- Designing **API, indexing, and moderation workflows** for a trust-aware platform
- Using **Vitest, Playwright, and CI quality gates** to keep changes reliable
- Shipping with **Docker, PostgreSQL, and production-minded deployment patterns**

## Technical strengths

- **Frontend:** React 19, Vite, Tailwind CSS, TypeScript
- **Backend:** Node.js services for API, indexing, and moderation
- **Architecture:** Shared packages, typed schemas, deterministic fixtures, service boundaries
- **Quality:** Unit tests, browser E2E tests, type checking, linting, automated CI
- **Operations:** Dockerized builds, health checks, deployment workflow, security scanning

## Why it matters

This project highlights the kind of engineering work I enjoy most: building polished user-facing experiences, backing them with well-structured services, and supporting them with strong testing and operational discipline. It reflects hands-on experience with modern JavaScript tooling, systems thinking, and product-focused delivery.

## Repository overview

- `apps/web` — frontend application
- `services/api` — query, chat, and volunteer flow APIs
- `services/indexer` — ingestion and indexing pipeline
- `services/moderation-worker` — moderation and trust-safety workflows
- `packages/shared` — shared contracts, configuration, and utilities

For deeper architecture details, see `docs/architecture`.
