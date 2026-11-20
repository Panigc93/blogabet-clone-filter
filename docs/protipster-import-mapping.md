# ProTipster import mapping (prepared 2026-11-20, branch protipster-integration-prep)

Source: https://www.protipster.es (listing `/tipsters`, profiles `/tipster/<slug>`).
All evidence below captured 2026-11-20 via cloud browser, public navigation,
no login. Plain external HTTP requests got 403 that day and that route stays
stopped: capture runs through the browser, ≥10 s between research requests,
stop on any block.

## Data contract (verified live)

**Listing** `/tipsters?period=90-days` — filters: 7/30/90 days, sport, league,
market. ~25 rows per page; "Cargar más" carries `data-url` offset-based
(`/tipsters?period=90-days&offset=25`). The directory ends around offset ~200
(only tipsters ACTIVE in the window; not a historical catalog). Columns:
beneficio, yield, % acierto, picks, cuota media of the selected rolling window.

**Profile page** embeds the full preload state in one `<script>`
(`tplConfig.preloadStateData`), three mutations carry the import data:

| Mutation | Content |
|---|---|
| `UPP_DASHBOARD_OVERVIEW` | id, username (display case), usernameCanonical (slug), avatar filename or null, userJoinDate, countryCode |
| `UPP_SUMMARY_ADD_DATA` | followersCount, cumulativeStats (all-time profit, stakes, picks, yield, hitRate, averageOdds) |
| `UPP_CHART_DATA` | default window chart (`defaultDateCriteria: lastSixMonths`) + `chartFilters.dateFilters` = every month with activity since registration |

**Period dropdown** POSTs `/tipster/<slug>/dashboard-graph`
(`dateCriteria=<key>&lineCriteria[]=profit&lineCriteria[]=yield`) and returns
`chartData.globalGraphData` with EXACT profit, stakes, picks for the selected
period. Real capture: heroico 2026-10 → profit 7667, stakes 79080, picks 403
(7667/79080 = 9.70% = site yield 9.7).

## Window semantics (proven with numbers)

- **3m / 6m = rolling windows**, boundary calendar months clipped. Proof:
  heroico full May 2026 = −2897 profit, but the May row inside the 6m window
  = −1176; the 6m global (7252) equals the sum of the CLIPPED monthly rows.
  Stored as `yield3m`/`yield6m` (site-native windows).
- **`year` = all-time total, NOT last 12 months.** On heroico it matches
  cumulativeStats exactly (1031 picks incl. 2020-04). Never imported as 12m.
- **`YYYY-MM` = full calendar months** with exact profit+stakes.
- **yield12m = last 12 COMPLETE calendar months** at capture time
  (2026-11-20 capture → 2025-11..2026-10), computed sum(profit)/sum(stakes).
  User approved this definition 2026-11-20 (WhatsApp) with dates labelled.
  heroico: profit 4755 / stakes 142420 = 3.34%, 1026 picks.
- A rolling 12m exact window is NOT available (partial boundary months have
  no exact stakes). The 12m filter will be calendar-month based for this
  platform; do not mix it silently with the rolling windows of others.

## Mapping decisions

- `picks`/`profit`/`yield`: all-time cumulative. Yield columns store the
  EXACT computed profit/stakes*100 (2 decimals); the site's 1-decimal figure
  is a cross-check (|diff| > 0.15pp → hold `cuarentena[capture-inconsistency]`).
- `profitUnit: 'protipster-units'`: the site decorates numbers with '$' but
  stake presets are 5..100; never converted to money.
- `isPaid: false`: no paid/subscription concept found 2026-11-20 on listing,
  profile, or the public tips feed (195 pick links visible logged out; the
  only "premium" mention is the ProTipster app ad; "$20 $10 $5" on the tips
  page are competition prizes). Re-verify if the site ships subscriptions.
- `avatarUrl`: avatar filename → `/uploads/avatars/<base>.120.png`
  (almo7tarif real case). null when avatar is null (heroico).
- `sinceYear`/`signupAt`: from userJoinDate (site timezone not exposed;
  stored as UTC by convention, date-granularity only).
- `followers`, `countryCode`, `sourcePortfolioId` (numeric user id),
  `sourceUrl` (exact profile URL) from the preload blocks.
- `lastPickAt`: null (month granularity only, same as Apuestes). Activity
  filters read the 3/6/12m windows (yield NULL = no picks in window).
- Holds: `no-usable-content`, `months-incomplete` (an active month inside the
  12m window without its exact monthly capture), `capture-inconsistency`,
  `yield-out-of-schema-range`. Quarantined rows never write tipsters rows;
  they land in import_validation_log under the run id.

## Capture procedure for a full run (not executed)

Per profile: 1 page GET (identity + cumulative + 6m + active-month list) +
1 POST (3m) + 1 POST per active month inside the 12m window (≤12).
At ≥10 s between requests: ~1-2 min/profile for most, ~2.5 min worst case.
For ~222 tipsters (90d listing): roughly 4-8 h of spaced browser time.
Listing pagination: ~9 fetches for the 90d directory.

## Pending before production (needs explicit owner approval)

1. Prod DB: no migration needed (schema fits; source_url column from 0006
   must already exist remotely — verify before the run).
2. UI wiring (NOT in this branch): platform selector entry
   (`lib/query.ts` platform union + selector), activity-query coverage text
   (`lib/activity-query.ts`), card display of the calendar-12m label with
   exact dates, avatar hosting decision (hotlink vs uploaded copy like
   Apuestes PR #30).
3. Full capture execution + dry-run + review, then prod import with run id.
4. Free/Pago re-check at capture time (evidence above says free-only today).
5. Refresh cadence decision (profile data changes with every resolved pick).
