# Architecture

## Overview

This is a private, password-protected clone of the Blogabet tipsters listing. It does not host picks or profiles: it crawls Blogabet into a local database, serves a faster/filterable list, and sends the user back to `https://<slug>.blogabet.com`.

The project has three runtime pieces:

1. A Next.js 14 app (Vercel-oriented; server components plus one JSON API route).
2. A Neon PostgreSQL database accessed through Drizzle ORM.
3. GitHub Actions jobs that scrape Blogabet and write to the same database.

```text
GitHub Actions (crawlers)
  crawl.ts  ── scrapes blogabet.com/tipsters/ ──┐
  stats.ts  ── scrapes {slug}.blogabet.com ─────┤
                                                v
                                        Neon PostgreSQL
                                                ^
                                                │
Browser ── Next.js middleware ── app/page.tsx ──┘
   │                                │
   └── /login                       └── /api/tipsters (public, paginated JSON)
```

## Runtime topology

| Layer | Technology | Notes |
|---|---|---|
| UI/API | Next.js `14.2.35`, React 18, App Router | Vercel-oriented; `vercel.json` declares aliases. |
| Data access | Drizzle ORM + `@neondatabase/serverless` | HTTP driver. No connection pool in app code. |
| Database | Neon PostgreSQL | Single `tipsters` table. |
| Catalog crawler | TypeScript + cheerio (+ optional Playwright) | Scrapes HTML, not a JSON API. |
| Stats crawler | TypeScript + cheerio | Scrapes each tipster's public stats page. |
| Automation | GitHub Actions | Daily incremental crawl and manual full crawl. |
| Auth | HMAC cookie checked in middleware | Shared password, no user accounts. |
| Tests | Vitest 4 | Node environment, no database integration tests. |

## Repository map

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Server-rendered listing; reads URL search params, queries the first 50 rows and total count. |
| `app/api/tipsters/route.ts` | JSON endpoint for infinite scroll; same filters and page size, `page` offset. |
| `app/layout.tsx` | Root layout; Fira Sans, Bootstrap 3, Font Awesome 4.7, global CSS. |
| `app/login/page.tsx` | Server action that validates the shared password and sets the cookie. |
| `app/login/LoginForm.tsx` | Client form with password visibility toggle. |
| `components/FilterBar.tsx` | All filter controls; changes the URL and resets pagination. |
| `components/TipsterRow.tsx` | One tipster card: identity, all-time stats, period stats, outbound links. |
| `components/LoadMore.tsx` | IntersectionObserver-based infinite scroll; appends rows from the API. |
| `lib/query.ts` | `TipsterFilters`, `buildFilters`, `SortField`, `sortColumn`. |
| `lib/auth.ts` | Web Crypto HMAC-SHA256 signing/verification helpers. |
| `middleware.ts` | Auth gate and route exclusions. |
| `db/schema.ts` | Drizzle table definition and inferred types. |
| `db/index.ts` | Neon HTTP connection from `DATABASE_URL`; exports `db`. |
| `crawler/crawl.ts` | Catalog crawler: HTML parser, upsert, checkpoints, retries, optional Playwright. |
| `crawler/stats.ts` | Stats crawler: archive parser, period calculations, stale-stat cleanup. |
| `crawler/cleanup.ts` | Nulls period stats for inactive tipsters. |
| `crawler/check-stats.ts` | Diagnostic counts of active/inactive tipsters with/without stats. |
| `crawler/check-tipster.ts` | Prints the DB row(s) matching a slug. |
| `crawler/count.mts` | Ad-hoc paid/activity counts. |
| `_query.mts` | Ad-hoc local query script; imports `db` and therefore `DATABASE_URL`. |
| `.github/workflows/crawl-daily.yml` | Daily catalog + stats run. |
| `.github/workflows/crawl-full.yml` | Manual 12-month catalog run. |
| `tests/` | Vitest unit tests for auth, filter building, and HTML parsing. |
| `docs/superpowers/` | Historical spec/plan (2026-03-20); not an up-to-date description. |

