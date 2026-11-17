# Bet2Invest: one database manifest per run (local variant)

This supersedes the default filesystem reader described in
bet2invest-read-audit-implementation.md. No remote effect or migration has
occurred. The sole default runtime audit source is now the existing database.
The earlier filesystem module remains an explicit local diagnostic utility;
no application reader falls back to it.

## Existing destination, source evidence and consumers

The app already reads PostgreSQL through db/index.ts. Migration 0005 created
import_validation_log with text reason, class, run_id, captured_at, created_at
and a platform/slug index. No S3/Blob/storage dependency, durable server volume
or upload-artifact retention was configured in the inspected repository's
package.json, vercel.json and workflows. A temporary serverless file is not
treated as durable or shared storage.

The existing script update-golazobets-avatars-since.ts already records a
successful batch under a reserved log slug. Thus a manifest run marker is
consistent with actual usage, though older comments described failure logs
only. Other imports count logs by their OWN runId. The documented Tipstrr
rollback removes a Tipstrr-specific run prefix; no generic log cleanup,
reader UI or automatic TTL was found. This is a repository-level review,
not a claim that a live retention policy was inspected or changed.

## Write and integrity contract

executeDatabaseAuditedImport uses ONE outer transaction and the same lock
order as the executor. It checks run identity, runs the pure planner/executor
in the pinned transaction, then adds exactly ONE manifest record:

- platform=bet2invest, class=b2i-run-manifest-v1;
- slug=__b2i_run__:<validated-runId>, separate from tipsters identity;
- original captured_at, run_id, default created_at;
- reason contains a versioned JSON envelope with hash and UTF-8 byte length.

The manifest holds original capturedAt, calculatedAt, executedAt, code/input
provenance, a separately computed actual row-payload hash, counts, outcomes
and successfully written profiles' window audit. No raw HTML, credentials,
private contact data or per-profile success rows are added. A duplicate runId
with identical hashes returns its existing receipt and does not write again;
different provenance/payload conflicts loudly. Reserved slug collision with
a real tipster cannot collide across the two tables. Duplicate manifest rows
are detected as an error rather than silently selecting one. The existing
schema has no unique constraint for runId, so this guarantee applies to
serialized writers using this route; arbitrary direct SQL bypasses it.

Readback verifies the envelope inside the transaction, and a receipt is
returned ONLY after COMMIT acknowledges. A failed manifest insert, oversize
body or other statement rolls back tipsters and logs together. A maximum
2 MiB per manifest is checked; source batch limit remains 1000 profiles.
Class b2i-run-manifest-v1 is NOT a validation failure and must be excluded from
error counts (WHERE class <> 'b2i-run-manifest-v1'). No retention deletion or
TTL was added. Storage grows by one compact record per run, not 958 success
records for this corpus. Provider billing/retention limits are not guessed.

## Failures and uncertain commit

A confirmed failed transaction has no durable manifest because its writes
rolled back; the caller receives the error and must report a failed attempt,
not fabricate a committed receipt. The optional local diagnostic artifact
writer can preserve failure evidence, but it is NOT a second runtime source.
This variant deliberately avoids a second autonomous transaction just to
record a failure marker.

A missing COMMIT acknowledgement returns committed=null/state=unknown.
reconcileRun on a NEW independent pinned connection can find and verify the
atomic manifest, confirming commit without rerunning effects. An absent
manifest alone is inconclusive while the old transaction could still be in
flight. Caller must confirm the old connection/backend is terminated before
retrying. Unknown is not labelled failed or rolled back. No auto-retry is
implemented. Subsequent replay with the same identity is idempotent.

## Read and privacy contract

Homepage and API call loadDatabasePeriodAudits. It queries ONLY platform
bet2invest + exact manifest class + current UTC capturedAt month, then verifies
hash/version/size before creating the per-profile metadata index. At most
1000 manifests, 8 MiB total envelopes and 10000 profile entries are admitted;
review retention/query structure if those bounds are reached. Invalid index
or unavailable audit returns no B2I-eligible periods and a generic server log,
not private SQL/reason/connection details, so other-platform pages still work.

Only slug/capturedAt/window values/months/bets/reasons/caveats reach the card;
private envelope, run provenance, hashes and outcomes are NOT returned in the
client API. Existing eligibility, pre-pagination sorting, historical figures,
UTC anchors and compact '12 apuestas' sample remain unchanged. No new age
threshold or minimum bets rule is introduced.

## Local verification

- Six new isolated PGlite database-manifest tests: one record + readback,
  same-run replay, payload/provenance conflict, reserved slug isolation,
  manifest insert failure atomic rollback, unknown commit/reconciliation,
  oversize rejection, tampering and duplicate identity fail-closed.
- Real PostgreSQL 14.24 short harness: 7 passed / full corpus 1 skipped,
  including independent-backend manifest receipt + replay with no new writes.
- Full ordinary suite: 46 files / 431 tests passed, 8 opt-in PostgreSQL tests
  skipped by default. tsc and Next build clean.
- The full-corpus local CLI is updated to use this audited route and record
  receipt size/hash alongside its prior row-value and other-platform checks.
  Its input hash covers the parsed capture-row payload and is labelled as
  such by the runner; the actual raw-capture archival chain remains separate.

This closes the durable destination choice using existing infrastructure in
source, not a production connectivity check. Before execution, verify the
existing authorized deployment connection/schema and privileges, preserve
other-platform fingerprints, reconcile any unknown prior run, and obtain the
owner authority for import/deploy. Nothing here authorizes those effects.
