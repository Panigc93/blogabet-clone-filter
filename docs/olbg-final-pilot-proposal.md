# Final local proposal: compact OLBG reads and new-only three-profile pilot
17 November 2026. Supersedes the full-active-record listing design in earlier notes. No production activation or capture is included.

## Concrete next step
Review this single replacement package and run its opt-in PostgreSQL tests and synthetic benchmark on a disposable local PG14 cluster. If accepted, the next owner decision is a separately scoped pilot of at most the three already identified profiles, not collection/import of867profiles. Do not keep extending the offline feature set indefinitely.

The pilot would require explicit authority for production DDL/import/deployment and fresh checks of those three sources. Current code deliberately remains PGlite-only in application activation. Neither review acceptance nor a successful local benchmark authorizes a deployment, schema change, production query, purchase, new account or source crawl.

## Replacement, not an optional parallel layer
- Active rows now contain compact formula-versioned3/6/12-month evidence: source identity/capture/month, snapshot digest, coverage, missing-month list, tips and summed LSP. The executor derives it from validated global monthly records and writes it in the SAME transaction as snapshot/pointer/catalog/run receipt. Published source ROI remains in the retained monthly snapshot and is never overwritten by this projection.
- SQL directly joins the indexed active table and snapshot identity/digest. It does NOT load all snapshots into JS, build a catalog-sized SQL parameter, or send months to the browser. The snapshot join selects only keys/digest, not monthly record bodies. The database still evaluates current active compact rows for an unindexed derived sort; there is no claim of an O(50) database scan. The transferred result is limited to50rows and count/revision are constant-size.
- The SQL and card calculate100*LSP/tips from compact coverage, never sum or average source ROI. Missing-month and zero-denominator behavior is unchanged. The source snapshot hash is removed from API output; the card gets only compact period explanation. No monthly data/receipts/account fields enter the list payload.
- Compact JSON has a database-computed MD5 to mask accidental edits before rank/pagination and is bound to the retained snapshot SHA256. MD5 here is a corruption check, not a security signature or permission. An actor able to edit both database fields remains privileged; no adversarial-database-authentication claim is made. Canonical snapshot SHA256 still refers to the normalized retained record, not original HTTP bytes.
- A singleton monotonically increasing revision is updated in the same commit. Two tiny revision reads replace two scans/hashes of the full active list. Continuations carry the revision and original read instant. If the revision changes during read or since continuation, return409/reload; month rollover still invalidates. Unknown all-time/tipo filters, B2I composition and default-disabled behavior remain.
- The old monthly-evidence API validator was removed when its listing path was replaced. `active-read.ts` remains an explicitly offline/full-evidence audit helper used in executor tests, not in the list routes.

## Measured synthetic budget, not real OLBG volume
Synthetic fixture-shaped workload:867invented profiles,30,000valid-shape synthetic historical snapshots,30,867total retained snapshots. It is not867real captures. Latest PGlite measurements are in the attached JSON with EXPLAIN ANALYZE BUFFERS plans:
-50-row response:61,191bytes, IDENTICAL before and after adding30,000history rows.
- Query parameter payload:117bytes instead of about1,891,685bytes of full active records. SQL text itself is about5.3KB and constant with catalog size.
- Revision result59bytes; count result15bytes. Both are independent of retained monthly history size.
-867/867projected six-month values compared successfully with the prior pure monthly derivation. Source monthly ROI is still distinct.
- Five top50SQL samples:about15-25ms in-process PGlite. Count about23ms. No network, serverless wakeup or user account involved.
-180SQL calls across18new-import batches of≤50, including new revision write, excluding BEGIN/config/COMMIT. About0.73seconds total in-process PGlite. Batch durations are in the JSON. The pilot uses at most3records and one transaction, not18transactions.

These numbers do not predict Neon performance. They establish bounded transfer size and a smaller query count. A simulated round-trip budget can be computed from the actual query counts but must be labeled simulated, not a measured remote latency.

