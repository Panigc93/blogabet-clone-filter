# Local adaptation to current master

17 November 2026. Base: dafaa1617578cb06534340f3660fd5f4b988e8a2, including merged Bet2Invest work.

## Implemented locally
- `normalizeOlbg` emits the shared NormalizedTipster shape. Monthly published ROI remains `yieldPct` with unknown basis. Closed-window own returns use a new optional `derivedYield` field with its basis, approximate marker, denominator and month coverage. No existing platform's contract meaning is changed.
- `fromOlbgPrepared` maps the validated preparation to existing TipsterCardData. Existing all-time cells remain null. Closed 3/6/12-month values and six-month picks average are used only in their existing period cells. Missing months remain null. Full source ROI and provenance stay in the prepared source/normalized samples, not overwritten by the view model.
- `TipsterRow` adds OLBG naming and a small visible calculated-approximate note inside existing period cells. No new panel, route, button type or CSS file. OLBG-only cell sizing prevents the note from collapsing on mobile; existing platform cell styling is preserved.
- `fromDbTipster` explicitly rejects OLBG scalar rows rather than falling through to the Blogabet mapper. No OLBG database path or import action is silently enabled.
- A local rendering script creates private review HTML, not an application route.

## Validation
- Combined Vitest: 478 passed, 8 skipped (existing real PostgreSQL opt-in suite, no local PG socket), 0 failed.
- TypeScript passed.
- Next build passed with NEXT_IGNORE_INCORRECT_LOCKFILE=1. Existing lint warnings remain. No package/lockfile change.
- Final row inspected as pixels at 390 and 1280 viewport widths after fixing initial narrow period-cell wrapping. No horizontal overflow. Positive, negative, missing and incomplete data are distinct. Preview uses existing stylesheet and row component. Standard external fonts/icons were not downloaded, so local preview uses fallback font and omits the optional icon font glyph.
- Final small OLBG-only period-width correction was checked by TypeScript and refreshed screenshot after the complete suite/build. It does not affect calculations or non-OLBG rows.
- No changes to B2I period pagination, 409 behavior, active-period index, filters/query, API routes, schema, migrations, workflows or production.

## Remaining technical block, not a completed integration
The database `picks` column is NOT NULL with default 0 and the principal stats are all-time. OLBG only exposes a rolling monthly window here, not all-time. The database also lacks OLBG provenance, published monthly ROI and computed basis/window metadata. Writing numeric period values into those scalar all-time fields would be false.

A later local persistence proposal should retain a platform-specific monthly evidence record, a dated active closed-window projection and source receipts, and expose it through the existing query/card path. It needs agreed null/all-time behavior for picks filtering and ordering, source-only versus derived yield distinctions in API projection, and freshness/anchor handling on rollover, without changing B2I's active index. The default all-platform yield sort cannot pretend the unknown OLBG all-time yield is a 12-month yield. Existing period sorts can use complete dated derived windows only after provenance eligibility is implemented and reviewed.

No mass profile capture, selector activation, database import, push, PR or merge occurred. The private 867-ID discovery set and three pilot profiles are not an imported OLBG catalog. The old isolated OlbgStats component remains unused and is not the proposed presentation.
