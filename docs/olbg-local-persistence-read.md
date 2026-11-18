# OLBG local persistence and complete read-path proposal

17 November 2026. New block after independently reviewed b5ce77e. Base remains dafaa1617578cb06534340f3660fd5f4b988e8a2, fetched again at 20:18 CET. This is not production enablement.

## What is now connected locally
The existing SSR page, API, count, sorting, filters, LoadMore and TipsterRow can read OLBG monthly evidence in a disposable PGlite database. The existing selector gets one OLBG option only when BOTH `OLBG_LOCAL_REVIEW=1` and `USE_PGLITE=1`. The switch cannot enable OLBG against Neon. Default behavior excludes OLBG rows and does not query its proposed tables. The existing B2I period context, active audit loader and continuation-anchor contract remain underneath the new context unchanged.

No new application route or statistics panel. Warnings use the existing filter-warning area only when a filter cannot use OLBG's unknown all-time/free-paid values, or evidence is unavailable. The computed-period notes remain inside existing cells.

## Evidence and storage proposal
- `OlbgMonthlyRecord` stores public global All Tips months, published monthly ROI, LSP, competition profit, strike rate, numeric profile identity, source month and capture receipt separately. It stores no aggregate source ROI and does not persist derived results as source facts.
- Runtime validation rejects wrong identities/hosts/paths, mixed calendar labels, duplicate or future months, negative/unsafe counts, unexpected keys, invalid percentages and oversized records. Record derivation is the same function used by the previously reviewed preparation.
- `OLBG_LOCAL_SCHEMA` proposes two tables: immutable-by-workflow monthly snapshots keyed by profile ID and capturedAt, plus one active pointer per ID referencing that exact pair. DDL is a string outside the migration directory. It was executed only in disposable local tests. The application never provisions it.
- A canonical retained-record SHA256 is stored and checked on read. This verifies the retained monthly record, NOT the original HTTP bytes. The original HTTP-byte limitation remains exactly as before.
- `planOlbgPersistence` produces a transaction proposal, not a production executor. Existing allocated catalog surrogate is required; source numeric ID is never used as surrogate. It detects same-capture content conflict, no-op replay and older capture. A production writer still needs row locking, state readback, row-count checks, bounded transaction, rollback/unknown-outcome handling and execution authority. Its preconditions are explicit. It must not be used as an unchecked batch of statements.
- Active reads join the active pointer to its exact snapshot and inspect only current-month candidates, not retained history. Record corruption, missing tables or query failure masks OLBG figures, never falls back to catalog scalars. Status is surfaced.

## Projection, filters, ranking and dates
- All-time picks, profit, yield, verification, followers, since, price and account-type values are masked for OLBG. Internal catalog defaults are not interpreted as data. API represents unknown values as null. Card displays dashes rather than assigning a closed period to all-time.
- Complete derived 3/6/12-month windows are computed from disjoint global months at read time. Missing month or zero denominator remains null. Six-month picks average exists only for a complete six-month window.
- The SAME expressions drive SELECT, WHERE, ORDER BY and count before LIMIT/OFFSET. Own period sorts work; unknown all-time values sort last. Total-yield/picks and free/paid filters exclude unknown OLBG records rather than comparing internal zero/default values. The warning explains this.
- Projection composes over B2I's existing masks and preserves its audit object. B2I's modules, index, manifest storage and periodAnchor/409 implementation were not changed.
- Freshness uses the captured source month, conservatively masked on UTC month rollover, matching the existing continuation boundary. The exact OLBG timezone/cutoff is not established by this work and must not be advertised as known.
- Local-review reads also check active evidence revision. A continuation older than a newer same-month capture returns409. An active-index change during SELECT invalidates the response rather than returning a differently sorted partial page. SSR refreshes on that race. This extra check runs only when OLBG local review is enabled. High-frequency concurrent refresh behavior still needs production-scale review; no automated refresh was enabled.

## Validation
- 485 Vitest tests passed, 8 opt-in real-PostgreSQL tests skipped; all run tests passed. Includes disposable PostgreSQL-compatible SQL tests for proposed storage, immutable conflict/replay/rollback, retained-record checksum corruption, source/month validation, SQL-vs-card values, null-vs-zero, missing June, negative returns, count/filter alignment, ranking before pagination, source-capture identity, B2I preservation and rollover.
- TypeScript and Next production build passed with the previously documented NEXT_IGNORE_INCORRECT_LOCKFILE=1 switch. Existing lint warnings remain. No package/lockfile edits.
- Real local HTTP smoke with disposable seed: three real OLBG pilot captures plus four explicitly synthetic other-platform controls. Enabled:3OLBG,7combined. Disabled:0OLBG,4controls, no OLBG selector. All four older platform views respond normally. Unknown total filter returns zero OLBG with warning. Old-month continuation returns409; same-month stale evidence anchor is also checked. API contains no source receipt hashes, byte sizes, file paths or account fields.
- Actual application inspected as pixels at390and1280: existing filters/cards, readable period notes, no horizontal overflow. Screenshots are local review, not production. Last two small changes added only server-side revision checks, not visual styling.

## Remaining gates
1. Independent review of this new block, separate from b5ce77e.
2. A production-ready persistence executor and schema-change plan, including catalog allocation/upsert policy, conflict and transaction-outcome handling. No such executor is enabled here.
3. Scale/performance review of validated active-record transfer into the SQL recordset and the extra revision check, plus sustained-refresh/SSR retry behavior. Only three OLBG pilots were exercised end-to-end. No867-profile performance claim.
4. Explicit production activation/import authority, fresh source validation and approved collection scope. The current gate intentionally cannot enable Neon. No real schema migration, database write, push, PR, merge, deployment or mass capture happened.
5. Keep comparisons labeled own calculated approximate fixed-stake yield. The unexplained historical differences from OLBG's published ROI remain unexplained.

## Reproduce disposable review
With no DATABASE_URL or DATABASE_URL_DIRECT in the environment, build the app, run `npx tsx scripts/seed-olbg-local-review.ts`, then `node scripts/smoke-olbg-local.mjs`. The seed creates a new temporary database. The smoke creates ephemeral local authentication material without printing it, starts a local app server, checks both flag states, takes screenshots and closes the server. Use LOCAL_CHROMIUM only if selecting an installed browser executable; OLBG_REVIEW_ARTIFACT_DIR selects screenshot output. Neither script accesses user accounts or makes network requests to OLBG.