## Request lifecycle

### Server-rendered list

`app/page.tsx`:

1. Parses `searchParams` into `TipsterFilters`.
2. Calls `buildFilters()` and `sortColumn()` from `lib/query.ts`.
3. Runs two queries in parallel: the first 50 rows and a `count()` with the same `where`.
4. Orders with raw SQL `DESC NULLS LAST` so null yields/profits sort last.
5. Renders `FilterBar`, the initial rows, and `LoadMore` with `hasMore` and the serialized query string.

The page is dynamic because it reads `searchParams`. There is no caching layer and no history table; every request reads current rows.

### Infinite scroll

`components/LoadMore.tsx`:

- Starts at page 1 because the server already rendered page 0.
- Calls `/api/tipsters?<searchString>&page=N` when its sentinel enters the viewport (`rootMargin: 400px`).
- Appends `json.data` and stops when the API returns `hasMore: false`.
- Uses refs to avoid duplicate fetches from the observer.

`app/api/tipsters/route.ts` repeats the filter parsing, applies `limit(50).offset(page * 50)`, and returns `{ data, page, hasMore }`. The duplication is a maintenance hazard; keep it in sync with `app/page.tsx`.

### Auth flow

- `/login` posts a server action; the action compares the submitted password with `SITE_PASSWORD`.
- On success it sets `auth_token` to `HMAC-SHA256(key=AUTH_SECRET, message=SITE_PASSWORD)`, `httpOnly`, `sameSite=lax`, `secure` in production, 30-day expiry.
- `middleware.ts` verifies the cookie for every matched route and redirects invalid requests to `/login`.
- `/login`, `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`, and `/api/tipsters` are excluded from the matcher.
- There is no logout endpoint; the cookie expires or the user clears it.

## Data model

Single table: `tipsters` (`db/schema.ts`). No history table; only current values are stored.

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Blogabet internal ID. |
| `slug` | text unique | Subdomain, e.g. `criteriofutbol`. |
| `name` | text | Display name. |
| `avatar_url` | text | Blogabet CDN URL. |
| `flag_url` | text | Country flag URL. |
| `country_code` | text | Scraper writes `null`; UI only uses it as alt text. |
| `is_paid` | boolean | Derived from price/plan text during scraping. |
| `price` | numeric(8,2) | Monthly EUR price; null for free. |
| `since_year` | smallint | Registration year. |
| `picks` | integer | All-time picks. |
| `profit` | numeric(10,2) | All-time profit. |
| `yield` | numeric(6,2) | All-time yield percentage. |
| `verified_pct` | numeric(5,2) | Verified picks percentage. |
| `followers` | integer | Followers. |
| `last_pick_at` | timestamptz | Activity proxy, not the real last-pick timestamp. |
| `reset_count` | smallint | Number of stat resets. |
| `last_reset_at` | timestamptz | Parsed from the reset tooltip when a date is present. |
| `updated_at` | timestamptz | Last catalog upsert. |
| `picks_6m_avg` | numeric(7,2) | Average picks per month in closed months in the 6-month window. |
| `yield_3m` | numeric(6,2) | Weighted yield over closed months in the 3-month window. |
| `yield_6m` | numeric(6,2) | Weighted yield over closed months in the 6-month window. |
| `yield_12m` | numeric(6,2) | Weighted yield over closed months in the 12-month window. |
| `picks_free_3m_avg` | numeric(7,2) | Free-pick average for paid tipsters, 3 closed months. |
| `yield_free_3m` | numeric(6,2) | Free-pick yield for paid tipsters, 3 closed months. |
| `stats_updated_at` | timestamptz | Last stats update; nulled when stats are cleared. |

Indexes are defined for yield, yield6m, picks6mAvg, profit, picks, followers, sinceYear, lastPickAt, and isPaid.

Drizzle exposes `numeric` columns as strings. Code converts at the UI/query boundary; tests assert string values such as `price === '9.99'`.

