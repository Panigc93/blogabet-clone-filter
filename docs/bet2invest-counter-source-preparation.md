# Bet2Invest: counter corrections and source-ready local preparation

Local review candidate only. No remote connection, production write, push,
merge, deployment, activation, schedule or new capture occurred.

## Identity and ROI

Multi-bankroll selection now compares the displayed statistics card's
stats-settledBetsNumber and stats-roi, never the og/Picks badge. An explicit
settled payload counter is required. A different total counter is not alone
an error: for multi-bankroll imports with different counters, exact monthly
settled-bet and profit closure is required. This preserves AnonymousPronos
(606 total / 605 settled) and Focusgoalaway (766 / 757). Gerganaana remains
unselected: 923 total, 921 settled and 922 in its month series do not close.
LeGrec and mattstph select against 230 and 410, not badge 232 and 412.

A precise selected-bankroll ROI may corroborate monthly ROI only after the
all_time scope, username, bank ID, settled counter, rounded card profit/ROI
and exact monthly settled/profit checks pass. The fallback interval is half
a fourth decimal (0.00005 + floating noise), not a wider card tolerance.
This is the precision rule used for this observed corpus, not a promise
about all future vendor payloads. A failure remains null.

CLVEdge's current payload has 45 settled, profit 13.4335 and ROI 33.795.
It can corroborate monthly precision but its known 2026-11-08 reset still
makes all three windows null. The previous 22-bet block is never added, and
this change does not assign semantics to total counter 55. Romeo1987's
verified windows become -27.00, -27.00 and -3.14. Six empty current histories
stay zero-current rows with null yields/windows, never reconstructed history.

## Pagination anchor

The SSR read instant is carried as periodAnchor to API continuation and card
mapping. A different UTC month, future or invalid anchor returns 409; the
client reloads rather than appending a newly ordered month. This fixes the
month-rollover inconsistency, not arbitrary concurrent-import movement:
offset pagination still is not a database snapshot. No visible layout change.

## Two distinct full-corpus checks

The original 961-input fixture used a common synthetic 16:27Z anchor for
isolated executor tests. Final corrected result: 960 inserts, one unselected;
replay 960 freshness skips, no updates/duplicates; windows 663/670/670.
557669-byte manifest, 791 ms initial and 314 ms replay locally. This proves
executor behavior, not a simultaneous real-world data cut or cloud latency.
The corrected checkpoint re-parsed seven affected profiles on an unchanged
previously parsed remainder.

The separate source-aware preparation re-parses the actual captures with
per-profile evidence. It includes the nine recovered SSRs, so its population
is 970, not 961. Each profile retains SSR and API timestamps, time basis and
SHA-256 independently. HTTP Date is used only where an original header
exists. Recovered refresh times are local download-completion times, not
server dates. Batch30 plus two diagnostic timestamps are local per-request
records, recovered separately; their 32 byte counts are checked, and absent
headers are not invented. The batch30 chain identifies the valid Nov 17
GOALPROFESSOR file, not the truncated Nov 16 response.

The source-aware runner groups only exactly equal SSR anchors, so no mixed
cut is claimed. Each group is a separate transaction/run with exactly one
private manifest; sourceCaptures stays in the private envelope and never
reaches the card/API. Existing consumers can still read older manifests
without this optional evidence. Source coverage, unique slugs, source hash,
time basis and SSR anchor are checked; same-run source changes conflict.

These tiny batches are a consequence of preserving the existing executor's
one-anchor contract. They do not form a single atomic global import: each
batch is atomic, and the local plan is resumable through same-run receipts.
The reader's current bound remains 1000 manifests and 8 MiB in the current
UTC capture month. A 970-group first import fits, but repeated full refreshes
would exceed that count. Before planning repeated refreshes, review grouping
or reader bounds; no retention deletion was introduced to hide that limit.

## Reproduction and retained evidence

scripts/bet2invest-prepare-sourced.ts takes corpus, recovered captures, trace,
output, start and end indexes, and optional recovered-originals SSR and API TSVs. Missing
or mismatched evidence is retained under held rather than guessed. Index -1
selects recovered/missing-header profiles. Parser checkpoints avoid command
time limits; they do not move parsing inside the SQL transaction.

scripts/bet2invest-verify-sourced.ts takes an output prefix and checkpoints.
It writes a private local plan containing rows and source evidence, then
executes every grouped batch against a fresh migrated PGlite database. It
verifies stored numbers and original SSR anchors, same-run receipt replay,
and unchanged Blogabet/Tipstrr/Golazobets sentinels. No production adapter is
connected. Prepared plans are sensitive development artifacts, not public
source or client assets.

The final transferred report lists exact totals and any held evidence gap.
A held profile is not silently dropped or advertised as ready. The 961
synthetic report is retained separately so its totals cannot replace the
source-aware plan's totals.

Local short PostgreSQL harness: seven tests pass, full-corpus parser test
skipped in that invocation. Three independent backends prove lock/read/write
behavior, timeout rollback, inert pinned adapter and manifest readback. The
server is stopped and temporary cluster removed afterward. Local lock times
are not Neon promises. Unknown COMMIT still requires independent receipt
reconciliation and old-backend termination before retry.

## Final source-aware result

970 profiles prepared, 970 exact-anchor batches, no held evidence gaps.
969 inserts and one not-selected (Gerganaana), no updates. Period values:
672 / 681 / 679 for 3m / 6m / 12m. Exactly 970 manifests, 1391071 bytes
of manifest bodies in total, verified same-run replay without new writes.
Every persisted number and SSR capture anchor was checked and other-platform
sentinels are unchanged. SSR evidence: 928 HTTP Date, 10 local completion,
32 local request records. NumeroX and kopf API dates are recovered original
request records (09:16:55Z and 09:16:43Z), not HTTP Date; their 9430/5989-byte
files match the recovered request evidence.

Final ordinary suite: 48 test files, 441 tests passed; eight opt-in PostgreSQL
tests skipped by default. Separate real PostgreSQL short harness: seven
passed, full-corpus test skipped. tsc and production Next build pass. This
is local execution evidence, not approval or verification of deployment.
