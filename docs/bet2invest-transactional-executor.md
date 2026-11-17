# Bet2Invest transactional executor (local candidate, 2026-11-17)

This change is not a production activation. No remote adapter, Neon connection,
workflow, cron, migration or UI change is included. Starting point: `4be0801`.

## Contract

`crawler/platforms/bet2invest/execute-offline-import.ts` exports
`executeOfflineImport(db, { rows, capturedAt, runId })`. Importing it has no
side effects. A caller must supply an authorized database adapter. Its
`transaction(callback)` must pin one connection, begin a transaction, commit
only after the callback succeeds, and roll back on any error. The executor
awaits the transaction result, not just the individual SQL statements.

- At most 1000 input rows. Empty input does not open a transaction.
- Duplicate/empty slugs, wrong platform/slug identity, invalid or inconsistent
  capture timestamps fail before any transaction.
- One transaction locks `tipsters` in SHARE ROW EXCLUSIVE mode with NOWAIT,
  reads only the requested Bet2Invest identities, obtains ids using
  `nextval('tipsters_internal_id_seq')`, calls the existing pure
  `planOfflineImport`, and writes its tipsters and validation-log entries.
- Only genuinely new valid rows consume ids. Fixture ids are replaced, never
  persisted. Existing rows retain their identity. Sequence values are checked
  against the negative internal range and the schema's 32-bit integer limit.
- All SQL values are bound parameters. Updates require id + platform + slug
  and exactly one returned id. Other platforms' rows are never updated.
- Row decoding uses the explicit shared column map. Regex camelization would
  lose digit-bearing names such as `yield_3m` and `picks_free_3m_avg`.
- Quarantine, parse errors, unselected bankrolls and stale/equal captures
  follow the existing planner. Quarantine does not refresh any row timestamps.
- A newer null window replaces the old window. Other absent values keep the
  existing value according to the existing merge policy.
- A failed statement rolls back the ENTIRE batch, including validation logs.
  PostgreSQL sequence gaps after rollback are expected and are not duplicates.
- Replaying a capture is row-idempotent, but records another validation-log
  attempt. `runId` is an audit label, not an exactly-once constraint.

## Capture time is not import time

The input rows' capturedAt and statsUpdatedAt must equal the supplied original
capture time. The executor does not recalculate windows or relabel old data as
current. The local report records executedAt separately. Window figures are
still as-of the original capture month. The database's existing schema has no
separate calculation-time column. A future reader/UI freshness policy remains
outside this executor and must be settled before presenting old windows as
current.

Window coverage, bets and caveats remain in the source rows and the local
report's windowAudit. They are not persisted in new database columns, and this
change does not claim to display them in the filter. No new schema was added.

## Locking limitations before production

The table lock protects lookup + insert against writers outside this executor.
NOWAIT refuses an already-held conflicting lock instead of queueing behind a
crawler. During a successful transaction it DOES block writes on the whole
tipsters table, including Blogabet. Readers are not blocked. The 1000-row cap
is a work bound, NOT a lock-duration guarantee.

Before any production use, configure a bounded transaction policy in the future
adapter and confirm it against the target environment. Independent-session
contention has now been tested on isolated PostgreSQL 14.24 (details below).
Do not assume a local duration predicts Neon behavior. The older PGlite
concurrency test proves only safe replay under its single-connection
serialization. A lock refusal or unique conflict must abort and roll back;
a future caller may retry the complete batch.

## Reproduce without any remote service

```sh
npm ci
npx tsc --noEmit
npx vitest run
npx tsx scripts/bet2invest-local-transaction.ts /path/to/b2i-full 2026-11-17T16:27:00Z /tmp/local-report.json
```

The local CLI always constructs an in-memory PGlite instance and applies real
migrations 0000-0005 to it. It accepts no URL, credential or environment-based
connection. It imports the complete corpus, compares all stored numeric
figures and capturedAt to the plan, replays it, and verifies byte-identical
sentinel rows for Blogabet, Tipstrr and Golazobets with a colliding slug. Its
JSON report includes source counts, transaction/replay counts, timings,
validation classes and window audit evidence. The in-memory database closes
at the end.

Automated tests cover insert, replay, older/newer captures, derived nulls,
absent fields with digit-bearing columns, unchanged other platforms,
quarantine/nonselection/parse logs, rollback during log and later row writes,
recovery after rollback, input validation and SQL parameter binding. The
separate import test prevents accidental network/credential side effects.