### Migration drift

The schema is ahead of the migration files:

- `drizzle/0000_sudden_jazinda.sql` creates the base table and indexes only.
- `drizzle/0001_add_last_reset_at.sql` exists but is not listed in `drizzle/meta/_journal.json`.
- No migration creates the period-stat columns (`picks_6m_avg`, `yield_3m`, `yield_6m`, `yield_12m`, `picks_free_3m_avg`, `yield_free_3m`, `stats_updated_at`).
- The live database may have been altered manually. Do not assume `drizzle-kit migrate` makes a fresh database match `db/schema.ts`.

## Filters and sorting

All filters live in `lib/query.ts` and are passed from both the page and the API.

| URL param | `TipsterFilters` field | SQL behavior |
|---|---|---|
| `search` | `search` | `ILIKE '%term%'` on name or slug. |
| `tipo=all\|free\|paid` | `tipo` | `is_paid` true/false, or no filter. |
| `minYield` / `maxYield` | `minYield` / `maxYield` | `yield >=` / `yield <=`. |
| `minPicks` | `minPicks` | `picks >=`. |
| `activity=1\|3\|6\|12` | `activityMonths` | `last_pick_at >= now - N months`. |
| `minYears=N` | `minYears` | `since_year <= currentYear - N`. |
| `priceMin` / `priceMax` | `priceMin` / `priceMax` | Forces `is_paid=true`, plus price bounds. |
| `conPicksFree=1` | `conPicksFree` | `picks_free_3m_avg IS NOT NULL AND > 0`. |
| `resetOlderThan=1` | `resetOlderThan` | `last_reset_at IS NULL OR < now - 6 months`. |
| `sort=...` | `sort` | Defaults to `yield`. |
| `page=N` | API only | Offset page, 50 rows per page. |

Sort fields: `yield`, `profit`, `picks`, `followers`, `since_year`, `price`, `yield6m`, `yield12m`, `picks6m_avg`. Unknown sort values fall back to `yield`.

Known inconsistency: `app/page.tsx` parses `resetOlderThan`, but `app/api/tipsters/route.ts` does not. When the reset filter is active, SSR results and infinite-scroll results can disagree. Fix both sides if you touch this area.

## Crawlers

### Catalog crawl (`crawler/crawl.ts`)

Purpose: keep the `tipsters` table populated with current list data.

Flow:

1. Reads `BLOGABET_COOKIE` and `DATABASE_URL_DIRECT`; fails fast if missing.
2. Reads `LAST_ACTIVE` (default `1`) and optional `USE_PLAYWRIGHT=1`.
3. Loads a checkpoint from `crawler/.checkpoint-{lastActive}` if present.
4. Requests `https://blogabet.com/tipsters/` with Blogabet filters (`f[lastActive]`, `f[start]`, etc.) and browser-like headers.
5. Parses `.tipster-block` elements with cheerio:
   - ID from `showFollowBox('...')`.
   - Slug from `https://{slug}.blogabet.com`.
   - Name, avatar, flag, six stats, reset tooltip, price/plan text.
6. Before upserting a page, deletes rows with the same slug but a different ID (account reset/re-registration).
7. Upserts by `id`; `last_pick_at` uses `COALESCE(excluded.last_pick_at, tipsters.last_pick_at)`.
8. Advances `start` by the number of returned records and saves the checkpoint.
9. Clears the checkpoint on successful completion.

Reliability details:

- Retries each page/upsert up to 8 attempts with linear backoff (`attempt * 2s`).
- Sleeps 300 ms between pages.
- Optional Playwright mode launches Chromium and injects the cookie pairs into a browser context, then uses `ctx.request.get`. The default path is plain Node `fetch`.
- `parseBlocks()` is exported for tests; a direct-execution guard prevents importing the module from starting the crawl.
- `country_code` is always `null`; the crawler does not extract it.
- `is_paid` is heuristic: it detects a price (`9.99€`) or special plan text in the subscribe area. HTML changes can break it.
- `last_pick_at` is set to `new Date()` only when `LAST_ACTIVE <= 1`. For `LAST_ACTIVE=12`, new rows get `null`; existing rows keep their old value thanks to `COALESCE`. This field is a proxy for "recently crawled", not the actual last pick date.

