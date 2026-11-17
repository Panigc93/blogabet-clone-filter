# Bettingexpert: preparation for Clone Filter

Checked 17 November 2026. This change is local, offline preparation only.

## Verified route

The public frontend uses `filterTips` at https://api.bcarena.net/graphql with
`BC-Arena-Client: bettingexpert-next`. Filter by discovery GUID, request one
pick and read `tips[0].user.stats`, not the tip's own performance and not the
sports ranking. Six aliases in one read request succeeded in 1.80 seconds.
This is a single latency observation, not a service guarantee or rate limit.

The six `stats.tipsCount` values exactly match the corresponding public
profile totals. Profit/yield have extra source precision. Preserve this
precision rather than recreating the UI's rounding. `winRate` is null in this
response, even though HTML profiles display it. Null remains null.

`filterTips.count` is NOT the author's aggregate tips count. It differs in
all six samples and must never fill `picks`. Source GUID and username must
both match the requested discovery identity. A missing tip cannot prove
that the account does not exist. Such cases need an HTML fallback/review.

Profiles verified, five discovered only in sports segments:

| Profile | Profile tips | Profile profit | Profile displayed yield |
| --- | ---: | ---: | ---: |
| https://www.bettingexpert.com/user/profile/Black_Panther | 5635 | -139.27 | -0.28% |
| https://www.bettingexpert.com/user/profile/johnnyvee | 30216 | -82.39 | -0.03% |
| https://www.bettingexpert.com/user/profile/Abeyek | 62248 | -9449.17 | -1.87% |
| https://www.bettingexpert.com/user/profile/Intuition | 142672 | -14174.53 | -1.03% |
| https://www.bettingexpert.com/user/profile/Rubendrn1995 | 11398 | -2962.63 | -3.39% |
| https://www.bettingexpert.com/user/profile/DelPiero28 | 8631 | 703.42 | 0.96% |

These are source-reported Overall stats, not a reconciled all-time ledger.
The source ranking has different aggregates. Never substitute sports stats.
The five missing-global examples are negative globally, positive in their
respective sampled sports. That suggests selection bias but does not prove
why every one of the 9211 is absent from the global ranking.

## What this can contribute to Clone Filter

A new source-specific preparation record can supply identity, source capture
time, picks, profit and yield. Optional HTML enrichment supplies average
stake/odds and win rate. Profit uses its own bettingexpert-points label,
never EUR or another platform's units. Period yields remain null.

The current application does not yet expose Bettingexpert: shared platform
union, selector, URL helper, row mapping, source unit policy and query/API
filters need a separate reviewed change. This patch does NOT add a selector,
change schemas, call DB code, publish a PR, or deploy anything. It supplies
pure parser/query-builder modules and real-source offline fixtures first.
There is no import-ready permission implied by these records.

## Period history remains a separate quality problem

A bounded 20-pick sample for DelPiero28 returned count 8526 while the profile
says 8631. It includes event dates in years 8700, 5200, 4200 and 2400. Several
2018 created picks have updated dates in 2026. The frontend sorts MATCHTIME
DESC, so the first old creation does not mean the remaining history is old.
Do not use updated as a bet date, trust event-date order, stop on the first
old pick, or derive recent periods from this partial sample. Publication
date and settlement date are different concepts and still need a consistent
period convention plus coverage/reconciliation evidence.

## Proposed capture plan, awaiting scope agreement

- Capture the 9211 GUIDs missing from the global ranking only; do not repeat
  sport discovery and do not fetch full pick histories.
- Six GUIDs per request, with a proposed 15-second pause between requests.
  This cadence is our cautious choice, NOT an official site limit.
- 1536 batches. Pauses alone require about 6h24; the one measured latency
  would put an illustrative full pass around 7h10, without retries/fallbacks.
  Neither completion time nor six-row success generalizes from one request.
- Start with a 10-batch pilot (60 profiles), check identity/count agreement,
  response latency, error rate and nulls before deciding whether to continue.
- Persist raw response, requested GUIDs, timestamp, query version, checksum,
  successful records and unresolved status after every batch. Resume only
  unprocessed identities and deduplicate by GUID plus capture identity.
- Stop on 403, 429, challenge, or consecutive errors; no automatic IP/config
  rotation, challenge avoidance, account use or retries on a blocked source.
- A GraphQL error quarantines that response conservatively. A renamed or
  missing user remains unresolved, never copied from another row. HTML
  fallback is a separate bounded queue, not an unbounded silent retry.
- Keep private checkpoint data outside the public repository. No network
  runner or checkpoint executor is implemented by this patch.

## Test fixture provenance

HTML fixtures are faithful canonical+header+Overall stats DOM excerpts from
the six live profiles, fetched during 17:38-17:40 UTC. Bios, scripts, contact
details and tip cards are excluded. Batch fixture is the complete data-only
response from the single six-GUID request around 17:43 UTC. Test capturedAt
values are test contexts, not asserted exact timestamps of the original
fetches. Edge-case mutations exist only in tests, never in real fixtures.

No service credentials, cookies, database connections, account changes,
production effects or bulk crawl occurred.

## Local integration delta (not deployed)

The follow-up delta adds the Bettingexpert selector option and source-specific
card mapper, a pure insert mapper with an explicit caller-supplied internal ID,
source units bettingexpert-points and pt BE display, and shared SQL period
masking before ordering/pagination. The API strips all BE period fields even
if stored rows were contaminated. Combined profit ordering remains grouped by
profit_unit; the API now includes the same unit warning as the homepage.

Only BE typography/widths and two-decimal yield display change; the existing
card layout and all other source display paths stay unchanged. Activity,
since, followers, verification and recent-period statistics remain unknown.
No new page, control beyond the existing source selector, migration or remote
write is introduced. Manual generic imports remain unchanged and do not gain
permission to import Bettingexpert by this type extension.

PGlite integration tests apply all six existing migrations and insert six
real-capture BE rows plus synthetic BB/Tipstrr/Golazobets sentinels. Tests
prove own-unit mapping, numeric DB rounding, same-slug platform isolation,
null BE period ordering before LIMIT/OFFSET in the combined list, and API/card
masking of deliberately contaminated period columns. PGlite is a local query
compatibility test, not a production contention/latency test.

Capture was authorized by Juan in the trusted 17 November 18:47 CET WhatsApp
message: missing 9211 global-profile totals, six GUIDs per query, ten seconds
between requests, stop on limits/repeated errors; also investigate periods.
The local runner checkpoints each response privately with checksum and source
manifest identity. It is deliberately outside the deliverable git delta;
public source captures/checkpoint state are not added to the public repo.

Numeric precision caveat: the current DB stores profit at 3dp and yield at
2dp. The BE card displays up to 3 profit decimals, avoiding a second rounding
step on a DB-rounded amount. Source API values remain in the private capture.
A tie such as source yield -1.035 can be stored -1.04 by numeric DB rounding,
while the source HTML showed -1.03; this is a precision boundary, not an
invented recomputation of yield or proof that the source is inconsistent.
