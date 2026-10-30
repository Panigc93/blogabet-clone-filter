# Operations

This is the practical runbook for local development, the crawlers, CI, and deployment. For design details, read `docs/ARCHITECTURE.md`.

## Prerequisites

- Node.js 20 recommended. This matches `.github/workflows/*.yml`; the local checkout used for this documentation had Node 26 and could not start Vitest because of a missing native binding.
- npm with the committed `package-lock.json`. Do not use yarn, pnpm, or bun.
- Network access for the app's CDN assets and, when crawling, for `blogabet.com` and `*.blogabet.com`.
- A Neon PostgreSQL database.
- A valid Blogabet session cookie for crawlers.

## Local setup

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`; unauthenticated requests redirect to `/login`.

Copy `.env.example` to `.env.local` (or create `.env.local` yourself) with these keys (names only; never commit values):

```dotenv
DATABASE_URL=
DATABASE_URL_DIRECT=
SITE_PASSWORD=
AUTH_SECRET=
BLOGABET_COOKIE=
```

Where they are used:

- `DATABASE_URL` — Next.js app (`db/index.ts`) and `_query.mts`. Use the pooled/HTTP Neon URL for serverless.
- `DATABASE_URL_DIRECT` — all `crawler/*` scripts and `drizzle.config.ts`. Use the direct Neon URL.
- `SITE_PASSWORD` — login action and middleware.
- `AUTH_SECRET` — HMAC key for the auth cookie.
- `BLOGABET_COOKIE` — catalog and stats crawlers only.

`.gitignore` ignores `.env*.local`, so `.env.local` is ignored. It does not ignore a plain `.env`; do not create or commit one.

## Validation commands

Run these before claiming a change is verified.

| Command | What it checks | Known state (2026-10-25) |
|---|---|---|
| `npm run lint` | Next.js ESLint | Exit 0; 7 warnings (5 exhaustive-deps in `FilterBar`, 2 `<img>` warnings in `TipsterRow`). |
| `npx tsc --noEmit` | TypeScript strict check | Exit 0. |
| `npm test` | Vitest unit tests | Passes on Linux/Node 22 (31 tests, verified 2026-10-30). Cannot start in the documented Windows/Node 26 checkout: missing `@rolldown/binding-win32-x64-msvc`. |
| `npm run build` | Production build | Identified, not executed. |
| `npm run start` | Serve a production build | Identified, not executed; requires `npm run build`. |

Do not report "tests pass" unless `npm test` actually completes. The current checkout has 31 test cases across `tests/lib/auth.test.ts`, `tests/lib/query.test.ts`, `tests/lib/parse.test.ts`, and `tests/crawler/transform.test.ts`; the historical plan in `docs/superpowers/` says 17.

### Fixing the validation failures (when explicitly asked)

- Vitest: use Node 20 and `npm ci`. The lockfile declares `@rolldown/binding-win32-x64-msvc`, but it is absent in this checkout. Reinstalling dependencies modifies `node_modules`, so do it only when the task allows it.
- Build: run `npm run build`; it may need the app environment variables.

## Crawler runbook

The catalog and stats crawlers touch real external services and the real database unless you point `DATABASE_URL_DIRECT` at a disposable database. Do not run them casually.

Examples below use POSIX `VAR=value command` syntax. In PowerShell use `$env:LAST_ACTIVE='1'; npx tsx crawler/crawl.ts`; in `cmd.exe` use `set LAST_ACTIVE=1 && npx tsx crawler/crawl.ts`. The same applies to `MIN_PICKS` and `USE_PLAYWRIGHT`.

### Catalog crawl

Daily-lite (active in the last month):

```bash
LAST_ACTIVE=1 npx tsx crawler/crawl.ts
```

Full (active in the last 12 months):

```bash
LAST_ACTIVE=12 npx tsx crawler/crawl.ts
```

Requirements:

- `DATABASE_URL_DIRECT`
- `BLOGABET_COOKIE`
- Optional `USE_PLAYWRIGHT=1` to use Chromium instead of plain `fetch`

What happens:

1. Resumes from `crawler/.checkpoint-{1|12}` if it exists.
2. Fetches pages from `https://blogabet.com/tipsters/`, parses `.tipster-block`, and upserts by tipster ID.
3. Deletes older rows with the same slug but a different ID.
4. Saves the checkpoint after each page and deletes it on success.
5. Retries failed fetches/upserts up to 8 times with 2s, 4s, ... waits; sleeps 300 ms between pages.

Operational notes:

- `LAST_ACTIVE=1` sets `last_pick_at = now` for every crawled tipster. It is an activity proxy used by the stats crawler, not the real last-pick date.
- `LAST_ACTIVE=12` leaves new rows with `last_pick_at = null`; existing rows keep their previous value because the upsert uses `COALESCE`.
- If the process is interrupted, rerunning resumes from the checkpoint. To force a restart, delete the relevant checkpoint file only after confirming that is intended.
- `crawler/crawl.ts` does not auto-load `.env.local`; export the variables in the shell or set them in the environment.

### Stats crawl

```bash
npx tsx crawler/stats.ts
```

Optional minimum picks:

```bash
MIN_PICKS=100 npx tsx crawler/stats.ts
```

Requirements:

- `DATABASE_URL_DIRECT`
- `BLOGABET_COOKIE`

What happens:

1. Selects tipsters with `last_pick_at >= now - 1 month` (and `picks > MIN_PICKS` if set), ordered by ID.
2. Resumes from `crawler/.checkpoint-stats` if it exists.
3. Scrapes `https://{slug}.blogabet.com/blog/stats` for each tipster.
4. Parses all-time and paid archive tabs; uses only closed months.
5. Writes `picks_6m_avg`, `yield_3m`, `yield_6m`, `yield_12m`, free-pick stats, and `stats_updated_at`.
6. Clears period stats for tipsters inactive for more than one month.
7. Retries fetches/updates up to 3 times; sleeps 300 ms between tipsters.

Important checkpoint behavior:

- The checkpoint is deleted only when `errors === 0`.
- If any tipster errored, the checkpoint is saved at the end of the list. A later run resumes at the end and will not retry the failed tipsters.
- To retry failures, delete `crawler/.checkpoint-stats` (ask before doing this against production) and rerun.

Stats can legitimately be missing:

- The tipster has no archive rows.
- The tipster has no picks in the relevant closed months.
- The tipster is inactive (`last_pick_at` null or older than one month).
- The stats page markup changed.

### Cleanup and diagnostics

```bash
# Null period stats for tipsters inactive for more than one month.
npx tsx crawler/cleanup.ts

# Count active/inactive tipsters with/without yield_6m.
npx tsx crawler/check-stats.ts

# Inspect up to five rows matching a slug.
npx tsx crawler/check-tipster.ts <slug>

# Paid/activity counts.
npx tsx crawler/count.mts

# Ad-hoc local queries through db (requires DATABASE_URL).
npx tsx _query.mts
```

The crawler helper scripts (`stats.ts`, `cleanup.ts`, `count.mts`, and `check-*.ts`) load `.env.local` themselves. On Windows, `new URL(...).pathname` yields `/C:/...` and `existsSync` returns false, so the loader is skipped. Export variables in the shell or run the scripts under WSL/Linux.

## CI and secrets

### GitHub Actions

`crawl-daily.yml`:

- Schedule: `0 3 * * *` (03:00 UTC) and manual dispatch.
- Node 20, `npm ci`, 360-minute timeout.
- Catalog crawl with `LAST_ACTIVE=1`, up to 3 attempts with 60s waits.
- Stats crawl, up to 3 attempts with 30s waits.
- The stats step can finish green even after three failures because the loop ends with `sleep 30`. Always inspect the log.

`crawl-full.yml`:

- Manual dispatch only.
- Node 20, `npm ci`, 120-minute timeout.
- Catalog crawl with `LAST_ACTIVE=12`; no stats crawl.

Required repository secrets:

- `DATABASE_URL_DIRECT`
- `BLOGABET_COOKIE`

The workflows do not run lint, typecheck, or tests. A green workflow validates only the crawler run.

### Vercel

The app is Vercel-oriented (`vercel.json`). Expected environment variables:

- `DATABASE_URL`
- `SITE_PASSWORD`
- `AUTH_SECRET`

`vercel.json` declares aliases `superblogabet.vercel.app` and `blogabet-clone-filter.vercel.app`. Deployment is not performed by this documentation.

### Cookie rotation

When crawls fail with authentication/HTTP errors:

1. Obtain a fresh `BLOGABET_COOKIE` from a logged-in Blogabet session.
2. Update the GitHub Actions secret.
3. Do not put the cookie in the repo, any env template, logs, or the Vercel app.
4. Rerun the workflow and check both the catalog and stats logs.

## Database and migrations

Current state:

- `db/schema.ts` is the source of truth for application code.
- `drizzle/0000_sudden_jazinda.sql` creates the base table.
- `drizzle/0001_add_last_reset_at.sql` and `drizzle/0002_add_is_verified.sql` exist but are missing from `drizzle/meta/_journal.json`.
- No migration creates `picks_6m_avg`, `yield_3m`, `yield_6m`, `yield_12m`, `picks_free_3m_avg`, `yield_free_3m`, or `stats_updated_at`.

Therefore:

- Do not run `npx drizzle-kit migrate` expecting the live database to match `db/schema.ts`.
- Do not run `npx drizzle-kit generate` and commit a migration without reviewing the diff and the live schema.
- Before any migration work, back up or snapshot the database and verify the live columns with a read-only query.
- Migrations and `db/schema.ts` are not to be edited together with live-DB changes unless the task explicitly asks for it.

### Adding `is_verified`

`drizzle/0002_add_is_verified.sql` adds the account-verification column:

```sql
ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "is_verified" boolean DEFAULT false NOT NULL;
```

Apply it **before** deploying code that selects `is_verified`; otherwise Drizzle `select()` fails. Existing rows default to `false` until the next catalog crawl fills the badge. The separate `verified_pct` column is the percentage of verified picks, not account verification.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `npm test` fails with `Cannot find native binding` / `@rolldown/binding-win32-x64-msvc` | Optional native dependency missing; Node 26/Windows checkout | Use Node 20 (CI version) and `npm ci`; do not delete `package-lock.json` as the error suggests. |
| Infinite scroll shows different results than page 1 | SSR and API parse filters separately | Check both `app/page.tsx` and `app/api/tipsters/route.ts`; the API once omitted `resetOlderThan`. |
| Tipsters repeat while scrolling | Unstable ordering on tied sort values, or stale `LoadMore` state after a filter change | Both queries must use `sortOrder()` (`id DESC` tiebreaker); `LoadMore` must be keyed by `searchString`. |
| Every tipster shows the verified tick | UI used `verifiedPct`; `is_verified` is missing or not populated | Apply `0002_add_is_verified.sql`, deploy the parser/UI change, then run a catalog crawl. |
| App redirects every request to `/login` | Missing/wrong `SITE_PASSWORD` or `AUTH_SECRET`, or stale cookie | Check env vars; clear the `auth_token` cookie and log in again. |
| App crashes at startup with a database error | `DATABASE_URL` missing or wrong | Set the pooled Neon URL in the app environment. |
| Crawler exits with `BLOGABET_COOKIE is not set` / auth errors | Missing or expired cookie | Export the cookie locally or rotate the GitHub secret. |
| Stats are all null after a full crawl | New rows have `last_pick_at = null`; stats only processes recently active rows | Run a daily catalog crawl (`LAST_ACTIVE=1`) first, then stats. |
| Stats crawl reports errors and subsequent runs skip tipsters | Checkpoint saved at the end with `errors > 0` | Inspect the log, then delete `crawler/.checkpoint-stats` and rerun. |
| Workflow is green but stats did not run | Stats loop swallows three failures | Read the step log; check cookie/network/DB. |
| Local helper script ignores `.env.local` on Windows | URL pathname becomes `/C:/...` | Export env vars in PowerShell or use WSL/Git Bash. |
| `.env.local` not found by `crawler/crawl.ts` | That script has no dotenv loader | Export variables in the shell. |

### Filter-parser regressions

`app/page.tsx` and `app/api/tipsters/route.ts` parse filters independently. A filter can work on page 1 and silently stop applying on infinite scroll. To diagnose:

1. Call `/api/tipsters` with the same query params plus `search=<slug>` and compare it with the SSR result.
2. Compare the filter objects in both files; a missing field means the API ignores that filter.
3. Add the field to the API, add a `buildFilters` test, and manually verify the API parser with a request. `tests/lib/query.test.ts` does not cover either parser.

This is how the `resetOlderThan` bug was found: `ditales57` had `lastResetAt = 2026-07-18` but appeared on API page 1 because the API omitted the filter.

## Do not run without explicit request

- Any crawler against the production database or Blogabet.
- `drizzle-kit migrate` or schema-changing SQL.
- Vercel/GitHub deployment or secret updates.
- Dependency installation or lockfile changes.
- Cleanup of tracked runtime files or `.next`/`node_modules`/coverage artifacts.