## Local PostgreSQL evidence requested with this package
Use a disposable UNIX socket matching`/tmp/olbg-local-pg-<suffix>`, port55440, DB`olbg_executor_test`, current OS user and no password. No TCP or DATABASE_URL is consumed. Existing PG14cluster can be recreated by the designated executor. The test and benchmark each create/drop their own isolated schema:
1. `OLBG_LOCAL_PG_SOCKET=<socket> npx vitest run tests/crawler/olbg-postgres-local.test.ts`
   Five tests: writer contention/NOWAIT with readers available, statement-timeout rollback/reuse, concurrent refresh invalidation/latest-pointer protection, new-only pilot rollback and retained audit, uncertain COMMIT/read-only reconciliation.
2. `OLBG_LOCAL_PG_SOCKET=<socket> npx tsx scripts/benchmark-olbg-local.ts`
   Runs the867/30,000synthetic workload on real local PostgreSQL, emits query/response bytes, transaction batches and page/count EXPLAIN ANALYZE BUFFERS to`/tmp/olbg/compact-pg-scale-result.json`. No external accounts or connections. Scripts refuse live URL environment variables.

Acceptance targets for this local pilot decision (not service guarantees): top50andcount each<250ms over5samples, a new≤50record batch<1s on local PG14, page payload≤100KB for50records, revision≤256bytes, same response bytes before/after retained history, all867derivations equal, and all5concurrency/rollback tests pass. Any miss is reported before recommending the production pilot. A healthy local run can pass these targets and still need a separate remote budget check.

## Rollback of the proposed pilot
The pilot must use`newOnly:true` and contain≤3profiles. Existing catalog identities cause a refusal, not an update. The run digest includes this policy and all records. Before any future production mutation, read-only preflight must establish the pilot really is new-only and capture the expected catalog/active state.

`rollbackOlbgNewPilot` is inert and explicitly limited to that scope. It takes the same run identity/input, locks the same tables NOWAIT in one bounded pinned transaction, verifies the committed receipt says ALL rows were newly inserted, and verifies every catalog/active/snapshot identity/capture/digest still matches that import. It refuses rollback after a later refresh. It deletes only those exact OLBG active pointers and internal catalog surrogates, retains all source snapshots and the run receipt, marks the run rolled back, advances revision and checks affected counts. A repeated rollback is a no-op. The original import run cannot be replayed after rollback without a new reviewed run identity. Unknown rollback COMMIT acknowledgment requires read-only receipt reconciliation, not blind retry.

This restores the pilot's visible pre-import state (no pilot catalog or active rows), not an erasure of audit evidence or sequence allocations. Existing non-OLBG rows and historical snapshots are not removed. Tests verify this and refusal after a refresh. A rollout rollback would separately disable the selector/feature and restore the previous application release; no deployment switch is changed here.

## Operations proposal for the eventual pilot
- Scope: exactly the three pilot numeric identities already reviewed, new-only, one approved run; source data refreshed only within separately authorized scope. No arbitrary-ID enumeration or867-profile capture.
- Preflight without mutation: once approved, inspect current repository/deployment/database identity and real row presence, confirm schema/backup/revert route, source dates/coverage, limits and recipient-visible metric semantics. Stop on mismatch.
- Proposed execution bounds: pinned adapter with statement timeout2s, idle timeout2s, cooperative budget5s, batch≤3for pilot. NOWAIT refuses another writer. The lock affects all catalog writers briefly, so choose an agreed quiet point and stop on contention rather than retrying in a loop.
- Verify commit receipt, exact3identity/capture/digest joins, unchanged baseline platforms, sourceROI-versus-derived separation, same counts/ranking across SSR/API,409andmobile. If authority includes rollback, use the verified new-only rollback on failed verification; otherwise pause and ask with exact impact. Never claim failure when COMMIT outcome is unknown.
- Before enlarging scope: measure real service latency and response sizes under approved read-only queries, set an owner-accepted execution budget, and review sources/collection load. The local package is sufficient to decide a bounded pilot, not to silently enable recurring collection or general import.

## Current boundary
All SQL so far ran only in disposable local tests. No migration file, Neon query/write, production schema change, push/PR/merge/deployment, new account, payment or OLBG capture was performed for this revision. Current local activation requires both OLBG_LOCAL_REVIEW=1 and USE_PGLITE=1 and cannot turn on Neon. User permission for the eventual effects is still separate from technical review.
