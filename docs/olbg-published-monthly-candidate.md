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
