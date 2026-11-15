# Multi-platform design: Tipstrr and Golazobets

Status: design + isolated prototype. Nothing here touches master data, Neon
production, or GitHub Actions. Base: master `932c36e` (post PR #9).

Goal: Superblogabet gathers tipsters from several platforms (not only
Blogabet) so they can be searched and compared with the MYS method in one
site. First platforms: Tipstrr and Golazobets.

## Non-negotiable data rules

- Absent fields are `null`, never `0`.
- Every stored metric keeps its provenance: source platform, source field,
  period, units, and stake basis. No cross-platform equivalence is claimed
  unless a platform's own documentation states it.
- MYS is evaluated per sample: muestra (>= 100 picks) and yield (>= 11%) must
  come from the SAME sample (global, or one sport/category/league). Paid vs
  free does not decide seguibilidad; access cost is data, not a verdict.
- Personal data minimization: Golazobets payloads embed tipster emails. The
  parser never reads them; they are never stored, logged, or used in fixtures.

## Platform assessment (verified 2026-11-15)

### Golazobets (golazobets.com)

- Spanish platform (Laravel + Inertia; operator named on /legal). Public
  pages embed the full JSON payload in the `data-page` attribute. No login,
  no bot wall observed from a sandbox datacenter IP for single GETs.
- Catalog: `/tipsters?page=N` (observed snapshot: 28 pages x 36 = 1,001
  tipsters; a snapshot, not a completeness guarantee). Each item: free/
  premium type, sport, picks count, and aggregate stats (`number_bets`,
  `total_bet`, `profit`, `yield`, `average_stake`, `average_odds`,
  `win_rate`). Note `picks_count` and `number_bets` can differ slightly;
  both are kept with their source name.
- Profile: `/tipster/<username>`: monthly stats (year/month with picks and
  yield), breakdowns by sport, bookmaker, stake and odds band, paginated
  individual picks with competition names. Enough for MYS globally and per
  sport, and for period tracking.
- Terms: /legal section 13 prohibits "uso automatizado no autorizado".
  robots.txt allows crawling of these paths. Reading: small-scale manual
  validation is fine; any recurring or full-catalog automated run needs the
  platform's authorization first (info@golazobets.com). GATE.
- Hypothesis (unverified): a plain GET from GitHub Actions would work
  technically. Not tested there; no remote workflow will be launched to test
  it without the authorization above.

### Tipstrr (tipstrr.com)

- UK platform (Tipstrr Ltd). Verified in a normal browser session: sport
  pages (`/football`, `/horse-racing`, ...) with discovery filters
  (order: rating/profit/ROI; type: Premium/Free; period: 1/3/6/12 months or
  all time) and "Load more" pagination. Profiles `/tipster/<slug>` with a
  `/stats` page: monthly profit by year, breakdowns by sport, market,
  bookmaker and league (Tips, Win rate, Profit, ROI, Avg odds).
- Metric semantics, captured verbatim from the site's own stats page:
  profit is calculated either with all tips "as if they were staked with
  10/10 units" (level stakes enabled) or with "the tipster's advised stake"
  (disabled, the default); "Numbers in these statistics are based on a
  staking plan of 1 to 10 units, where 10/10 units is equivalent to £10...
  Stats are updated every 24 hours." Their headline metric is ROI on the
  advised-stakes basis by default. Whether the level-stakes toggle
  recomputes the displayed tables could not be confirmed (state flipped,
  figures unchanged); treat as unverified.
- Access limits:
  - Cloudflare managed challenge from datacenter IPs (observed on homepage
    and sitemap via curl). A GitHub Actions crawler would very likely be
    blocked; not attempted and not evaded.
  - The `/stats` tables load via JavaScript after render; plain HTML fetches
    miss them. Their robots.txt disallows `/api`, so the JSON feeding those
    tables is not a legitimate route.
  - Terms (tipstrr.com/legal/terms-and-conditions, "Last updated: 4th August
    2018"). Acceptable Use: "You agree that you will not provide Content on
    the Site, or use the Site, or use information from the Site that: ...
    uses manual or automated techniques to monitor or replicate the Site, or
    any content it contains." Plus the IP clause: all rights to the site's
    "data, content, technology" remain Tipstrr Ltd property. No exception
    for affiliates or partners appears in these terms.
- Permission status: UNKNOWN. No Tipstrr account exists in the owner's
  vault, no grant is recorded, and no official public API or data-feed
  documentation was found (searched 2026-11-15). Their affiliate program
  (tipstrr.com/affiliates, signup at partners.tipstrr.com) is a referral
  commission scheme; nothing in its public materials grants data extraction
  or republication rights, so it does NOT resolve the permission question.
  The missing permission is written authorization from Tipstrr Ltd to
  extract and republish their verified stats. Official contact per their
  terms: support@tipstrr.com. Contacting them or signing up for anything is
  the owner's decision. GATE.
- Until then: the `crawler/platforms/tipstrr/` module has no fetcher. It is
  a pure parser validated only with FABRICATED fixtures, to keep the
  architecture testable without integrating real data.

## Proposed data model (design only; no migration yet)

New tables, nothing changes in the existing `tipsters` table:

```text
platform_tipsters
  id            serial PK
  platform      text          -- 'golazobets' | 'tipstrr'
  platform_id   text          -- their id or slug
  username      text
  profile_url   text
  account_type  text          -- 'free' | 'premium' | 'unknown'
  sport_name    text          -- primary sport label, as reported
  followers     integer
  UNIQUE (platform, platform_id)

platform_tipster_stats
  id            serial PK
  platform_tipster_id  FK
  scope         text          -- 'all_time' | 'month' | 'sport' | 'bookie' | ...
  scope_key     text          -- e.g. '2026-05', 'Fútbol'
  period_label  text          -- as shown by the source, e.g. 'last 12 months'
  picks         integer
  profit_units  numeric
  yield_pct     numeric       -- source's own yield/ROI figure
  yield_basis   text          -- e.g. 'advised stakes' | 'level stakes' | 'platform total_bet'
  avg_stake     numeric
  avg_odds      numeric
  win_rate_pct  numeric
  captured_at   timestamptz
```

## Prototype in this branch

- `crawler/platforms/golazobets/parse.ts` — pure parser (Inertia `data-page`
  -> normalized records). No HTTP, no DB, no email field ever read.
- `crawler/platforms/golazobets/fetch.ts` — LOCAL, small-scale prototype
  fetcher (max 5 pages, 3 s delay, JSONL out). Not for Actions; see the
  authorization gate above.
- `crawler/platforms/mys.ts` — shared MYS evaluation (muestra + yield over
  the same sample; unknown inputs yield `null`, not `false`).
- `tests/crawler/golazobets-parse.test.ts` — fixtures modelled on the real
  payload with fictional identities.

## Phasing

1. This PR: design + parser prototype + tests. No production effect.
2. Golazobets: owner asks the platform for authorization -> then production
   crawler design (cadence, rate limits, block policy reuse from PR #9).
3. Tipstrr: owner decides whether to request written authorization from
   Tipstrr Ltd (support@tipstrr.com). Without it there is no Tipstrr
   crawler: a datacenter crawler is neither viable (Cloudflare) nor allowed
   (terms). The site's structure is already mapped above, and the parser
   architecture is tested with fabricated fixtures, so integration can move
   fast if permission arrives.
4. Unified UI: platform filter and per-metric provenance badges in the
   listing, only once at least one platform writes real rows.
