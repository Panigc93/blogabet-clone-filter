# Bet2Earn import mapping (prepared 2026-11-21, branch bet2earn-integration-prep)

Source: https://bet2earn.com — anonymous public JSON API, no login, no
cookies. Capture ran 2026-11-20 18:45 → 2026-11-21 06:50 CET at ≥10 s
between calls (one initial 8-call burst bug, fixed and disclosed), zero
blocks. Approved scope (owner, WhatsApp 2026-11-20 18:42): 62 Premium +
1,740 Free with ≥1 pick, capture + validate only, no production.

## Data contract (verified live)

**Listings** `/api/user/premium` and `/api/user/free`, offset pagination
(`start=N`, 10 per page). The exact UI parameter shape is required
(`filters[...]` incl. `filters[sortBy]=followersCount`); a wrong shape
returns `{"status":"Forbidden"}` (22-byte JSON), which is NOT a ban.
Free listing enumerated 1,740 profiles with ≥1 pick (`filters[picks]=1`).
Premium listing enumerated 62.

**Profile** `/api/user/{nombre-minusculas}` — identity (UUID `id`, `name`
in display case, `avatar` path, `created_at` signup), counters
(`count_tips` total picks, `tipsExpiredCount` declared settled picks,
`followers_count`) and published stats (`yield`, `profit`, `win_rate`).

**History** `/api/user/{nombre}/fullExpired` — `tipsFullExpired`: every
settled pick with `created_at` (publication), `validation_date`
(settlement), `profit`, `stake`, `odds`, `sport`. Per-pick figures arrive
UNROUNDED (up to ~18 decimal places observed in profit), so
sum(profit)/sum(stake) is exact.

## Proven semantics (with numbers)

- **Monthly tables bucket by `created_at`** (publication date), not
  settlement. Verified: a pick created 30-sep and settled 1-oct counts in
  September; with created_at the computed month equals the published one
  exactly.
- **Yield = profit/staked exactly.** The published profile yield is a
  display rounding: integer (15) → uniform rounding interval ±0.5;
  two decimals (15.74) → ±0.005. No propagated rounding error exists in
  the computed value (unrounded per-pick figures). Empirical check across
  the capture: 12 free profiles publish decimal yields; 11/12 match the
  computed value within ±0.004; the 12th (testweb, 4.58 off) is a real
  discrepancy, held.
- **Completeness = history length == profile `tipsExpiredCount`** (never
  `count_tips`, which includes non-expired picks).
- **Stakes are fractional units** (0.1–1). Profit is units, never €.

## Capture result (2026-11-21 06:50)

- 62/62 Premium captured and validated exact (108,732 picks).
- Free: 1,740 enumerated; 1,738 captured (2 returned 404 with no real
  alternative destination in the listing: ids 95b2d3dc…, 6ce4e044…).
- **Anonymous visibility gap: only 119/1,738 free profiles expose their
  expired history.** The other 1,619 return an empty list coherent with
  their own `tipsExpiredCount=0` despite `count_tips>0`. Cause NOT proven
  (a visibility/subscription hypothesis would need an authenticated
  session to test — out of the approved scope). Empty histories are held
  `cuarentena[no-usable-content]`, never imported as zeros.

## Validation v4 (2026-11-21, reproduced exactly by planBet2earnImport
## over the consolidated JSONL: 1,800 rows → 171 inserts, 1,629 holds)

Supersedes v3 (175): the TS plan applies three checks the python
validation missed, and all three caught real cases:

- **APTOS (import-ready): 171** = 60 Premium + 111 Free (history complete
  AND published yield inside its own rounding interval AND stakes>0 AND
  inside schema range).
- Group split note: v3's "62 Premium aptos" hid two offsetting errors —
  letalbets (PREMIUM, incomplete, missed by the python check) and LB
  PINNACLE (premium, 0 picks, consistent but nothing importable). v4
  premium = 62 − 2 = 60; v4 free = 113 − borjachb20 − c1cj0 = 111.
  "62/62 validated exact" at capture meant CONSISTENCY (history length ==
  declared tipsExpiredCount, 0==0 for LB PINNACLE), not importability;
  the 108,732 premium picks are the sum over the 61 profiles with picks
  (LB PINNACLE contributes 0).
