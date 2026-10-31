# AGENTS.md

Private Blogabet tipster browser. A GitHub Actions crawler scrapes blogabet.com into Neon PostgreSQL; a password-protected Next.js 14 app serves a fast, filterable tipster list and links back to `https://<slug>.blogabet.com`.

Read this file first. Deeper context:

- `docs/ARCHITECTURE.md` — system design, data model, filters, crawlers.
- `docs/OPERATIONS.md` — setup, commands, runbook, troubleshooting.
- `docs/superpowers/` — historical design/plan from 2026-03-20. It is partially stale; trust the code and the two docs above.

## Stack and conventions

- Next.js 14 App Router, React 18, TypeScript strict, Drizzle ORM, `@neondatabase/serverless`, cheerio, optional Playwright.
- npm only (`package-lock.json`). Do not introduce yarn, pnpm, or bun.
- No Tailwind and no `src/`. Styling is inline styles plus `app/globals.css`; Bootstrap 3 and Font Awesome 4.7 load from CDNs.
- Match existing style: no semicolons, single quotes, 2-space indentation.
- Next 14 uses synchronous `searchParams`/`params`. Do not apply Next 15 async patterns.
- Drizzle `numeric` columns are exposed as strings. Convert explicitly with `Number()`/`String()`.

## Commands

| Command | Status (verified 2026-10-25) |
|---|---|
| `npm ci` | CI install command; not run locally in this checkout. |
| `npm run dev` | Identified, not executed. |
| `npm run lint` | Executed: exit 0, 7 warnings. |
| `npx tsc --noEmit` | Executed: exit 0. |
| `npm test` | Executed on Linux/Node 22 (2026-10-30): exit 0, 69 tests. Blocked in the documented Windows/Node 26 environment by a missing native binding. |
| `npm run build` / `npm start` | Identified, not executed. |
| `npm run test:watch` | Identified, not executed. |

Crawler and helper commands (all identified, not executed here):

```bash
# Catalog crawl. LAST_ACTIVE=1 daily-lite, LAST_ACTIVE=12 full.
npx tsx crawler/crawl.ts

# Per-tipster period stats. MIN_PICKS is optional.
npx tsx crawler/stats.ts

# Null period stats for tipsters inactive for more than one month.
npx tsx crawler/cleanup.ts

# Diagnostics.
npx tsx crawler/check-stats.ts
npx tsx crawler/check-tipster.ts <slug>
npx tsx crawler/count.mts
npx tsx _query.mts
```

Drizzle commands are identified but not executed. Migrations are out of sync with the schema; read the migration warning below before running anything.

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Architecture map

- `app/page.tsx` — SSR listing, first 50 rows, URL search params, total count.
- `app/api/tipsters/route.ts` — paginated JSON used by infinite scroll.
- `components/FilterBar.tsx` — client filter controls; URL is the state; debounces search 400 ms and numeric fields 800 ms.
- `components/LoadMore.tsx` — IntersectionObserver infinite scroll, page 1 onward; keyed by `searchString` so filter changes reset its state.
- `components/TipsterRow.tsx` — row rendering, all-time stats plus period stats.
- `lib/query.ts` — `buildFilters`, `sortColumn`, and `sortOrder` (with optional direction).
- `lib/parseFilters.ts` — shared URL-param parsing/validation for the SSR page and `/api/tipsters`.
- `lib/csv.ts` — CSV column definitions and escaping for the export.
- `lib/compare.ts` / `lib/compareClient.ts` — `/comparar` slug validation and the localStorage compare selection.
- `app/comparar/page.tsx` — side-by-side comparison table with best-value highlighting.
- `app/top-mys/page.tsx` + `lib/mysScore.ts` — Top MYS: transparent composite ranking over the global MYS pool (free, >=100 picks, yield >=11%, active 3m). Documented heuristic, not an edge claim; category/league scopes not covered by the data model.
- `db/schema.ts` / `db/index.ts` — single `tipsters` table; Neon HTTP client from `DATABASE_URL`.
- `crawler/crawl.ts` — scrapes the `/tipsters/` HTML, upserts rows, checkpoints, retries, optional Playwright.
- `crawler/stats.ts` — scrapes `https://{slug}.blogabet.com/blog/stats`, computes closed-month stats, clears inactive rows.
- `middleware.ts`, `lib/auth.ts`, `app/login/*` — shared-password HMAC cookie auth.
- `.github/workflows/crawl-daily.yml`, `.github/workflows/crawl-full.yml` — crawler automation.

Data flow:

1. `middleware.ts` checks the auth cookie for every route except `/login` and `/api/tipsters`.
2. `app/page.tsx` queries Neon through Drizzle, renders rows, and passes the URL params to `FilterBar` and `LoadMore`.
3. `LoadMore` calls `/api/tipsters?<same params>&page=N` and appends rows.
4. The daily GitHub Actions workflow runs the catalog crawl and then the stats crawl; the full workflow runs only the catalog crawl. All of them write to the same `tipsters` table.

## Data and filter rules

