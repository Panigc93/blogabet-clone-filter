# Blogabet Tipsters Clone — Design Spec

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

A private clone of the blogabet.com tipsters listing page. Crawls blogabet's API to build a local PostgreSQL database of tipsters (tens of thousands, active in the last 12 months), serves the listing from the local DB (fast), and redirects clicks to the real blogabet profile pages. Shared with a small group of friends via simple password protection. 100% free hosting.

---

## Goals

- Fast tipsters listing served from our own DB (no waiting for blogabet's slow server)
- Better/simpler filters than blogabet
- Click a tipster → redirect to `https://<slug>.blogabet.com`
- Semi-private: password-protected, shared with a small group
- Zero cost: Vercel + Neon (PostgreSQL) + GitHub Actions

---

## Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14 (App Router) on Vercel |
| Database | Neon PostgreSQL (free tier, 512MB) |
| ORM | Drizzle ORM (TypeScript-first, lightweight) |
| Crawler | GitHub Actions cron job (TypeScript script) |
| Auth | Next.js middleware + httpOnly cookie |

---

## Data Model

Single table: `tipsters`

```sql
CREATE TABLE tipsters (
  id            INTEGER PRIMARY KEY,          -- blogabet internal ID
  slug          TEXT NOT NULL UNIQUE,          -- e.g. "criteriofutbol"
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  flag_url      TEXT,
  country_code  TEXT,
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  price         NUMERIC(8,2),                 -- monthly price in EUR, null if free
  since_year    SMALLINT,                     -- registration year
  picks         INTEGER NOT NULL DEFAULT 0,
  profit        NUMERIC(10,2),
  yield         NUMERIC(6,2),                 -- percentage, e.g. 12.5 = 12.5%
  verified_pct  NUMERIC(5,2),                 -- % of verified picks (0-100)
  followers     INTEGER NOT NULL DEFAULT 0,
  last_pick_at  TIMESTAMPTZ,                  -- date of last pick (for activity filter)
  reset_count   SMALLINT NOT NULL DEFAULT 0,  -- number of stat resets
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for filter/sort queries
CREATE INDEX idx_tipsters_yield        ON tipsters(yield DESC);
CREATE INDEX idx_tipsters_profit       ON tipsters(profit DESC);
CREATE INDEX idx_tipsters_picks        ON tipsters(picks DESC);
CREATE INDEX idx_tipsters_followers    ON tipsters(followers DESC);
CREATE INDEX idx_tipsters_since_year   ON tipsters(since_year);
CREATE INDEX idx_tipsters_last_pick_at ON tipsters(last_pick_at DESC);
CREATE INDEX idx_tipsters_is_paid      ON tipsters(is_paid);
```

No history table — only current stats are stored.

---

## Crawler

### Initial Full Crawl

Triggered once manually via GitHub Actions workflow dispatch.

- Uses `f[lastActive]=12` to fetch tipsters active in the last 12 months
- Paginates via `f[start]=0, 25, 50, ...` until empty response
- Upserts all records into `tipsters` table
- Estimated: tens of thousands of tipsters (exact count TBD); tipsters inactive for over 12 months are not crawled initially

### Daily Incremental Cron

Runs every day at 03:00 UTC via GitHub Actions schedule.

- Uses `f[lastActive]=1` to fetch only tipsters active in the last month
- Upserts changed records (updates stats, last_pick_at, price, etc.)
- Estimated: ~15 minutes/day, well within GitHub Actions free tier (2000 min/month)
- **Known limitation**: tipsters inactive for >1 month whose metadata changes (name, price) will not be updated until they post a pick again. Acceptable trade-off for daily crawl efficiency.

### API Endpoint

```
GET https://blogabet.com/tipsters/
  ?f[language]=all
  &f[pickType]=all
  &f[sport]=all
  &f[leagues]=all
  &f[picksOver]=0
  &f[lastActive]=1        ← 1 | 3 | 6 | 12
  &f[bookiesUsed]=null
  &f[order]=yield
  &f[start]=0             ← pagination offset, step 25
```

Authentication: session cookie injected via `BLOGABET_COOKIE` GitHub Actions secret (only used in crawler, never in Vercel).

**Page size**: 25 tipsters per request. Crawler terminates when the response returns an empty `data` array.

**Response field mapping** (to be confirmed during implementation against live API):

| API field | DB column |
|---|---|
| `id` | `id` |
| `slug` / URL subdomain | `slug` |
| `name` | `name` |
| `avatar` | `avatar_url` |
| `country.flag` | `flag_url` |
| `country.code` | `country_code` |
| `subscription.price` | `price` (null or 0 = free); `is_paid = price IS NOT NULL AND price > 0` |
| `memberSince` year | `since_year` |
| `picks` | `picks` |
| `profit` | `profit` |
| `yield` | `yield` |
| `verifiedPercent` | `verified_pct` |
| `followers` | `followers` |
| `lastPickDate` | `last_pick_at` |
| `resetCount` | `reset_count` |

Exact field names to be verified against a real API response during implementation.

### Error Handling

- On any request error (rate limit, auth failure, network timeout): log the error and abort the crawl run. The next day's cron will pick up where stats left off. Partial upserts are acceptable — the DB will have stale data for some tipsters but no corrupt state.
- If `BLOGABET_COOKIE` has expired, the job logs an auth error and fails. A human must rotate the cookie and update the GitHub Actions secret.

---

## Authentication

Simple shared-password gate — not per-user accounts.

- `SITE_PASSWORD` and `AUTH_SECRET` env vars set in Vercel
- Login page at `/login`: submits password, server action sets httpOnly cookie `auth_token` (30-day expiry)
- Cookie value: `HMAC-SHA256(key=AUTH_SECRET, message=SITE_PASSWORD)` — middleware recomputes and compares constant-time
- Next.js middleware checks cookie on all routes except `/login`; redirects to `/login` if missing/invalid
- No logout needed (cookie expires or user can clear manually)

---

## Filters & Sorting

All filtering and sorting happens in a single SQL query on the backend (Next.js API route or server component).

| Filter | Implementation |
|---|---|
| Tipo (free/pago/todos) | `WHERE is_paid = true/false` or no filter |
| Yield mínimo | `WHERE yield >= :minYield` |
| Nº picks mínimo | `WHERE picks >= :minPicks` |
| Actividad | `WHERE last_pick_at >= NOW() - make_interval(months => $1)` |
| Año registro (multi-exclusión) | `WHERE since_year NOT IN (:excludedYears)` |
| Precio/mes min-max (solo pago) | `WHERE is_paid = true AND price BETWEEN :min AND :max` (backend always enforces `is_paid = true` when price bounds are provided) |
| Ordenar por | `ORDER BY yield/profit/picks/followers/price DESC, since_year DESC` (all sorts descending; `since_year DESC` = newest registrations first) |

Pagination: 50 tipsters per page, infinite scroll (load more button).

---

## UI

Visual style closely following blogabet.com (Bootstrap 3, Fira Sans, teal `#82daca` palette).

### Filter header (`#82daca` background)
- Title: "TIPSTERS" in white 28px bold
- Filters in a responsive grid row:
  - **Tipo**: toggle buttons (Todos / Free / Pago) — white with 3px bottom border
  - **Yield mínimo**: range slider in white box with 3px bottom border
  - **Nº de picks**: bootstrap-select dropdown
  - **Actividad**: bootstrap-select dropdown (1/3/6/12 months)
  - **Año registro**: multi-exclusion chips (click to cross out/exclude)
  - **Precio/mes**: min/max number inputs (only visible when "Pago" selected)
  - **Ordenar por**: bootstrap-select dropdown

### Tipster rows (white background cards)
Each row has three sections:

1. **Left** (240px, teal left-border accent): circular avatar + name (24px bold) + blogabet URL (teal, 11px) + icon badges (verified, paid, reset count, country flag)
2. **Middle** (flex 1): 6 stats at 22.5px bold — Since, Picks, Profit, Yield, Verified%, Followers. Positive values in `#4dbfa2`, negative in `#eb6379`, neutral in `#333`
3. **Right** (150px): always same height. "VER EN BLOGABET" button (teal, centered). If paid: price display below (`9.99€ / mes`, plain text, not clickable)

Clicking any part of the row (or VER EN BLOGABET) opens `https://<slug>.blogabet.com` in a new tab.

---

## Project Structure

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              ← tipsters listing (server component)
│   ├── login/page.tsx
│   └── api/
│       └── tipsters/route.ts ← filter/sort query endpoint
├── components/
│   ├── TipsterRow.tsx
│   ├── FilterBar.tsx
│   └── LoadMore.tsx
├── crawler/
│   └── crawl.ts              ← standalone script, runs in GitHub Actions
├── db/
│   ├── schema.ts             ← Drizzle schema
│   └── index.ts              ← Neon connection
├── middleware.ts              ← auth gate
└── .github/
    └── workflows/
        ├── crawl-daily.yml
        └── crawl-full.yml    ← manual dispatch
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel | Neon **pooled** connection string (required for serverless — avoids connection exhaustion) |
| `DATABASE_URL_DIRECT` | GitHub Actions | Neon **direct** connection string (for crawler — long-lived Node process, not serverless) |
| `SITE_PASSWORD` | Vercel | Login password |
| `AUTH_SECRET` | Vercel | HMAC secret for cookie signing |
| `BLOGABET_COOKIE` | GitHub Actions secret | Session cookie for crawler |

---

## Free Tier Budget

| Service | Usage | Limit |
|---|---|---|
| Vercel | Hobby plan | Free |
| Neon | ~150MB DB | 512MB free |
| GitHub Actions | ~450 min/month (daily crawl) | 2000 min/month (private) |

---

## Out of Scope

- Individual tipster profile pages (click → redirect to blogabet)
- User accounts / per-user favorites
- Historical stats tracking
- Email/SMS notifications
- Mobile app
