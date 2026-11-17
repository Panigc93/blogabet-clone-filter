# Bet2Invest assessment (fourth platform candidate)

Status: offline preparation only. Parser + catalog seed + tests on a side
branch. No fetching at scale, no Neon writes, no workflow, no schedule, no
contact with the platform. Base: master `903059e`.

## What was verified (2026-11-16, individual public GETs)

- Profile pages `/tipsters/performance-stats/<slug>` are server-rendered
  (Nuxt SSR) and carry the full stats block in HTML: settled bets, profit,
  ROI, avg odds, avg max bet, CLV, betting summary counts, and a per-sport
  breakdown table. Stable `data-testid` hooks exist (`stats-profit`,
  `stats-roi`, `stats-settledBetsNumber`, `summary-row`, ...). No login
  required for two sampled profiles.
- Settled pick history is public on the picks tab; pending picks are shown
  to subscribers only (not accessed).
- `robots.txt` allows crawling of the public pages (it disallows `/admin/`,
  `/l/` and the terms pages). This is a crawl signal, not a data license.
- Cloudflare challenge script is embedded in pages, but single GETs from a
  datacenter IP returned 200 with full content. Behavior at volume or from
  GitHub Actions is untested and was not attempted.

## Metric semantics — partially verified, NOT closed

- Their documentation defines yield/ROI as profit divided by total staked
  (https://docs.bet2invest.com/experts/rating-system). The staked
  denominator is NOT displayed on the page.
- One sampled profile was internally consistent within rounding: the
  per-sport rows (profit / roi%) imply stakes of ~1118.5U and ~0.5U, whose
  sum (~1119U) divided into the displayed total profit reproduces the
  displayed ROI to the shown decimals. The per-sport profits sum to 51.14
  vs a displayed 51.13, i.e. the inputs are rounded displays. Treat this
  as approximate consistency, not an exact reconciliation.
- The listing column 'Profit (1U)' is a flat-stake figure and differs from
  the profile profit on the same row (64.50U vs 51.13U in one sample).
  The two modes are stored in separate fields and never mixed.
- Money figures keep the displayed currency symbol (e.g. '$'); when no
  symbol is shown the currency field stays null. No conversion is applied
  and no currency is assumed.
- Open for the pilot: recompute exact denominators from pick-level settled
  history, confirm void/refund treatment, confirm the period filter values
  (the 30d/3m/1y switch is client-side; `?period=30d` had no effect), and
  capture a populated 'Profit by month' section (only the empty state was
  observed).

## Coverage — located set, not a total

- `https://bet2invest.com/__sitemap__/en-us.xml` lists 300 profile URLs.
  That is the located set the platform indexes, not a proven catalog total.
- The listing page renders 50 data rows under the default 'at least 200
  bets' filter (the parser extracts 50; a raw string count of 51 was a
  stylesheet/script occurrence, not a row) with client-side infinite
  scroll; `?page=N` is ignored and no public listing API was found
  (`/api/tipsters` -> 404). Total catalog size and a legitimate
  enumeration route remain open pilot questions.
- The listing shows NO period label: its figures are stored with
  `periodLabel: null` and carry no period claim.
- The profile's profit/ROI stake basis is INFERRED (the page contrasts it
  with the flat 'Profit (1U)' mode), not labelled on the page. The Cloudflare
  challenge script is embedded even on complete pages, so the parser
  fails closed on missing expected content (stats block / listing table),
  not on the challenge marker alone. Test fixtures are fully synthetic;
  captured figures are not committed in tests.

## Load estimate — pauses only, not a proven duration

- A stats refresh is one GET per profile (all-time SSR page). At the same
  conservative 10.1 s pacing used for the other platforms, ~300 profiles
  imply ~51 minutes of pauses ALONE, plus network and validation time.
  This is a lower bound for the located set, not a measured duration and
  not a cost commitment.

## Permission — not established

