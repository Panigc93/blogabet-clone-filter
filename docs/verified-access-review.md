# Verified access review (Free/Paid tri-state)

Prepared code, not a deployed release. Reconstructed from the reviewed
bundle 5719433 (branch `research/free-paid-effective`, 2026-11-19, bundle
no longer available) on top of current master, with the same opt-in shape.

## What this is

An opt-in (`VERIFIED_ACCESS_REVIEW=1`) tri-state read of tipster access:
`free` / `paid` / unclassified. With the flag unset, every read path keeps
the legacy boolean filter byte-for-byte. No migration, no DB write, no
crawler change, no UI badge change, no freshness threshold.

- `lib/access-classification.ts` — pure `classifyAccess` + SQL
  `effectiveAccessSql` + `tipoCondition` (the flag switch).
- `lib/query.ts` — `buildFilters` `tipo` block delegates to
  `tipoCondition`; legacy `eq(isPaid, …)` is exactly the OFF path.
- `lib/olbg-read-context.ts` — the API read path applies `tipo` through
  `tipoCondition(p.tipo, projection.isPaid)`; same OFF equivalence.

Unknown is SQL NULL, evaluated in WHERE before pagination, so Free/Paid
filters, counts and pages agree. Unclassified rows stay in "Todos". The
cards need no change: the Pago badge and price only render on
`isPaid === true` (a positive signal) and no Free badge exists.

## Classification by platform (with the flag ON)

- **Blogabet**: `is_paid=true` → Paid. Everything else → unclassified.
- **OLBG / Bettingexpert**: Free by affirmative source policy (their picks
  are free on-platform; see `docs/olbg-scoped-free-release.md`). A stored
  `is_paid=true` contradicts the policy → unclassified.
- **Tipstrr / Golazobets / Bet2Invest / Apuestes**: the stored boolean.

## Evidence basis (audit 2026-11-19, retained responses; re-read 2026-11-20)

- Blogabet `is_paid=false` is "no price parsed", not Free: rows exist with
  `is_paid=false` and paid-pick history (`picks_free_3m_avg` non-null, i.e.
  a `#paidStatsTab`; davilavolley and pooh verified live against it, with
  recent paid months). The paid tab proves "has published paid picks", not
  "sells now" (tipspinnacle: old paid tab, price still listed).
- The stats endpoint (`/blog/stats`, already fetched daily) carries no
  free marker: zero matches for the system banner "This is a free
  NON-VERIFIED blog" in the 8 retained bodies. That banner — seen on a
  profile page — is the only explicit Free signal observed, it lives on
  profile pages, and it only covers non-verified blogs.
- The listing parse (`crawler/crawl.ts`) only asserts Paid (€ price in
  `.subscribe-btns`, or FULL SERVICE / SEASON BREAK / BY REQUEST text).
  Characterization tests pin: an explicit "FREE" label is not read (→
  same as no signal) and a non-€ price format would parse as not-paid.
- Freshness is a separate dimension: as of 2026-11-20 only ~2.3k of 11.5k
  Blogabet rows have a listing refresh this week; the rest carry months-old
  values. No date threshold turns an unclassified row free.

## Consequences of enabling today

- Blogabet Free goes to 0 (no positive Free signal stored). Paid keeps
  the rows with `is_paid=true`. Everything else stays in "Todos".
- That is the intended honest state until a positive Free signal is
  collected. Enabling is a product decision for Juan, with that consequence
  stated.

## Not done here (need their own approval)

- Collecting the profile-page banner (or any new field) in the crawler.
- Any migration or backfill of a stored classification column.
- Enabling the flag in any deployed environment.
- A full-catalog listing refresh (the 2026-11-20 scheduled run failed on a
  Blogabet HTTP 500 mid-pagination after 5 pages; the stats pass completed
  with 0 request errors).
