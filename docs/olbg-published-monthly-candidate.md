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

### User preview steering, 2026-11-18 14:04 local

Main card now keeps the usual size/labels and shows a small `est.` beside the
Yield percentage. The period/month-count band and extra estimated-mode controls
are removed from the default list, with period/coverage/range retained in the
existing Historial parcial detail. The ordinary Yield min/max and sort remain
the only yield controls. No accounting or filter semantics changed in this
visual-only revision. The published-month route mode remains available for
review; the source table is always present in each estimated card's detail.

## Release preflight candidate, NOT deployment approval

This document records implementation and verification only. It grants no
permission to upload, change settings, merge, publish, or write production DB.
Product decisions belong to the authenticated conversation. Recover the
original messages when executing later; this repository is not their authority.
Relevant review anchors: user chose estimated global yield 2026-11-18 13:53,
compact estimate marker/normal Yield filter 14:04, orange button 14:19, and
approved history placement above the button at 14:30 local Europe/Madrid.

A separate server flag `OLBG_PUBLISHED_ESTIMATES=1` can now select existing
home/API routes in a production build; it defaults OFF. LAB_PREVIEW variables
cannot enable this production path. The production flag does not enable labs
or legacy fixed-stake OLBG activation. No environment has been changed.

A private untracked `.private-data/olbg/*.json` can be traced into server
functions, including `/` and `/api/tipsters`. Local builds include the file in
all app-route trace manifests through Next's shared graph, not exclusively
those two routes. These remain server-side traces, not static/public assets.
A production-runtime local smoke
confirms the raw URL returns404, OLBG labs404, and the estimate renders. The
artifact must be supplied separately to an authorized deployment; a Git-based
build cannot magically read this local file. No raw file has entered Git.
No connected project storage was shown in Vercel's project Storage page on
2026-11-18. No Blob/service/account was created.

IMPORTANT: current middleware excludes `/api/tipsters` from authentication.
This is pre-existing. Home requires login, raw artifact has no served URL,
but the API delivers projected listing data without login. Do not describe
these data as accessible only to authenticated visitors. This preflight does
not change that audience or authorize a future disclosure.

The original complete-row revision guard restarted reads during harmless
crawler refreshes: four `statsUpdatedAt` values changed between two complete
SELECTs while row identity/order and every other field remained identical.
The proposed semantic fingerprint excludes ONLY statsUpdatedAt, which no
current card/filter/order reads. Every other existing or future field remains
in the hash, including capturedAt, avatar, identity, classification, activity,
audit evidence, metrics, row membership and SQL ordering. Both adapter digest
and before/after baseline guard use this function; changing only one would
leave the refresh-reset bug. Tests pin these distinctions. No auth or source
staleness checks are removed.

Read-only live baseline benchmark on the established DB:13175 non-OLBG rows,
11.3MB JSON per full SELECT, two SELECTs2.73s/2.32s, total context/read/merge
6.94s, RSS325MB; merged total13736. These are one local-process observation,
not Vercel latency/concurrency guarantees. The DB was not written. Refresh
metadata changed but the semantic revision stayed pinned. Current reader still
reads the full baseline twice per request; safe optimization remains separate
from this guard correction and must not silently use stale cached metrics.

Reproduce locally: build with the private artifact in the ignored directory,
then run `scripts/check-olbg-production-runtime.mjs DISPOSABLE_PGLITE_DIR
ABSOLUTE_PRIVATE_SNAPSHOT_PATH`. It refuses live DB credentials. The optional
`check-olbg-production-baseline.ts CREDENTIAL_FILE SNAPSHOT` is a bounded
read-only live benchmark; never put the credential or raw rows in logs or
review packages. No scheduled collection or persistent crawler is created.

## Separate optimization candidate: atomic statement snapshot

Choice: use a single complete ordinary PostgreSQL SELECT per page request,
not two complete transfers and not a TTL cache. PostgreSQL guarantees this
statement sees its committed start-time snapshot. All rows are filtered and
ordered within that one statement; the full semantic digest still goes in
the cursor. Each next page performs a fresh complete SELECT and rejects a
changed digest before appending. Source-context revision recheck remains.
The generic adapter retains its conservative double-read default unless the
caller explicitly declares an atomic statement reader and supplies the
source-context guard. No stale cross-request cache is introduced.

Observable contract: the displayed page is coherent as of its SELECT, not a
promise that no record changed while HTML was being computed afterward.
Neither double-read nor compact digest recheck can guarantee no write after
the final check; both still require cursor validation on the next request.
A compact SQL digest would preserve a second-statement check with less network
traffic, but would still rescan/sort the full query, add a roundtrip, require
SQL/JS canonicalization or a new SQL hash contract, and retain avoidable
restarts on legitimate concurrent writes. It has no demonstrated correctness
benefit for this read-only listing's snapshot contract. Thus atomic SELECT is
the simpler supported choice, pending independent review, not an implemented
production change.

One bounded read-only comparison: double SELECT total6.94s/RSS325MB vs atomic
SELECT4.83s/RSS285MB. Each complete baseline has13175rows/11.3MB; both merged
13736cards. These observations were several minutes apart and not a controlled
load test or Vercel latency claim. Atomic removes one11.3MB transfer, one full
query and its allocation by construction. All normal filter and cursor tests
still pass. No SQL writes, background jobs, caches or external settings.

Source of SELECT semantics:
https://www.postgresql.org/docs/current/transaction-iso.html

## Concrete existing-host delivery route, not executed

Vercel's documented prebuilt flow is `vercel pull`, `vercel build`, then
`vercel deploy --prebuilt` to the linked EXISTING project. The build output
contains server function artifacts, so the ignored snapshot can be included
in the private function trace without entering the public Git repository and
without a new storage service. No upload or
Vercel setting change was made in this preparation.

Sources inspected:
https://vercel.com/docs/cli/deploying-from-cli
https://vercel.com/docs/cli/build
https://vercel.com/docs/cli/deploy
https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions

The current project is superblogabet in the existing Hobby team, with browser
access confirmed. There is no local linked Vercel CLI project/token yet. The
next authorized execution must authenticate the CLI to that same account,
pull existing project settings (secret values never printed), inspect actual
`.vercel/output` for the raw file in functions only and no static route, then
stage the exact reviewed build. A regular `next build` trace check has passed;
the actual Vercel Build Output and staging have NOT been generated/uploaded.
No assumption that a generic Next build is itself a deployable Vercel artifact.

Do not expose `.private-data` with a standalone static deployment. Do not
upload raw source data to GitHub or create Blob. Regular future Git redeploys
would omit this untracked artifact, so the selected workflow must remain the
reviewed prebuilt flow until a separately authorized private build-input
mechanism is provided. This is an operational limitation, not automatic sync.