### Stats crawl (`crawler/stats.ts`)

Purpose: compute per-period performance from each tipster's public stats page.

Flow:

1. Reads `BLOGABET_COOKIE` and `DATABASE_URL_DIRECT`; optional `MIN_PICKS` (default `0`).
2. Selects tipsters with `last_pick_at >= now - 1 month`, optionally `picks > MIN_PICKS`, ordered by ID.
3. Loads `crawler/.checkpoint-stats` (`offset`, `done`, `errors`).
4. For each tipster, requests `https://{slug}.blogabet.com/blog/stats?_={timestamp}` with an `X-Requested-With: XMLHttpRequest` header (the endpoint is XHR-only) and the Blogabet cookie.
5. Parses archive tables:
   - All-time rows from `#alltimeStatsTab`; falls back to unscoped rows for free tipsters.
   - Paid rows from `#paidStatsTab`.
   - The parser uses column 0 (hidden Unix month timestamp), column 1 (picks), column 4 (yield %), and column 6 (stake average); it ignores the rounded profit column.
6. Keeps only closed months: timestamps strictly before the first day of the current month.
7. Builds 3/6/12-month windows from calendar cutoffs, not "last N rows".
8. Computes weighted yields from reconstructed profit (`yieldPct / 100 * picks * stakeAvg`) and total stakes.
9. Computes `picks6mAvg` as total picks divided by the number of months with data in the 6-month window (not a fixed divisor of 6).
10. For paid tipsters, derives free stats by subtracting the paid tab from all-time rows for the last 3 closed months.
11. Upserts the period columns and `stats_updated_at`.
12. After the loop, nulls period stats for tipsters with `last_pick_at` null or older than one month.

Reliability details:

- Retries each fetch/update up to 3 attempts with linear backoff (`attempt * 2s`).
- Sleeps 300 ms between tipsters.
- Saves the checkpoint every 100 tipsters and at the end.
- The checkpoint is deleted only when `errors === 0`. If any error occurred, it is saved at `allTipsters.length`; a later run resumes at the end and does not retry the failed tipsters. Delete `crawler/.checkpoint-stats` to force a full retry (ask before doing this in a real environment).
- `parseStatsHtml()` is exported; `crawlStats()` is guarded by `import.meta.url`.
- There is no unit test for the stats parser yet.

### Helper scripts

| Script | Purpose | Env |
|---|---|---|
| `crawler/cleanup.ts` | Nulls period stats for inactive tipsters. | `DATABASE_URL_DIRECT` |
| `crawler/check-stats.ts` | Counts active/inactive tipsters with/without `yield_6m`. | `DATABASE_URL_DIRECT` |
| `crawler/check-tipster.ts <slug>` | Prints up to five matching DB rows. | `DATABASE_URL_DIRECT` |
| `crawler/count.mts` | Paid/activity counts. | `DATABASE_URL_DIRECT` |
| `_query.mts` | Ad-hoc local queries via `db`. | `DATABASE_URL` |

`stats.ts`, `cleanup.ts`, `count.mts`, and the check scripts contain a small `.env.local` loader. It uses `new URL('../.env.local', import.meta.url).pathname`; on Windows this produces `/C:/...`, so `existsSync` returns false. They fall back to process environment variables. `crawl.ts` has no such loader.

### CI workflows

`crawl-daily.yml`:

- Cron `0 3 * * *` (03:00 UTC) and manual dispatch.
- Node 20, `npm ci`, 360-minute timeout.
- Catalog crawl with `LAST_ACTIVE=1`, retried up to 3 times with 60-second waits; exits non-zero after the third failure.
- Stats crawl retried up to 3 times with 30-second waits. The loop has no trailing failure check, so after three failures the step can still finish green. Inspect logs.

