# OLBG published monthly candidate, local review only

Base: master57351da. Branch prep/olbg-published-monthly. No rejected fixed-stake branch delta is included. No activation, deployment, DB writes, scheduled collection, contact or network collection.

## Implemented
- Offline projection of561 accepted retained identities /6020 global All Tips monthly rows. Each raw matched to successful receipt SHA before parsing. Registration from identity-matched about body. Month ROI, Profit and picks retain source strings alongside numeric values. No LSP substitution, no FX/unit conversion, no ratio aggregation.
- Separate monthly view-model entry point. Common lifetime/global3/6/12 yield/profit/picks fields remain null. Existing TipsterRow gains an optional monthly display path; other platform paths and standard list/query are unchanged.
- Same card styling, one profile each. Month always explicit. Since means registration. Profit labelled Profit OLBG and its unconfirmed scale explained in the single Historial parcial detail. Entire retained monthly history in the detail, current source month marked in progress. Missing is not zero.
- Local LAB_PREVIEW=1 page /lab/olbg-monthly, using3 real retained profiles: Grobler280, BillShut26244, J2BLUE22513 (missingOctober). No synthetic performance numbers. Preview contains only OLBG sample profiles for checking this new card path; this is NOT a proposed separate production listing.
- Latest-available month per profile permitted, explicitly labelled, not silently substituted for a named month. Numeric filter/sort only in explicit common-month mode, OLBG scope only. Minimum observed result-month rows is separate from Since or recency. Gaps never count as zero or consecutive completeness. Pure query filters before pagination.

## Existing filter semantics inspected
Activity checks recent publication/last pick, not minimum history length. Existing minYears applies only to BB sinceYear. Neither proves minimum OLBG betting-history months. Candidate result-month count is explicitly observed monthly rows with positive picks, not claimed account age or full career.

## Reproduce
npm test -- --run
npx tsc --noEmit --incremental false
npx tsx scripts/project-olbg-published-monthly.ts CAPTURE_DIR /private/output.json
./node_modules/esbuild/bin/esbuild scripts/preview-olbg-monthly.tsx --bundle --platform=browser --format=iife --outfile=/tmp/olbg-monthly-preview.js
node scripts/check-olbg-monthly-screens.mjs

Actual results:514passed,13skipped,60test files passed/2skipped.12 new monthly tests. TypeScript clean. Full561-row source projection passed receipt/identity/selector/number/date/unique-month checks. Browser checks cover latest mode, numeric disabling across heterogeneous months, common-month change, ROI filter/order, missing values, minimum result count, expanded13-month history and mobile overflow. Actual screenshots inspected on mobile390px and desktop1280px; no horizontal document overflow.

## Not implemented and not approved
No production data loader/importer/DB schema, no standard API/query/list integration, no full-catalog pagination route, no production filter controls. The local demo and pure query are preparation for review, not a finished import. No changes to API/auth or production OLBG hidden state. No new all-time/cumulative estimated yield. Existing master contains legacy OLBG fixed-stake code; this candidate does NOT activate it or route monthly values through it. Production integration must explicitly use the new mapper, preserve snapshot/selected-month semantics and recheck live current base before any approved execution.

The user's latest global-estimation question is under independent analysis. This candidate's monthly source data remains valid independently; any new global metric requires a separate reviewed change. No currency equivalence or cumulative estimate is implied by these files.


## Delta: common-list read integration (not production mounting)
- Pinned read-only JSON snapshot loader checks expected SHA, contract, all profile/source fields, duplicate IDs.
- Shared common-list pipeline combines complete baseline cards and monthly cards BEFORE filter/sort/paginate. Numeric monthly comparisons explicitly narrow scope to OLBG and one common month. Shared yield filtering excludes unknown monthly global yields, rather than interpreting them as0.
- Stable continuation pins both dataset revisions, actual baseline contents and query; stale revision or changed query rejects/restarts instead of appending inconsistent pages.
- Server adapter accepts complete TipsterReadRow baseline from a supplied reader, maps via the existing production mapper, and requires revision recheck after read. It is not yet wired to the live database loader.
- Actual Next SSR /lab/olbg-common and JSON /api/lab/olbg-common mount the common pipeline with the full561-profile validated retained snapshot plus a genuine dated existing StatMind Tipstrr fixture. Both require non-production NODE_ENV, LAB_PREVIEW=1, OLBG_MONTHLY_LOCAL=1 and a configured pinned local snapshot. No DB reads/writes or credentials. The source file path/digest are environment-only, not arbitrary request inputs.
- Actual Next harness checked562 common entries/12pages, identical SSR/API first-page order,511Oct filtered, query-mismatch409. It starts/stops its own local dev server. Dated real Tipstrr fixture is used only as a baseline integration example, not asserted current data. No real BB data is fabricated for the preview.
- Production home/API/LoadMore remain untouched; actual production repository may also advance through BE work. Mounting the new shared loader into those routes and reconciling their live filters/pagination remains a reviewed integration step before any release. No fixed-stake OLBG code is reactivated.
- Selector order labels shortened to fit mobile. Final expanded history screenshot and new common mobile/desktop screenshots visually inspected.

