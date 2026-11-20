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

## Profile-page signals (bounded sample, 2026-11-20)

13 profile pages (`<slug>.blogabet.com/`) fetched with the authorized
crawler method (session cookie approved 2026-10-30, crawler headers, >=10s
between requests, all HTTP 200, zero blocks/challenges; `/blog/picks`
never touched). Findings, with `crawler/blogabet-profile-signal.ts` as the
pure parser and 13 fragment fixtures under `tests/fixtures/blogabet-profile/`:

- **Non-verified live blogs carry an affirmative FREE banner**: "This is a
  free NON-VERIFIED blog!" (4/4 sampled: jj1ba0, aussie1126, safin1,
  ilikemybet). Free for this class is no longer an inference from absence.
- **Paid services show a subscribe box with the price** ("59€ / MONTH",
  "55€ / MONTH") matching the stored listing price exactly (sabobic,
  dedi22).
- **SERVICE FULL**: a paid service with no open slots renders a subscribe
  button labelled SERVICE FULL and no price (ibet-35, stored as
  `is_paid=false` with paid-pick history). Live proof that stored false is
  not free, and of a paid state the listing cannot see.
- **Verified blogs without a subscribe box show nothing affirmative**
  (yugovalue, anubispicks, scpicks23): no banner, no price, only the
  generic FOLLOW button. They stay unclassified.
- **Deleted blogs answer "Blog not found"** (3/3 sampled from the 655
  stored non-verified+paid rows: versustips11, ouzbourne, iordan — all
  stale since <=2026-10-25). Stored flags on dead blogs are unreliable.

Free-pick history (paidStatsTab, picks_free columns) is NOT a free service:
ibet-35 publishes free picks while selling a full service.

Impact, kept separate:

- *Proven* (the 13 pages above, fixtures): the five signal shapes exist and
  the parser classifies them; one stored `is_paid=false` row is a full paid
  service.
- *Expected, not proven*: IF live non-verified blogs generally carry the
  banner, the bulk of the 10,921 stored non-verified rows could become
  affirmative-Free once profiles are read — but only 4 live banners were
  observed, and only 3 of the 655 stored non-verified+paid rows were
  checked (all dead). The 164 verified rows without a parsed price have no
  affirmative free marker and stay unclassified. No stored row changes
  classification until a profile read happens; nothing here extrapolates
  the sample to the catalog.