`crawl-full.yml`:

- Manual dispatch only; Node 20; 120-minute timeout.
- Catalog crawl with `LAST_ACTIVE=12`.
- Does not run the stats crawler.

Neither workflow runs lint, typecheck, or tests.

## Auth

- Shared password, not per-user accounts.
- `SITE_PASSWORD` and `AUTH_SECRET` are required at runtime.
- Cookie name: `auth_token`; value is the hex HMAC of the password.
- Verification rejects tokens whose length is not 64 and compares bytes in constant time.
- `middleware.ts` excludes `/login` and `/api/tipsters`; the API is publicly reachable.
- No CSRF token beyond `sameSite=lax`; no logout route.

## Environment and deployment

| Variable | Consumer | Purpose |
|---|---|---|
| `DATABASE_URL` | `db/index.ts`, `_query.mts` | Neon pooled/HTTP URL for the Next.js app. |
| `DATABASE_URL_DIRECT` | `crawler/*`, `drizzle.config.ts` | Neon direct URL for crawlers and Drizzle Kit. |
| `SITE_PASSWORD` | login action, middleware | Shared site password. |
| `AUTH_SECRET` | login action, middleware | HMAC key for the auth cookie. |
| `BLOGABET_COOKIE` | catalog/stats crawlers | Blogabet session cookie. |
| `LAST_ACTIVE` | `crawler/crawl.ts` | `1` for daily, `12` for full. |
| `USE_PLAYWRIGHT` | `crawler/crawl.ts` | Set to `1` to use Chromium request context. |
| `MIN_PICKS` | `crawler/stats.ts` | Optional minimum all-time picks filter. |

There is no `.env.example`. `.gitignore` ignores `.env*.local` but not `.env`; never create or commit a plain `.env`.

Deployment notes:

- `vercel.json` aliases `superblogabet.vercel.app` and `blogabet-clone-filter.vercel.app`.
- Expected Vercel environment variables: `DATABASE_URL`, `SITE_PASSWORD`, and `AUTH_SECRET`.
- GitHub Actions needs `DATABASE_URL_DIRECT` and `BLOGABET_COOKIE` secrets.
- `BLOGABET_COOKIE` expires; rotate the GitHub secret when crawls start failing authentication.

## Known limitations and drift

- `resetOlderThan` works in SSR but not in the paginated API.
- `tests/lib/query.test.ts` still references `excludeYears`; typecheck fails.
- Vitest cannot start in the documented Windows/Node 26 checkout because the rolldown native binding is missing. This is an environment issue, not proof that the tests fail logically.
- Migrations do not describe the current table; see "Migration drift".
- `country_code` is never populated.
- The catalog crawler depends on Blogabet HTML selectors; changes to the listing markup can silently drop fields or tipsters.
- `last_pick_at` is a crawl-time proxy; do not treat it as the exact last pick date.
- The stats parser depends on the archive table structure and hidden timestamps.
- The API is public even though the UI is password-protected.
- The daily stats step can fail without turning the workflow red.
- `all.min.css`, `app/page.module.css`, and `app/fonts/Geist*.woff` are not referenced by code. `crawler/stats-crawl.log` is tracked runtime output.

## Confidence and unknowns

Verified from source: routes, schema, filters, crawler behavior, workflow steps, and the command results recorded in `AGENTS.md` (2026-10-25).

Not verified:

- The live Neon schema and whether it contains every column in `db/schema.ts`.
- Whether the deployed Vercel app and aliases are current.
- Whether `BLOGABET_COOKIE` is valid and whether the scheduled jobs are succeeding.
- Whether the public `/api/tipsters` endpoint is an intentional product decision.
- Whether `npm test` and `npm run build` pass under Node 20 with a clean `npm ci`.

Treat `docs/superpowers/` as historical design material, not as the current contract.