- **Held with data (9):** letalbets PREMIUM (1,372 vs declared 1,373) and
  ASIANCONNECTION VICTOR free (1,038 vs 1,042) → history-incomplete;
  GALAICO_OUTBET1
  (7.75 vs 6), FumanchuBWIN (53.1 vs 9), nachoformula (96.7 vs 83),
  testweb (6.16 vs 10.74), testf1f1 (142.7 vs 149) →
  yield-out-of-interval; borjachb20 (1 pick with stake 0, published yield
  unverifiable) → capture-inconsistency; c1cj0 (yield 12,600 exceeds
  numeric(6,2)) → yield-out-of-schema-range. That hold is a DESTINATION
  schema limit, not proof of corrupt source data: the value (12,600) and
  its provenance are preserved as-is; neither schema nor data are altered
  to force it in.
- **Held without data:** 1,619 empty-history free + LB PINNACLE (premium
  account created 2026-11-05 with 0 picks: coherent empty, nothing to
  import) + 2 not-found.
- Coverage (computed from the data, b2e_cobertura12m_v4.json; 12m window
  = complete calendar months 2025-11..2026-10 at the 2026-11-21 capture;
  a profile counts with ≥1 pick in the window, no continuity assumed):
  aptos premium 60 → 59 with picks in the 12m window, last pick
  2026-04-30..2026-11-20, history back to 2012-08; aptos free 111 → 20
  with picks in the window, last pick 2020-09-07..2026-11-19, 78 with
  last pick before 2025, history back to 2016-04. Context: all 62 premium
  → 60 in-window; the 119 visible free → 21 in-window, 82 with last pick
  before 2025.

## Mapping decisions

- `picks`/`profit`/`yield`: all-time over the complete captured history;
  yield stored EXACT (2 decimals), published value used only as
  cross-check (`publishedYieldMatches`).
- `yield3m/6m/12m`: last 3/6/12 COMPLETE calendar months at capture time,
  `created_at` bucketing. The 12-complete-month definition reuses the
  owner instruction of 2026-11-20 12:46 CET (WhatsApp, authenticated
  channel: yield de "los 12 meses naturales completos", ProTipster
  context); it is NOT a rolling window and never mixes with one. A window
  with 0 picks imports NULL (true empty).
- `lastPickAt`: REAL per-pick date (max `created_at`) — unlike
  Apuestes/Bet2Invest/ProTipster (month granularity). Activity filters
  use it like Blogabet's.
- `slug`: lowercase profile name (the API path key). `sourceUrl`: the API
  URL actually fetched (a verified destination). The frontend profile
  route was never verified and is NOT used.
- `isPaid`: listing provenance — `premium` → true, `free` → false (owner
  product rule 2026-11-20 18:30: unconfirmed paid status stays Free).
  Package prices are not reliably exposed (`cheapest_package` contradicts
  `top_package` on observed premium profiles) → `price` NULL.
- `avatarUrl`: origin + avatar path; `/images/avatar-default.jpg` → NULL
  (not a real photo).
- `sourcePortfolioId`: NULL — the source key is a UUID and the column is
  integer; the UUID stays in the private capture as natural-key evidence.
- `sinceYear`/`signupAt`: profile `created_at` (site timezone not
  exposed; stored as UTC by convention, date granularity).
- Holds: `no-usable-content`, `history-incomplete`,
  `yield-out-of-interval`, `capture-inconsistency`,
  `yield-out-of-schema-range`. Held rows never write tipsters rows; they
  land in import_validation_log under the run id.

## Pending before production (needs explicit owner approval)

1. Scope decision: publish the 175 validated histories as-is, or first
   resolve the 1,619 anonymous-visibility free profiles (requires an
   authenticated session — a NEW account is out of scope unless the owner
   authorizes one).
2. Prod DB: no migration needed (schema fits; source_url column from 0006
   must exist remotely — verify before any run).
3. Consolidated payload: scripts/bet2earn-prepare-jsonl.py builds
   data/bet2earn/profiles.jsonl from the private capture; the pick-level
   raw data never enters the repo.
4. The 9 held profiles with data: investigate only with owner direction.
