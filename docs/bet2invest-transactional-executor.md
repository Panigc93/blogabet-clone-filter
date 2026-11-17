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

Before any production use, review a bounded transaction timeout in the future
adapter and measure lock duration/contention on a representative isolated
PostgreSQL database with independent sessions. Do not assume a local PGlite
duration predicts Neon behavior. PGlite serializes its own connection work;
the concurrency test proves safe replay under that serialization, not
independent-session contention behavior. A lock refusal or unique conflict
must abort and roll back; a future caller may retry the complete batch.

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
