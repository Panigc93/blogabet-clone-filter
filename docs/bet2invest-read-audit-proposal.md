# Bet2Invest read/freshness and audit: minimum scope proposal

Grounded against local candidate f580b37, 2026-11-17. Proposal only. No code,
UI, schema, account, remote connection or production data changed here.

## What is already possible

The existing schema stores platform, slug, all-time picks/profit/yield,
captured_at, stats_updated_at and yield_3m/6m/12m. Therefore it can keep and
query a dated snapshot without a migration. Import time need not overwrite
capture time. import_validation_log records run_id, captured_at and created_at
for rejected/skipped attempts. Successful imports do not currently get an
execution/audit row, so those logs alone do not reconstruct a successful run.

The existing card already shows capture date and says it is not a sync.
All-time values and platform-specific units are mapped. No new date control,
new page, dashboard, paid service, account or scheduled refresh is needed to
show a dated all-time snapshot in the existing filter.

Sources: db/schema.ts, crawler/platforms/bet2invest/execute-offline-import.ts,
components/tipster-card-model.ts, components/TipsterRow.tsx.

## Actual read-path gap

The Bet2Invest card mapper currently sets every period value to null and
showPeriodRow=false, even if the database contains calculated period figures.
In contrast, lib/query.ts sortOrder('yield6m'/'yield12m') reads raw DB columns.
Both first-page SSR and the paginated API use that sorter. The API returns raw
rows, including those hidden period values. Importing the candidate alone
would permit sorting by a Bet2Invest figure that the card hides, and later by
an old window without a window-freshness check. A dated card header does not
fix hidden sort criteria.

Sources: components/tipster-card-model.ts bet2investFromDbRow,
lib/query.ts sortColumn/sortOrder, app/page.tsx, app/api/tipsters/route.ts,
components/LoadMore.tsx. These are source findings, not a claim about the
current deployed version or live database.

## Recommended smallest release boundary

Separate safely adding dated historical rows from enabling their period
ranking. Do not require a new collection or product decision merely to retain
the dated all-time snapshot.

1. Keep historical picks/profit/yield, explicit platform unit and original
   capture date available through the existing card/filter. No new metrics,
   score, activity inference or paid/free assumption.
2. Before import/activation, make Bet2Invest period eligibility explicit and
   identical in SQL ordering, API projection and card mapping. For the first
   all-time-only release, period values remain null in all three views, not
   just visually hidden. Keep stored source values/audit intact. Do not remove
   a tipster or its all-time ranking merely because periods are unavailable.
   Blogabet, Tipstrr and Golazobets behavior stays unchanged.
3. Preserve window evidence in a retained private audit manifest. This allows
   the period feature to be enabled later without discarding the calculations.

Step 2 is a read-consistency correction, not a new user-facing filter or a
choice of an arbitrary age threshold. It needs shared SQL projection/sort
logic and tests across first page, next page/API and combined-platform view.
It is NOT implemented by this proposal.

If the intended release must include Bet2Invest period ranking immediately,
it is a slightly larger slice, not a database migration: pass retained audit
metadata to the mapper, show the already-existing period cells with date
range and bets/months/caveats using existing layout, and use exactly the same
eligibility for SQL ordering and API projection. PeriodCell currently accepts
no trace/title prop, and TipsterRow does not render PeriodStatView.trace, so
that trace is not visible just because the model contains it. Avoid claiming
existing trace fields solve visibility without a small rendering change and
pixel review. That rendering work would be separately scoped, not done here.

## Minimal temporal rule when enabling periods

The window algorithm uses complete UTC calendar months. A capture in November
2026 produces windows ending October 2026. Importing that same file in December
does not produce a November-ending window.

An objective eligibility check can compare the capture's UTC month to the
requested current-window anchor month, rejecting future/unparseable capture
times and missing audit metadata. When the month differs, treat its period
figures as dated historical evidence, not current-period ranking input.
This preserves the algorithm's actual meaning without inventing a 7/14/30-day
freshness preference. It is not a claim that every capture within one month
has complete data, and does not replace source quality/reset gates. If the
product later wants an additional within-month age SLA, that is a separate
choice. No such SLA is chosen here.

The same eligibility must run before sort and pagination, not only in the
card after selection. A month boundary must not change all-time values,
rewrite database figures, fabricate a zero, or infer inactivity. Existing
activity evidence uses a separate path and should remain separate.

## Audit retention without a migration

Preferred for this preparation stage: a versioned private JSON manifest per
run, retained alongside code/input provenance, plus a compact slug lookup.
Minimum fields:

- schema version, platform, runId, code revision and input content hash;
- capturedAt (data as-of), calculatedAt and executedAt as distinct concepts;
- run state (planned/committed/failed), counts and a committed receipt;
- per slug, identity, result status, each window's exact UTC month bounds,
  figure/null reason, bets, months and caveats.

This extends the current local report, which already holds the rows' windows
and executedAt/capturedAt. Current temporary attachments are custody evidence,
not an implemented durable retention mechanism. Use the repository's private
artifact/deployment storage only after checking its actual access, retention
and limits; do not assume a provider, create a service or put the full raw
captures in a frontend/public bundle. A failed report upload must not turn a
successful import into a false failed DB commit or trigger duplicate writes.

If query-time audit must live in SQL, use the existing import_validation_log
with an explicit versioned success-audit class and JSON reason, written in
the same transaction. It has the needed fields and platform/slug index.
This avoids migration but changes the log's documented failure-only meaning.
Review readers and retention before implementing; estimate added rows as one
per successfully written profile (958 for this corpus), not raw HTML in DB.
An index change might become useful at scale, but is not demonstrated as
necessary for 958 metadata records and is not proposed now.

The file-manifest option avoids DB schema/log changes; the SQL option is more
atomic and directly queryable. Do not implement both by default. For all-time
release, a retained manifest is enough. Immediate period rendering needs a
reliable server-side metadata lookup or the reviewed SQL audit option.

## Cost and remaining execution boundary

No new paid service, subscription, migration, account or recurring crawl is
required for the proposed minimum. Storage grows by one compact audit JSON
per run; its current local predecessor is about 715 KB for 958 window-audit
records, excluding raw captures. That is an observed local size, not a vendor
bill. A refreshed success-log design would add roughly 958 metadata rows on
this first complete import. No provider cost is quoted or approved.

Remaining engineering slices are bounded and independently testable:
- shared read projection/sort guard + API/SSR/card regression tests;
- manifest finalization/retention receipt + failed-delivery/retry tests;
- inert deployment adapter with pinning, timeout/cancellation, rollback and
  local PostgreSQL tests, then authorized deployment-environment validation.

No implementation time promise is made from the local tests alone. The real
PostgreSQL tests close local contention behavior, not target-network latency.
An imported module or a local adapter is not an activated production route.

## One understandable next decision

After preparation and review, the user can decide whether to add the reviewed
Bet2Invest snapshot to the existing filter now, keeping the original capture
date and historical metrics, while period ranking remains off until it can
show its period and supporting sample clearly. Import, merge/deploy and any
automatic updating remain separate owner-authorized effects. No five technical
choices need to be sent to the user to make that decision.
