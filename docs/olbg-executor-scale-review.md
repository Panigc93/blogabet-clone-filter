# OLBG executor, synthetic scale and refresh validation
17 November 2026. New block after independently reviewed37c1634. No production execution.

## New executor preparation
`executeOlbgPreparedBatch` is inert on import and has no driver, env, connection, credentials, DDL, route or automatic launch. Its caller must provide owner authority and a pinned bounded transaction adapter. It accepts1-50validated records and≤4MiB per batch.

A transaction locks the catalog and OLBG tables in SHARE ROW EXCLUSIVE NOWAIT, reads existing natural identities, active pointers and immutable same-capture snapshots in one batch query, rejects capture/hash/identity conflicts, allocates internal negative surrogates using the existing sequence, bulk-writes snapshots and exact active pointers, updates only platform=olbg catalog rows, reads back capture/digest identity, and commits a run digest/summary receipt in the same transaction. Source numeric IDs are never catalog surrogate IDs. Catalog all-time yields/profits remain null; internal picks=0 is storage-only and is masked by the reviewed read path.

Replay of a committed run is idempotent. The same runId with changed input fails. Older captures are skipped and cannot roll back the active pointer. A missing COMMIT acknowledgment returns unknown, not failed or rolled back. `reconcileOlbgRun` is read-only and checks the durable run digest before another attempt. Snapshot digest covers retained normalized record bytes, not the lost original HTTP response bytes. Transaction sequence gaps after rollback are normal.

The caller must use the previously reviewed bounded pinned transaction adapter (statement timeout, idle timeout, cooperative total budget, discard on uncertain COMMIT). NOWAIT avoids waiting behind another writer but does not itself bound lock duration. The table lock briefly blocks other platform writers, not readers. Actual contention/latency still requires the opt-in real PostgreSQL suite.

## Query reduction and synthetic measurements
Initial per-profile prototype used8,724SQL calls for867profiles and18batches. It was replaced before this package with bulk SQL:9calls per fully new50-profile batch,162calls for18batches total. Existing/replay/skip batches require fewer calls. This count excludes BEGIN/config/COMMIT performed by the caller adapter.

The final local benchmark is entirely synthetic, created by cloning a fixture's shape to867invented IDs and names. It is not867real captures. It adds30,000synthetic valid-shape historical records and retains30,867snapshots while selecting only867active records.

Single-process disposable PGlite run: active-record payload1,891,685bytes; import582ms total, batches12-61ms; active read/validation+plan+top50SQL118-182ms over5samples after history insertion. These are in-process timings with no network, not Neon latency or a PostgreSQL multi-connection benchmark. The JSON result is attached separately. API recordset and revision checks still transfer approximately1.9MB of active evidence per scan at this synthetic size. Production bandwidth/CPU budgets and end-to-end timings are not established.

## Refresh barriers
The existing revision guard is factored into a pure injected-clock/load module for deterministic tests. It rejects source changes committed between initial evidence load and completion, same-month continuation older than a refreshed capture, loader-unavailable/corrupt-content revision changes and month rollover. These tests do not simulate PostgreSQL lock behavior. HTTP ON/OFF smoke and screenshots from the earlier reviewed block remain the visual reference; this block adds no layout.

## Real local PostgreSQL opt-in handoff
`tests/crawler/olbg-postgres-local.test.ts` is NOT executed here. It requires:
- Unix socket directory matching `/tmp/olbg-local-pg-[a-zA-Z0-9-]+`.
- Local PostgreSQL port55440, database`olbg_executor_test`, current OS user, no password.
- `OLBG_LOCAL_PG_SOCKET` set to that socket directory.
- `npx vitest run tests/crawler/olbg-postgres-local.test.ts`.

It creates an isolated schema`olbg_review_<pid>` inside that dedicated database, applies existing application DDL plus proposed OLBG tables only in that schema, and drops the schema on cleanup. Do not point it at another database, TCP host, Neon or a user's account. No DATABASE_URL is consumed. Four tests use independent connections to check NOWAIT writer refusal/readers available/no partial receipt, server-side statement-timeout rollback/reuse, another connection's refresh invalidating the read barrier and preserving newest pointer, and injected lost-COMMIT acknowledgment followed by durable read-only reconciliation.

The suite is syntactically/type checked and skipped without the explicit socket. It is ready for a separate executor with confirmed disposable PostgreSQL capability. Passing in PGlite is not presented as a substitute.

## Verification and boundaries
Five local SQL executor tests cover allocation/other-platform preservation, replay/conflict/older/newer updates, rollback with no run receipt, commit-unknown reconciliation and validation before entering a transaction. Two deterministic revision tests cover refresh/race cases. Existing schema remains unchanged; the proposal string now adds an OLBG import-runs receipt table. No migration file was created. The prior plan's positive-only surrogate restriction was corrected to accept the existing negative internal sequence.

Still pending before production: independent review of this new code; actual multi-connection test results; representative network/transaction/bandwidth measurements; explicit schema/activation/import authority and fresh-source collection scope. The existing local-only activation guard is unchanged and cannot enable Neon. No publication, push, merge, real database DDL/write or new source capture occurred.