- Terms of use art. 7 (https://bet2invest.com/blog/terms-of-use) lists
  databases among protected content and prohibits reproduction without
  consent. No reuse license was found.
- The official public API (https://api.bet2invest.com/v1/public/docs) is
  for a user's own strategies (PRO plan, API key): create/edit/backtest/
  track. Verified 2026-11-16: it exposes no tipster-data export endpoints.
- An 'Exporting bets' button exists on profiles; access conditions
  unverified (likely account-gated).
- Consequence: same standing as Tipstrr/Golazobets in
  `docs/multi-platform-design.md`. Recurring or full-catalog collection
  needs an authorized route first. No one has been contacted. This module
  stays offline (fixtures only) until the owner picks a verified route.

## Module layout (this branch)

- `crawler/platforms/bet2invest/parse.ts` — SSR HTML -> typed records.
- `crawler/platforms/bet2invest/catalog.ts` — sitemap -> located slugs.
- `tests/crawler/bet2invest-parse.test.ts`,
  `tests/crawler/bet2invest-catalog.test.ts` — fictional fixtures modelled
  on the captured shape; no real tipster data stored in tests.
- Deliberately NOT included yet: fetch.ts, workflow wiring, and any
  collection. The persistence mapping below is designed and tested offline
  (fixtures only); applying it (migration + Neon) stays a separate owner
  decision.

## Persistence mapping (2026-11-16, offline preparation)

Public-data integration is prepared offline, as for the other platforms. The
terms clause is treated as external evidence, not as a demonstrated legal
bar, and the platform is NOT contacted. Everything below is offline code on a
side branch: no fetching, no Neon writes, no workflow, no merge.

- `crawler/platforms/types.ts` — PlatformId gains 'bet2invest'; StakeBasis
  gains 'profile-stakes-inferred' (the page contrasts profile profit with
  the flat 'Profit (1U)' mode; the basis is inferred, never labelled).
- `crawler/platforms/bet2invest/to-db.ts` — profile record -> tipsters row
  with a closure gate, quarantine classes and Tipstrr-style upsert
  merge/plan (preserve-absents, freshness guards, surrogate-id provenance
  guard). PURE: no fetch, no DB.
- Gate closures WITHOUT the denominator (the page never shows total
  staked): results summary sums exactly to settledBets; per-sport bets sum
  exactly; per-sport profit overlaps the displayed total within the
  rounding interval (±0.005 per 2-decimal figure). The implied-stake
  (profit/roi) compatibility observed on one sample is documentary
  evidence only: with rounded percentages it does not prove the
  denominator, so it is NOT a gate — `yield` is stored as the source's
  published ROI with the inferred-basis label, never presented as
  recalculated.
- Quarantine classes: tipo-cuenta-desconocido (accountType 'unknown' —
  PRO absence in og:tags is not evidence of free; signal pending live
  validation, so most profiles would quarantine until then),
  periodo-no-all-time, stats-ausentes, resumen-incompleto,
  resumen-no-cierra, desglose-ausente, cierre-deporte-bets,
  cierre-deporte-profit, cero-inconsistente. Zero-real case (0 bets, all
  zeros/absent) persists picks 0 with yield null.
- Field discipline: profitUnit 'bet2invest-units' (not comparable with
  Tipstrr 'units' or 'golazobets-units'; profit sort groups by unit);
  price null (subscription price not captured; no currency assumed);
  sinceYear null (listing 'Since' semantics unverified); followers from
  the profile audience block or null; period yields and picks6mAvg null
  (monthly section only observed empty); capturedAt = capture instant.
- UI (same branch, not linked from the app until a real import exists):
  platform option in FilterBar; card-model mapper with provenance tooltips;
  'VER EN BET2INVEST' button in a proposed violet (#6a5aa8, owner's call,
  reversible); profit-sort warning now names the fourth unit; isolated
  preview at /lab/bet2invest with FULLY SYNTHETIC rows (no data, no real
  captures), guarded: the route 404s unless LAB_PREVIEW=1 is set, so it
  cannot be exposed by an accidental deploy ('not linked' is not enough —
  a deployed route is public even when nothing links to it). Verified
  2026-11-16: 404 without the env, 200 with it.
- Shared-file deltas for regression review: `crawler/platforms/types.ts`
  (additive union members only), `lib/query.ts` (platform union member,
  warning text, comment), `components/tipster-card-model.ts` (new branch),
  `components/TipsterRow.tsx` (label/colour ternaries),
  `components/FilterBar.tsx` (one option). No Blogabet/Tipstrr/Golazobets
  behaviour changes; BB-only filters stay BB-only.


## Validación pública 2026-11-16 (7 GET anónimos con curl, sin navegador)

Hechos (fuente: `b2i-validation-evidence.json`, adjunto a la revisión):
- Listado, sitemap y perfiles devuelven HTML SSR completo por GET simple.
- Listado `https://bet2invest.com/tipsters`: 50 filas, las 50 con badge PRO. Sitemap: 300 slugs, 47 en esas filas, 253 fuera.
- Perfiles WinZone y Justx (fuera del listado): og `Free Tipster`, sin botón Subscribe, sección mensual vacía con 446/963 liquidadas. Cierres exactos (resumen, bets y profit por deporte). La causa de que no aparezcan en el listado NO está establecida.
- followers 2 / rating 1 en ambos: posibles marcadores por defecto; no se persisten para Free.
- La cabecera de resultados omite categorías a 0 en esos perfiles; la leyenda DOM las da explícitas (parser corregido).
- GOALPROFESSOR: respuesta truncada por reset de conexión y luego timeout de 40 s con 0 bytes. Causa desconocida (no es 403/429); no se reintentó y no se declara bloqueo.

Alcance de las observaciones: 2 perfiles Free y 2 PRO. El parser reconoce las etiquetas explícitas; persistir Free con isPaid=false descansa sobre esa observación n=2. Etiquetas desconocidas siguen en cuarentena.

## Rastreador (preparado, no ejecutado)

`crawler/platforms/bet2invest/crawl.ts`: inyección de fetch/sleep/reloj, >=10,1 s entre peticiones, parada total ante 403/429 o fallo de transporte (reset/timeout), fail-closed por perfil, un resultado con clase por slug. Sin workflow, cron ni DB.


## Captura completa 2026-11-17 y selección de bankroll (observado, sin definiciones oficiales)

Instantánea 16:27Z (17:27 CET). Unidades separadas:
- Catálogo 970 perfiles = 961 SSR descargados + 9 fallos 502 aislados (sin reintento, quedan pendientes).
- 958 JSON de API calculados + 2 candidatos (fuera de cálculo). Cierre |yield - ROI cabecera| <= 0.005+1e-9: 950 dentro, 2 fuera sin causa atribuida, 6 vacíos.
- Cabecera vs API: apuestas iguales en 759, cabecera mayor en 193. Σbets de API == settledBetsNumber en 952/952 calculables. Es observación; la definición oficial no está verificada.

Selección de bankroll (`selectProfileIds`): un único público se toma tal cual; con varios, exactamente uno con default=true y (betsNumber, roi) == cabecera. Si no, `candidate` o `ambiguous`, nunca vinculado ni usado en cálculos. Un único bankroll no garantiza el mismo ámbito que la cabecera.

Reset (hipótesis NO verificada): 8 bankrolls con `current` 0 y `lastStatistics` no nulo. `extractBankrollBlocks` devuelve los bloques tal cual; no se suman, no se reconstruyen meses, la decisión de agregación queda abierta.

Serie mensual vacía = "sin datos": `monthsCloseWithTotals` devuelve false y `windowYield` da yield null; nunca cero.

Registro de revisión: 212 perfiles = 20 abiertos (error/ambigüedad/inconsistencia/hueco) + 192 informativos (193 filas cabecera != API y 100 de diferencia de ámbito, con solape).


Barreras reales vs decisiones futuras (separadas): push a rama, merge, importación a datos, activación en el filtro, workflow/cron. Ninguna autorizada en lo registrado.
