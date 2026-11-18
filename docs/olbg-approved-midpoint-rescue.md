# Approved midpoint convention, local review delta

The owner selected the midpoint of intervals with maximum width2percentage
points in the authenticated conversation on18November2026at16:25Madrid.
This approves the method/preparation, not DB import, deployment or publication.
All previous release gates and private-source boundaries remain in force.

## Exact scope

Only previously interval-only GLOBAL available-closed estimates can be rescued.
The interval used for eligibility includes uncertainty of±1in each displayed
monthly Profit value, plus the existing envelope of two hypothetical ROI
formatting rules (nearest integer and truncation toward zero). No50..500stake
constraints, imputed average stakes, removed zero-ROI months, or pick-weighted
ROI averaging. Every retained closed month in the scope remains included.

If width<=2exactly, centralPct=(lowerPct+upperPct)/2. If wider or the bound cannot
be computed, central stays null. This is a convention, not the most likely
value, a confidence interval or proof of real performance. Price/profit units
remain source-native and unverified. Main card retains small est.; detail
states the convention, uncertainty and scope explicitly. No new badges,
layout, color or controls.

Existing450global estimate objects are byte-for-byte unchanged;1683period
objects (561profiles times3windows) unchanged. No6M-as-global replacement.
The global cursor query identity carries a new estimate-method version so old
pagination cannot append under changed calculations. Common card yieldPct is
the one value used by existing global filtering and ordering, before slicing.

## Range implementation

olbg-midpoint-range.ts represents each month's possible (Profit,stake) pairs
as linear constraints: Profit shown±1; percentage within either hypothetical
rounding strip; stake>=0. It enumerates feasible finite polygon vertices.
Linear-fractional extrema over sums are solved by finite Dinkelbach selection
of per-month vertices. A0-containing ROI strip has an unbounded positive stake
ray; its yield limit0is included in the bounds. Only stake is unbounded; the
yield intervals are finite. Iteration failure fails closed, never guesses.

The implementation needs no numerical package in production. Independently
reviewed offline LP results for all111previous interval-only profiles serve
as retained comparison evidence, not runtime input. Maximum observed bound
difference7.105427357601002e-15. Reproduction:

`npx tsx scripts/check-olbg-midpoint.ts PRODUCT_FILE REVIEWED_LP_RESULT`

Both arguments are private retained files, not committed source data.

## Real retained population

-19rescued:11negative,7positive,1midpoint0.
-450existing global central estimates remain unchanged.
-469global central values total,92still interval-only.
-No profile with width>2was rescued.
-The zero midpoint can have a nonzero interval, e.g. [-1,+1]. It is not proof
of exact zero yield. Losses remain negative and do not pass a0minimum.

Example in the actual integrated local listing: ChesterCopperpot104928,
883closed retained picks, Profit−538, midpoint−0.8404690169759067%, interval
approximately[-1.6809380339518134%,0%]. Card renders−0.8%est.; detail outward
rounds the range to−1.7%to0.0%. Existing3M−7.2%and6M−4.9%remain independent.
This is a local preview, not the live production site.

## Validation

555passed/13skipped full suite; tsc; production build and real Next runtime on
disposable local DB. Four new focused unit tests cover exact2ppinclusive,
zero/profit uncertainty, nonzero-ROI unchanged, no period rescue, wider-range
rejection and negative midpoint. Existing synthetic range coverage tests pass.
Retained-data check verifies all561identities/count/pagination, global sorting,
and threshold membership at−1/0/+1. Live local API confirms Chester is included
in−1..0and excluded by min0. Original450objects and1683periods explicitly
compared against prior estimator. Raw dataset SHA/manifests unchanged.

Desktop/mobile/detail screenshots inspected: approved photos, orange button
and history position unchanged; the convention paragraph is legible, no mobile
overflow. No Neon writes, new service, remote upload, config change or deploy.