## Existing-route integration candidate (still disabled)

The same non-production gate now mounts the complete reader on existing `/`
and `/api/tipsters`, not only the lab. With the gate off or NODE_ENV=production,
the original SQL/LoadMore branch remains active. No DB import or activation.

- Existing SQL filters and ordering run over the COMPLETE non-OLBG baseline.
  Baseline ordering, including SQL ties and slug-search matches, is retained.
- Common pagination starts only after source monthly cards are merged.
  Cursor pins full source/baseline digest plus canonical filter identity.
- Monthly figures remain distinct from common historical fields. Missing
  month remains visible with unknown values, last in numeric ordering. A
  monthly numeric filter excludes missing values. October has 511 available
  results out of 561 profiles, never 561 claimed October results.
- Existing lifetime-picks, commercial-type and recent-activity filters exclude
  monthly-only OLBG when the corresponding fact is not established. BB-only
  filters retain their existing ignored-filter warning outside BB.
- `scripts/check-olbg-existing-next.mjs SNAPSHOT` starts the real app twice
  against the same disposable local DB and checks old/new baseline parity.
  Its 57 fabricated BB rows are plainly named BB Demo and exist only in the
  disposable test database. Two Tipstrr rows are dated retained fixtures.
  Real OLBG-only screenshots contain no fabricated BB data.
- Result: 21 normal filter/order query regressions, 620 common identities,
  13 pages, client LoadMore, SSR/API order equality, cursor mismatch 409,
  monthly month-switch URL update, no external credentials. Found and fixed
  SSR/API object-key-order cursor mismatch during the real client test.
- This revision precedes the subsequently approved estimated global metric.
  That estimator will be a separately reviewable delta, not silently added
  to this monthly-only checkpoint.

## Approved estimated-yield candidate (still inactive)

The later user decision adds an explicitly estimated global metric. Default
existing-route candidate mode is now estimated, with an explicit switch back
to the published-month view. The lab retains its earlier published-only mode.

`lib/olbg-estimated-global.ts` has no network or DB effects. For each nonzero
monthly ROI r and source Profit P, nominal inferred stake is 100P/r. The
estimated combined yield is 100 sum(P) / sum(inferred stake), never a picks
weighted mean or fixed-stake substitute. Profit exactness and the same
accounting scale/denominator between months are assumptions, not source facts.

Sensitivity intervals reproduce the reviewed nearest-integer and truncation
toward-zero scenarios, enveloping both. A nonzero Profit with ROI 0 gives a
lower stake bound but no upper stake bound. Zero Profit/zero ROI with positive
picks also leaves stake upper-unbounded, never stake=0. Any such month suppresses
the nominal central estimate but retains the one-sided conditional interval.
Inconsistent sign or nonzero ROI with zero Profit suppresses the calculation.

Global scope means all retained CLOSED monthly rows, not the whole career.
Missing months remain listed, never imputed. The capture's current month stays
excluded even if time later advances without a new capture. Fixed 3/6/12-month
values require every row in the declared closed calendar window. The card
shows period, retained pick count, source Profit sum and Yield estimado; original
monthly source values, range and assumptions remain in Historial parcial.
No currency conversion and no claim of certified real-error bounds.

Common Yield filters/sort use the nominal estimate alongside the existing
source-backed baseline, with OLBG marked estimated. An unavailable central
value is NULL, last on sort and excluded by either yield threshold. Lifetime
registration and source coverage remain separate. Numeric picks filtering
uses the displayed retained-month total in estimated mode. Monthly-only mode
keeps common accumulated metrics unknown. Existing non-OLBG SQL semantics
remain untouched, with 21 baseline query regressions checked in the real app.

Full retained-data validation (`scripts/check-olbg-estimates.ts SNAPSHOT
REVIEWED_INTERVAL_RESULT`) reproduces 3,471 interval objects across all 3/6/12
windows to 1e-10 against the previously reviewed independent analysis. Global
available-closed: 450 central estimates, 111 interval-only, all 561 retained
identities. Niffler/638883: 12 months Nov2025–Oct2026, 2506 picks, Profit14537,
central12.0305708630%, envelope[10.8951946077,13.4262186532]. UI shows12.0% and
outward-rounded10.8–13.5%, not an exact reported OLBG global ROI.
