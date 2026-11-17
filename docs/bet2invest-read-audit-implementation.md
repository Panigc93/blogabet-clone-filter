# Bet2Invest period reading, audit receipts and inert adapter

Local candidate after d5ac6ba. No publication, merge, migration, production
connection, account, cron or external artifact upload has occurred.

## Implemented read path

Both app/page.tsx and app/api/tipsters/route.ts build the same periodReadContext
before SELECT/ORDER BY/LIMIT. The context joins a bound JSON metadata index
with platform + slug + original capturedAt. Only Bet2Invest's period columns
are projected/sorted through that join. Other platforms' figures and sort
semantics remain unchanged; no activity or total-picks filter was repurposed.

Eligibility requires a valid committed audit receipt, exact capturedAt and
numeric-value match, no future capture, and the same UTC anchor month as the
request. Window month bounds must match the existing full-calendar-month
algorithm. Old/missing/mismatched period metadata returns null in SQL/API/card
but leaves all-time figures, dates and stored history intact. The card repeats
the same contract defensively. No 7/30-day age threshold or minimum bets was
added. A one-bet window remains possible and its sample is explicit.

The original reset rule is unchanged: overlap with a known reset returns null
with its existing reason, not a concealed number. Unknown lastReset is still
uncertainty, not proof of no reset and not a new rejection rule. Full reasons,
window months and caveats stay in the audit and accessible title; null is not
zero and an absent month is not labelled a zero-activity month.

Existing period cells are reused. The first local render repeated long notes
and was rejected during review. The revised visible content adds only the
sample (for example '12 apuestas') below the existing yield/period label.
Capture date remains visible in its existing location. Full range/month count/
reset caveats are title+aria-label and in the audit; they are NOT claimed to
be touch-visible. No new page, button or explanation block was added. Existing
other-platform cell layout is preserved. Rendered React components with the
actual app CSS were inspected at 390 and 1280 pixels, with no horizontal
overflow; this is a local component preview, not a live deployed page or a
claim of pixel parity for external fonts/icons.

## Private artifact destination and receipt

The new audit-manifest module accepts an explicit absolute mode-0700 local
folder, creates mode-0600 immutable run/state JSON files, reads them back,
verifies exact contents, and writes/read-verifies a hash+byte-count receipt.
The loader accepts only committed manifests with a matching receipt/hash and
valid versioned windows. It is server-only and does not expose raw manifests,
paths, captures or internal run provenance to browser bundles. API rows get
only the per-profile window metadata required by the card.

Audit states: planned before the database begins; committed after confirmed
commit; failed after a confirmed failed transaction; unknown when COMMIT's
acknowledgement is lost. capturedAt, calculatedAt and executedAt are distinct.
Per-slug outcomes and window bounds/bets/months/reasons/caveats are retained.
Only successfully written rows add period metadata. Replays do not refresh it.

A failed destination before BEGIN stops the import. A receipt failure after
commit returns committed=true, auditReceived=false and a recoveryManifest.
redeliverAudit repairs ONLY the artifact receipt, never reruns database work.
The same runId cannot start another database import. A crash between commit
and final receipt leaves planned-only evidence and requires reconciliation,
not automatic retry. Unknown outcomes are never loaded as current audit.
Readback receipt is confirmation of local receipt, not remote replication or
a guarantee against machine/storage loss. No fsync/replicated storage claim.

Destination actually verified: temporary private local directories used by
tests. Proposed configuration is B2I_AUDIT_DIR for the server reader. Without
it, periods fail closed. A production durable destination is NOT verified:
this workspace has no established persistent server volume or artifact
service contract available from the inspected source. Vercel/serverless local
temporary storage must not be assumed shared or durable. Before deployment,
main must verify a private server-readable retained artifact route (or a
server-only versioned deployment bundle with the platform's file inclusion
and access checked). No new service is created by default, and raw captures
must not be added to public source or client/static assets. This is the real
remaining deployment-integration gap, not a request to the user to choose SQL.
No 958 success-log rows were added, and no new table/column is needed.

## Inert deployment adapter

transactionAdapter requires an already-pinned client and explicit statement,
idle-in-transaction and cooperative batch budgets (1..60000 ms). It does not
construct clients, read env/credentials, connect to any host or choose an
account. It rejects concurrent use of its pin, checks cancellation/budget
between operations, rolls back errors, and discards an unusable connection.
A missing COMMIT acknowledgement throws TransactionOutcomeUnknown and forces
reconciliation before retry. This is not labelled a hard total timeout:
in-flight SQL is bounded by server statement_timeout, cancellation is checked
between calls, and network loss still requires connection lifecycle handling.

Unit tests verify inert construction, cancellation, commit and unknown commit.
A new real PostgreSQL local test uses the same adapter to commit, cancel an
update with rollback and abort pg_sleep with statement_timeout/rollback.
No production connection or credential is used.

## Verification

- Full ordinary suite before final note shortening: 45 files passed,
  425 tests passed; one PostgreSQL opt-in file/7 tests skipped by default.
- After compact notes/hardening: targeted 11 tests passed and tsc clean.
- PostgreSQL 14.24 short harness: 6 tests passed, corpus test skipped because
  unchanged; independent connections and prior full-corpus evidence retained.
- next build completed, including dynamic homepage/API and static lab routes.
- Read tests execute actual SELECT projection/sort/offset against migrated
  PGlite: old/future/missing audit figures cannot displace current figures
  before pagination; BB/Tipstrr/Golazobets values are unchanged; UTC month
  rollover masks only stale periods, without writing DB history.
- Manifest tests cover confirmed commit, failed DB attempt, lost receipt after
  commit + receipt-only redelivery, run replay refusal, unknown acknowledgement
  and tampered receipt rejection.

Before release: review this delta, confirm the durable private artifact route
and load its receipt-verified index into the deployment environment, use the
owner-approved production connection and timeout settings, validate there,
and obtain the required explicit merge/import/deploy authority. None of those
external effects is implied by these local tests.
