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
  not free, and of a paid state the listing cannot see. Juan confirmed
  explicitly on 2026-11-20 that SERVICE FULL means paid.
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

## Integration (commit 4, 2026-11-20) — prepared, not executed

End-to-end wiring on the isolated PGlite database only:

- `drizzle/0007_blogabet_access_signal.sql` (LOCAL DRAFT, not applied to
  Neon): three nullable columns on `tipsters` (`access_class`,
  `access_evidence`, `access_observed_at`). The migration itself
  reclassifies nothing; rows only gain a class when a profile read writes
  one.
- `crawler/blogabet-profile-probe.ts`: `signalToAccessUpdate` (pure
  signal→columns mapping) + `probeProfiles` flow with `write:false`
  dry-run default, injectable interval, lazy DB init. NOT executed against
  the live site or any database.
- `lib/access-classification.ts`: Blogabet branch — `access_class` wins;
  an observed profile with no signal supersedes the listing boolean
  (unknown); only unread rows fall back to `is_paid` (true→paid,
  false→unknown, never free).
- `scripts/seed-isolated-db.ts`: applies 0006+0007 and seeds six
  fixture-backed Blogabet rows whose stored flags reproduce the real Neon
  state of each sampled slug (ibet-35 stored `is_paid=false`).

E2E on the isolated DB (`VERIFIED_ACCESS_REVIEW=1`, dev server + real UI):

- `tipo=free` → exactly 2 rows: jj1ba0 (banner) + StatMind (Tipstrr free).
  The 19 stored-`is_paid=false` demo rows stay out: unknown is never Free.
- `tipo=paid` → 42 rows INCLUDING ibet-35 (SERVICE FULL, stored
  `is_paid=false`) and EXCLUDING versustips11 (dead blog whose stored
  `is_paid=true` is stale).
- Unfiltered listing keeps yugovalue (no signal) and versustips11 (dead)
  with no misleading label. Screenshots: ui-e2e-access-*.png.

Impact if 0007 were applied to Neon (for later approval, not done):
schema-only, additive, nullable — no backfill, no rewrite of existing
rows, no classification change until a probe writes a signal. The probe
flow itself would be a separate decision (live profile reads at >=10s
intervals, one write per observed row).

## Card/filter coherence (commit 5, 2026-11-20) — same signal end to end

The migration draft gains a fourth nullable column, `access_price`
(numeric(8,2)): the subscription price OBSERVED on the profile (subscribe
box). NULL on SERVICE FULL, free, no-signal and dead blogs, so an observed
row never inherits a stale listing price. Probe mapping writes it; still
not executed.

- Card (existing paid indicator and price, no new UI): the served row
  carries the effective values (`effectiveDisplayAccess`, applied
  server-side in `app/page.tsx` and `app/api/tipsters/route.ts` under the
  flag; the client-rendered card only displays them). SERVICE FULL stored
  `is_paid=false` shows the paid indicator without price; a dead blog
  stored `is_paid=true` shows neither; unread rows keep legacy values.
  Flag OFF: payload byte-identical to legacy.
- Price filter (`lib/query.ts`, Blogabet view, flag ON): requires paid by
  the effective signal (a dead blog's stale `is_paid=true` does not count)
  and the range applies to the effective price (`effectivePriceSql`:
  observed rows → `access_price`, unread → stored). Observed rows with no
  visible price (SERVICE FULL) do not match a price range.

E2E re-verified on the isolated DB: API priceMin=55 returns only
sabobic(59€)+dedi22(55€) (versustips11's stale 60€ excluded); the ibet-35
card in the unfiltered listing shows the paid badge without price, and the
versustips11 card shows neither badge nor the stale 60€ (screenshots
ui-e2e-card-*.png).

## Deployment proposal (bounded, NOT executed)

1. Apply 0007 to Neon: schema-only, 4 nullable columns, zero data change,
   zero reclassification while no probe writes.
2. Probe phase A (contradiction cleanup): the 655 stored non-verified+paid
   rows — 655 profile GETs at >=10s (~1.8h), one UPDATE per observed row.
   Sample expectation (3/3 dead): most drop out of Pago and lose stale
   prices; EXPECTED, not proven beyond the sample.
3. Probe phase B: 415 verified-paid + 164 verified-without-price rows
   (~1.6h). Paid rows keep Pago with the observed price (or without price
   if SERVICE FULL); no-signal rows become unclassified.
4. Probe phase C (optional, largest): the remaining 10,266 non-verified
   rows (~28.5h). Rows with the free banner become affirmative Free.
5. Only then activate VERIFIED_ACCESS_REVIEW (pure read-path change;
   flag OFF restores legacy exactly).

Total volume if all phases run: 11,500 GETs (~32h at 10s) and up to
11,500 single-row UPDATEs, each writing class/evidence/date(/price).
Every phase is independently bounded and stoppable; no phase touches
/blog/picks or retries a denial.

## Nota ProTipster (2026-11-20, compatibilidad con PR #32)

PR #32 (protipster-integration-prep, abierta, no-prod) fusiona con esta rama
sin conflictos (4 archivos solapados, hunks distintos; sin solape de esquema
ni migraciones). Hoy no hay filas ProTipster en producción, así que no afecta
a los conteos de la propuesta.

Incertidumbre conservada: la página https://www.protipster.es/sobre-nosotros
(verificada en vivo 2026-11-20) prueba registro gratuito y acceso a tips
gratuitos ("Es completamente gratuito registrarse", tips visibles sin
registro), pero NO prueba por sí sola la ausencia universal de suscripciones
por tipster. Esta rama NO establece la semántica Free/Pago de ProTipster: el
alcance de esa fuente y del modelo lo resuelve el responsable de PT (ya
consultado 2026-11-20). Caveat de compatibilidad a resolver en el merge, no
una decisión de clasificación: con el clasificador actual, filas PT con
is_paid=false caerían en la rama por defecto (booleano), lo que NO debe
leerse como Free afirmativo sin esa decisión.
