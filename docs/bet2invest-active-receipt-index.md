# Bet2Invest active receipt index (supersedes JSON historical scan)

Local candidate only. No remote connection, writes, deployment, purge, schema
change, new service or capture. This supersedes the request-time JSON scan
introduced by 7bdbf13, rejected after measured linear cost. The old scan helper
and benchmark remain diagnostic evidence and are not used by the app.

## Storage and transaction

Exactly one private mutable row lives in existing import_validation_log:
platform=bet2invest, slug=__b2i_active_period_index__,
class=b2i-active-period-index-v1, run_id=active-period-index. The existing
(platform,slug) index supplies the lookup. This is a technical index row,
not a validation failure or per-profile success log. Error reports must
exclude BOTH b2i-run-manifest-v1 and b2i-active-period-index-v1.

The row holds a versioned active PeriodAudit array, sorted by slug, with
SHA-256 and UTF-8 byte count. Bound: 10000 unique slugs and 2 MiB. It stores
only period metadata, never raw captures, private sources, manifest outcomes
or provenance. The immutable per-run manifest continues to retain all source
metadata and outcomes. No historical manifest is changed or deleted.

Under the existing tipsters import lock, each successful batch updates its
written profiles in this active index, after inserting its historical
manifest. These writes share the SAME transaction/COMMIT. Failed or skipped
profiles do not replace the index entry. Every successful update is read
back and verified; a missing/duplicate/corrupt/oversize index fails the whole
transaction. Confirmed rollback preserves tipsters, index and history.
Unknown COMMIT retains the existing independent-receipt reconciliation rule.
Same-run replay returns its historical receipt without reapplying writes.

The singleton is mutable on purpose; its created_at tracks the last index
write, NOT profile capture time. Each audit keeps its exact original SSR
capturedAt. Source SSR/API times and bases remain separate in run manifests.

## Reader

The application requests only the exact platform/slug/class with LIMIT 2,
then verifies version, unique slugs, byte count and checksum. Two rows,
missing data or integrity failure masks B2I periods with the same generic
server warning; other platforms continue. It does not scan or decode all
retained historical envelopes. Period SQL still joins by platform/slug/exact
capturedAt and checks values before sorting/pagination. Only validated card
metadata reaches API/browser. Original current-month/time eligibility stays.

## Legacy bootstrap

A fresh database initializes the singleton lazily. If pre-existing B2I rows
lack this index, an import cannot silently initialize from only its own small
batch and lose the rest: it stops with explicit-bootstrap-required. Requests
mask periods until bootstrap is complete, without making a historical scan.

bootstrapActiveIndex is an internal LOCAL operation accepting a transaction
and previously integrity-verified legacy PeriodAudits. The caller must hold
the same tipsters table lock and use the existing transaction adapter. For
each stored B2I row with a capturedAt, it requires exactly one matching audit
by slug and original timestamp, then writes/read-verifies the singleton. It
refuses an existing index and incomplete/conflicting coverage. Legacy audits
come from databaseAudits over verified old manifests, not inferred from
stored yield numbers. Missing old evidence stays a blocker rather than
fabricated metadata. This API is inert; no production bootstrap was run.
The real PostgreSQL test explicitly bootstraps its earlier executor-only
fixture rows using their known original test audits.

## Local verification and tradeoffs

- Integrity, duplicate identity, explicit legacy bootstrap and rollback tests.
- Two complete 970-profile synthetic audit refreshes with 30000 historical
  records retain exact new individual anchors and a single active row.
- Full sourced import: 969 inserts + Gerganaana unselected, all stored numbers
  and original SSR anchors verified, same-run receipt replay no writes.
- A second complete isolated pipeline refresh uses timestamps shifted +1s
  solely as a synthetic test (NOT new source evidence): 969 updates and one
  unselected. The real source plan remains unmodified and separately stored.
- Atomic active-index-write failure test verifies tipster and historical
  manifest rollback too, not merely the singleton's own rollback.
- Real PostgreSQL short harness: seven passed, corpus parser test skipped.

Indexed lookup plus integrity decoding in local PGlite for 969 active rows:
14-20 ms with 970 retained historical rows, 14-15 ms with 9700, 14-32 ms
with 29100. EXPLAIN uses existing platform/slug index. These are local
measurements, not Neon latency promises. Historical scan measured roughly
0.13/1.9/5.8 seconds at comparable populations and is no longer app code.

Writing the bounded singleton costs work proportional to active profile
count for EACH batch. Keeping the existing exact-anchor executor means 970
small transactions in this source plan. The local two-cut end-to-end run
took roughly 106 seconds, rather than one global atomic commit. This is a
write amplification tradeoff, not hidden latency: requests stay bounded to
one small indexed record. Profile growth beyond 10000 entries or 2 MiB
fails closed and needs design review. Retained history still consumes disk;
no retention policy is invented or changed here.

Final local candidate validation: 50 test files / 446 tests passed, eight
opt-in PostgreSQL tests skipped by default. tsc and Next production build
pass. Real PostgreSQL short harness separately passes seven tests.
