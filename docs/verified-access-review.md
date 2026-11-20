# Verified access review (Free/Paid)

Prepared code, not a deployed release. Reconstructed from the reviewed
bundle 5719433 (branch `research/free-paid-effective`, 2026-11-19, bundle
no longer available) on top of current master, with the same opt-in shape.

PRODUCT RULE (Juan, 2026-11-20 18:30, WhatsApp, verbatim "si no sabemos si
son de pago son free, pero compruebalo claro"): without proof of payment a
row stays in Free — unknown is NOT excluded from Free, and there are no
exceptions. Paid requires affirmative evidence. The earlier tri-state
draft (unknown excluded from both filters) was rejected by Juan. Internal
evidence states (observed date, signal text, blog-not-found) are kept on
the row without imposing any filter exclusion; removing dead blogs from
the catalog is the separate dead-cleanup decision, not a filter rule.

## What this is

An opt-in (`VERIFIED_ACCESS_REVIEW=1`) effective read of tipster access:
`free` / `paid`. With the flag unset,
every read path keeps the legacy boolean filter byte-for-byte. No
migration, no DB write, no crawler change, no UI badge change, no
freshness threshold.

- `lib/access-classification.ts` — pure `classifyAccess` + SQL
  `effectiveAccessSql` + `tipoCondition` (the flag switch).
- `lib/query.ts` — `buildFilters` `tipo` block delegates to
  `tipoCondition`; legacy `eq(isPaid, …)` is exactly the OFF path.
- `lib/olbg-read-context.ts` — the API read path applies `tipo` through
  `tipoCondition(p.tipo, projection.isPaid)`; same OFF equivalence.

The class is evaluated in WHERE before pagination, so Free/Paid filters,
counts and pages agree. The cards need no change: the Pago badge and
price only render on the effective paid class and no Free badge exists.

## Classification by platform (with the flag ON)

- **Blogabet**: affirmative paid evidence → Paid: a profile subscribe box
  (price or SERVICE FULL) or, on unread rows, the parsed listing price
  (`is_paid=true`). Everything else → Free (product rule): banner-free
  blogs, observed profiles with no paid signal, unread `is_paid=false`,
  and dead blogs (`blog-not-found` kept as internal evidence).
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
  values. No date threshold changes the class.

## Consequences of enabling today (with the 13 observed signals written)

Exact counts over the live Neon catalog (17,412 rows, read 2026-11-20
18:17): Free 15,720 → 15,719; Pago 1,692 → 1,690.

- ibet-35 moves Free → Pago (SERVICE FULL, stored `is_paid=false`).
- The 3 dead blogs leave Pago (their stored `is_paid=true` is stale) and
  join Free by the product rule, with internal `blog-not-found` evidence;
  removing them from the catalog is the separate dead-cleanup decision.
- Every other row keeps today's filter membership. Enabling remains a
  product decision for Juan.

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
  generic FOLLOW button. Under the product rule they are Free (no paid
  evidence); the observation is kept as internal evidence.
- **Deleted blogs answer "Blog not found"** (3/3 sampled from the 655
  stored non-verified+paid rows: versustips11, ouzbourne, iordan — all
  stale since <=2026-10-25). Stored flags on dead blogs are unreliable.

Free-pick history (paidStatsTab, picks_free columns) is NOT a free service:
ibet-35 publishes free picks while selling a full service.

Impact, kept separate:

- *Proven* (the 13 pages above, fixtures): the five signal shapes exist and
  the parser classifies them; one stored `is_paid=false` row is a full paid
  service.
- *Expected, not proven*: IF paid services hide among stored `is_paid=false`
  rows the way SERVICE FULL did, profile reads would move them to Paid —
  but only one such case was observed. Only 3 of the 655 stored
  non-verified+paid rows were checked (all dead). No stored row changes
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
- `lib/access-classification.ts`: Blogabet branch under the product rule —
  `access_class='paid'` is Paid; a dead blog is NULL (internal evidence);
  everything else is Free (`access_class='free'`, observed no-signal,
  unread `is_paid=false`); unread `is_paid=true` keeps Paid from the
  parsed listing price.
- `scripts/seed-isolated-db.ts`: applies 0006+0007 and seeds six
  fixture-backed Blogabet rows whose stored flags reproduce the real Neon
  state of each sampled slug (ibet-35 stored `is_paid=false`).

E2E on the isolated DB (`VERIFIED_ACCESS_REVIEW=1`, dev server + real UI),
under the product rule (unknown stays Free):

- `tipo=free` → all rows without affirmative paid evidence: the 19 demo
  `is_paid=false` rows, jj1ba0 (banner), yugovalue (observed no-signal)
  and StatMind (Tipstrr free).
- `tipo=paid` → 42 rows INCLUDING ibet-35 (SERVICE FULL, stored
  `is_paid=false`) and EXCLUDING versustips11 (dead blog whose stored
  `is_paid=true` is stale).
- versustips11 (dead) is Free by the product rule, with internal
  `blog-not-found` evidence and no paid badge or stale price on its card.
  Screenshots: ui-e2e-access-*.png.

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
   Sample expectation (3/3 dead): most would leave Pago; EXPECTED, not
   proven beyond the sample.
3. Probe phase B: 415 verified-paid + 164 verified-without-price rows
   (~1.6h). Paid rows keep Pago with the observed price (or without price
   if SERVICE FULL); no-signal rows are confirmed Free with evidence.
4. Probe phase C (largest, the "compruebalo" sweep): the 10,430 stored
   `is_paid=false` rows (~29h). Only rows with a hidden paid signal
   (subscribe box / SERVICE FULL, like ibet-35) move out of Free; the
   rest stay Free by the product rule, now with observation evidence.
5. Activating VERIFIED_ACCESS_REVIEW is a pure read-path change; flag OFF
   restores legacy exactly. It is independent of the probe phases.

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
por tipster. Matiz confirmado por el responsable de PT (2026-11-20, tras su
captura de 971 peticiones): la fuente garantiza el FEED PÚBLICO gratis, no el
tipster completo/universal; si el filtro clasifica al tipster completo,
quedará desconocido sin prueba adicional. Esta rama NO establece la semántica
Free/Pago de ProTipster: el responsable de PT corregirá su comentario amplio
y alineará la semántica en su validación. Caveat de compatibilidad a resolver
en el merge, no una decisión de clasificación: con el clasificador actual,
filas PT con is_paid=false caerían en la rama por defecto (booleano), lo que
NO debe leerse como Free afirmativo sin esa decisión.
