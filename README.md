# Blogabet Tipsters Clone

A private, password-protected browser for Blogabet tipsters. GitHub Actions crawlers scrape tipster data and period statistics into Neon PostgreSQL; a Next.js 14 app serves a fast, filterable list and links each row back to `https://<slug>.blogabet.com`.

## Stack

- Next.js 14 App Router, React 18, TypeScript
- Drizzle ORM with `@neondatabase/serverless`
- Neon PostgreSQL
- cheerio-based crawlers, optional Playwright
- GitHub Actions for scheduled and manual crawls
- Vitest for unit tests

## Quick start

Requirements: Node.js 20 (the version used by CI), npm, a Neon database, and a Blogabet session cookie for crawlers.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the values (variable names documented in `docs/OPERATIONS.md`).

Open `http://localhost:3000`; unauthenticated requests redirect to `/login`.

## Documentation

- `AGENTS.md` — operational guide for coding agents: commands, module map, invariants, and known traps.
- `docs/ARCHITECTURE.md` — system design, data model, filters, crawlers, auth, and deployment.
- `docs/OPERATIONS.md` — local setup, crawler runbook, CI, migrations, and troubleshooting.
- `docs/superpowers/` — historical design and implementation plan from 2026-03-20. Partly stale; prefer the current docs and source code.

## Validation status

- `npm run lint` completes with warnings.
- `npx tsc --noEmit` passes.
- `npm test` passes on Linux/Node 20-22 (31 tests). It could not start in the documented Windows/Node 26 checkout because of a missing rolldown native binding.
- `.github/workflows/ci.yml` runs lint, typecheck, and tests on pushes and PRs to `master`. The crawler workflows still do not run these checks.

See `docs/OPERATIONS.md` for the exact current status and troubleshooting.
