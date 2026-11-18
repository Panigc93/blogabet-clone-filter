# Bettingexpert period preparation

This directory vendors reviewed V7 pure accounting and bounded collector logic from c259f92362a70c26f242b6071cc8eb8a332e8706. No live transport, authorized-run scripts, raw ledgers, credentials, network default or DB writer is included. Existing global importer and production readers remain unchanged and period-null by default.

`stage.py` binds exact GUID and username to the original global capture, retaining its time unchanged. Period capture is the latest period response. Official-anchor response time remains separate. It invokes the exact four-alias V7 query/boundary validator, independently per identity and window. Source anchor count and profit must match observed CLOSED ledger, with only that window's reviewed exact-GUID exceptions. No generic VOID/half-loss rule. Missing source author is unknown, never zero. No compatible anchor means staged values null even if the default reader's arithmetic exists.

`python scripts/bettingexpert-stage-periods.py GLOBAL_JSON GUID EVIDENCE_DIR OUTPUT_JSON READ_AT` creates a private staged file, not a database import. Evidence files come from the private reviewed capture pipeline. An arbitrary client's JSON is not accepted as a trusted source, and file hashes do not authenticate it. Read time must match the intended source month. Re-run locally from verified retained evidence after any source-month rollover; do not retain old values.

`python -m unittest discover -s crawler/platforms/bettingexpert/periods -p 'test_*.py'` tests only the new binding wrapper. Reviewed V7 upstream tests were not duplicated. Raw evidence and the original test corpus remain private outside the repository. Source accounting is captured_snapshot/atomicfalse, not an immutable snapshot or proof that the underlying source is complete.

## Live pilot boundary

Two-profile bounded pilot on18Nov2026 used7of15allowed GETs, including one shared exact four-alias official-anchor request. LudaKvota retained local arithmetic for3m/6m but lacks an author in the required official anchors, so all staged periods null. Aomine has51current-month tips and no closed sample, so null. This confirms that a selective ranking is not guaranteed to anchor a catalogue-wide collector. Wewillrockyou retained V7 evidence supplies all three reconciled windows, and is the positive offline binding check.

## Product boundary still open

Staged values are NOT yet SQL/card-visible. A reviewed server-only receipt store and SQL join must preserve exact identity, separate global/period capture timestamps, source-month eligibility, independent per-window null reasons, same values in filtering/sorting/pagination and API/card projection. Until that exists, current product masking stays null. Do not write periods to DB columns and expect them to appear, do not reuse B2I audit identity as if it were BE, and do not label the pilot adapter production ready. No UI work is part of this delta.