- Page size is 50 in both `app/page.tsx` and `app/api/tipsters/route.ts`.
- Default sort is `yield`; all sorts use `DESC NULLS LAST` plus `id DESC` as a deterministic tiebreaker.
- Filters: `search`, `tipo`, `minYield`, `maxYield`, `minPicks`, `activity`, `minYears`, `priceMin`, `priceMax`, `sort`, `dir`, `conPicksFree=1`, `resetOlderThan=1`, `verified=1`.
- `dir` is `asc` or omitted (default `desc`, the legacy behavior); ascending order uses `ASC NULLS LAST` with an `id ASC` tiebreaker.
- `/api/tipsters` also accepts `format=csv`: same filters/sort, up to 1000 rows, with a truncation notice line and a `tipsters-N-de-M.csv` filename. It exports only columns already visible in the UI plus `stats_updated_at` freshness metadata.
- `/comparar?slugs=a,b,c` renders a side-by-side comparison of up to 4 tipsters. Selection lives in the browser (localStorage key `cf-compare-v1`) via `components/CompareToggle.tsx` and `components/CompareTray.tsx`; slug validation is in `lib/compare.ts`.
- The "Preselección MYS" FilterBar button is only a shortcut that applies `tipo=free&minPicks=100&minYield=11`; it is a prefilter and does not validate MYS compliance.
- `activity` uses `lastPickAt`; `minYears` uses `sinceYear <= currentYear - N`.
- `resetOlderThan=1` means `lastResetAt IS NULL OR lastResetAt < now - 6 months`.
- `verifiedPct` is the percentage of verified picks from the listing; it is not account verification. The account badge uses `isVerified`, parsed from the `.icons` verified tooltip.
- `conPicksFree=1` requires `picksFree3mAvg > 0`; price filters force `isPaid=true`.
- When adding a filter or sort, update `TipsterFilters`/`SortField` and `buildFilters`/`sortColumn` in `lib/query.ts`, then both `app/page.tsx` and `app/api/tipsters/route.ts`, plus `components/FilterBar.tsx`.
- SSR (`app/page.tsx`) and `/api/tipsters` parse filters separately. Add new filters to both. `resetOlderThan` was once missing from the API and caused infinite-scroll mismatches.
- Period stats use closed calendar months only; the current month is excluded. `picks6mAvg` averages months with data inside the window, not a fixed divisor.
- The daily catalog crawl sets `lastPickAt = now` for crawled tipsters. It is an activity proxy, not the real date of the last pick.

## Known traps

- `npm test` currently cannot start here: `@rolldown/binding-win32-x64-msvc` is missing. CI uses Node 20; this checkout uses Node 26. Do not claim tests pass until they actually run.
- `tests/lib/query.test.ts` covers `buildFilters` and `sortOrder`, not the SSR/API parsers. A filter can still be parsed on one side and missed on the other.
- Migrations are out of sync: `db/schema.ts` has stats columns, `lastResetAt`, and `isVerified`; `drizzle/0000_sudden_jazinda.sql` does not. `drizzle/0001_add_last_reset_at.sql` and `drizzle/0002_add_is_verified.sql` exist but are absent from `drizzle/meta/_journal.json`, and no migration creates the stats columns. Do not run `drizzle-kit migrate` expecting the live DB to match the schema.
- Apply `drizzle/0002_add_is_verified.sql` before deploying code that selects `is_verified`; Drizzle `select()` will fail if the column is missing. Existing rows default to `false` until the next catalog crawl.
- `crawler/stats.ts`, `crawler/cleanup.ts`, `crawler/count.mts`, and `crawler/check-*.ts` auto-load `.env.local` using `new URL(...).pathname`. On Windows that becomes `/C:/...`, so `existsSync` is false. `crawler/crawl.ts` does not auto-load `.env.local` at all.
- The stats step in `crawl-daily.yml` can end green after three failures because the last command in its loop is `sleep 30`. Check the workflow log, not just the job status.
- CI does not run lint, typecheck, or tests. A green crawl workflow does not validate the app.
- `.gitignore` ignores `.env*.local` but not `.env`. Never create or commit a plain `.env` file or any secret.
- `all.min.css`, `app/page.module.css`, and `app/fonts/Geist*.woff` are not referenced by the code. `crawler/stats-crawl.log` is a tracked runtime log. Leave them alone unless the task is explicitly about cleanup.
- `README.md` previously was the create-next-app scaffold. The current README is a real project overview; keep it short.

## Do not edit without explicit request

- `.env.local`, any secret, or `.env`-style file.
- `package-lock.json` or dependency versions.
- `drizzle/` migrations and `db/schema.ts` together with live-DB changes.
- `.github/workflows/` (secrets and production crawlers live there).
- Generated or local artifacts: `.next/`, `node_modules/`, `coverage/`, `*.tsbuildinfo`, `crawler/.checkpoint-*`.

Do not run crawlers, migrations, or deployments against the real services unless the user explicitly asks. Prefer reading code and using the fixture-based unit tests.

## E2E offline (fixtures, sin Neon real ni Blogabet)
`tests/e2e/run.sh` corre las dos suites E2E contra un mock del protocolo HTTP de Neon
(`tests/e2e/mock-neon.mjs` + `verify.mjs` 26 checks + `verify2.mjs` 22 checks).
Parchea `db/index.ts` temporalmente (se revierte solo; nunca commitear el parche).
Detalles y requisitos en `tests/e2e/README.md`.