## Real PostgreSQL contention and timeout evidence (2026-11-17)

`tests/crawler/bet2invest-postgres-local.test.ts` is opt-in. By default the
ordinary suite skips its six tests. It rejects TCP/URL destinations and
accepts only a dedicated `/tmp/b2i-local-pg-*` Unix socket and fixed local test
database. `pg` and its types were added as development dependencies only.
The harness initializes a new disposable cluster with trust authentication
on a mode-700 local directory, no TCP listener, and stops/removes it on exit.
It does not install a service or use DATABASE_URL.

With PostgreSQL server binaries available locally:

```sh
PG_BIN=/path/to/postgresql/bin PG_SHARE=/path/to/postgresql/share \
  bash scripts/test-bet2invest-postgres-local.sh /path/to/b2i-full
```

Omit the capture directory to run just the five short contention tests.
The shared-files directory must contain postgres.bki. The harness needs
initdb, pg_ctl, postgres and the psql client. These are local prerequisites,
not resources the script downloads or provisions.

Observed on PostgreSQL 14.24 with three distinct backend PIDs:

- Existing Blogabet writer: import refuses with SQLSTATE 55P03 (NOWAIT),
  rolls back and leaves no new tipster. Local elapsed time: 90 ms.
- Held import lock: independent SELECT succeeds; independent Blogabet UPDATE
  reaches a 100 ms statement_timeout with SQLSTATE 57014. It succeeds again
  after the import commits (test rolls that sentinel change back).
- Timeout during validation logging after an INSERT: 75 ms statement timeout
  raises 57014; both tipster and log writes roll back, lock releases, retry
  succeeds. Local measured failure: 87 ms.
- Whole-batch cooperative budget: two individually short SQL operations cross
  a 100 ms budget; adapter aborts and rolls back (143 ms measured). Checks run
  between operations. This is NOT a native hard transaction_timeout. PG14
  does not provide that setting. The test adapter also sets per-statement and
  idle-in-transaction limits. A future deployment adapter must own cancellation,
  disconnect cleanup and the selected limits; none is wired to production.
- Full corpus: 961 entries, 958 inserts and 3 nonselected logs. All stored
  numeric figures and capture dates match the plan. Replaying gives 958
  freshness skips, zero inserts/updates and 3 nonselected logs. The initial
  transaction measured 194 ms, the observed lock interval was at most 179 ms,
  and replay measured 90 ms. Other platforms' sentinel rows are unchanged.

These numbers are one local run, not a production latency guarantee. Parsing
all captures takes about 86 seconds here and occurs BEFORE the transaction.
The signed numeric zero check deliberately uses numeric equality: PostgreSQL
normalizes a textual -0.00 to zero without changing the numeric value.

## Coverage/as-of retention proposal (not implemented)

No schema migration or UI change is needed for either of these options:

1. Preferred immediate audit artifact: extend the existing immutable JSON
   report envelope with schemaVersion, code revision, input manifest/hash,
   capturedAt, executedAt and exact window start/end month bounds per window.
   Keep its existing per-slug bets/months/reason/caveats. Retain it as a private
   versioned artifact keyed by runId and content hash, not just temporary disk.
   A future read-only CLI can index it by platform + slug + capturedAt without
   touching the operational database. It is not a transactionally atomic DB
   record, so publication must distinguish committed from attempted imports
   and handle failed artifact delivery. Current reports are evidence, not a
   durable production retention service.
2. If SQL lookup is essential: reserve an explicit success-audit class such as
   window-audit-v1 in the EXISTING import_validation_log table, storing a
   versioned JSON payload in reason and the original capturedAt/runId fields.
   Write it in the same transaction as each successful row. The payload can
   include window boundaries, bets, months, caveats, original capture time and
   import execution time. No column or migration is needed. This overloads a
   table currently documented for rejected/skipped validation, increases row
   count, and requires reviewing existing log consumers so success audit is
   never displayed as an error. Indexing/retention and historical lookup cost
   would need review. Do not implement it silently as a validation failure.

Do NOT store JSON in sourcePortfolioId or any existing financial/statistic
column, and do not repurpose capturedAt as import time. Neither option by
itself makes an old capture current. Until a reader freshness policy exists,
retain the as-of date and do not activate a UI that labels those old windows
as current. These are proposals for review, not authorized database changes.
