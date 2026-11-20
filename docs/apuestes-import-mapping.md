# Apuestes — import field mapping (local, dry-run only, no DB)

Source of truth: `data/apuestes/profiles.jsonl` (3.716 rows, one per target
profile) + `data/apuestes/manifest.json` + `data/apuestes/QUARANTINE.txt`.
Rows are keyed by numeric `id` — never by sanitized username (collision
case: `[ XOVA ]` id 14810 vs `| XOVA |` id 13394).

## Primary-key strategy (v3, 2026-11-20)

The DB primary key is NOT derived from the source id. Earlier drafts used
`-row.id` (negative mirror), but that does not guarantee freedom from
collisions with other platforms' negative spaces (Tipstrr uses
`-portfolioId`). The import route instead uses the existing safe mechanism:
sequence `tipsters_internal_id_seq` (migration 0005, starts at
-2,000,000,000, descending), assigned via `nextval` inside the import
transaction for NEW rows only; on conflict the existing id is never touched.
`idSource` is `internal-transactional` (same as the Tipstrr route). The
operational identity stays `(platform, slug)` via `ux_tipsters_platform_slug`.
Proven in `scripts/apuestes-import-regression.ts`: pre-seeded blogabet
(id 12345) and tipstrr (id -221629) rows survive two full imports untouched,
no PK collision, all 3.659 assigned ids distinct and <= -2,000,000,000.

## Absence vs true empty (v3, 2026-11-20)

The mapping never emits null for MISSING data: a row without a verifiable
value is held out of the import instead. A null that reaches the DB is
always a TRUE EMPTY (e.g. a rolling window with explicit `totalPicks: 0` has
no meaningful yield). The conflict update therefore OVERWRITES every managed
column, nulls included: a populated->empty window transition sets the window
yield to NULL rather than preserving the old value, and an empty->populated
transition applies the new value. Both transitions plus a real profit change
are exercised against PGlite in the regression script (16/16 PASS).

Drizzle gotcha caught by that regression: `onConflictDoUpdate` `set` keys
are drizzle property names (camelCase); snake_case keys are silently ignored
(the column never updates). The route now maps [property, column] pairs
explicitly.

## Email-shaped usernames

7 usernames are real email addresses. Display name is masked (`abc***`),
the slug derives from the masked name, and `source_url` is NOT stored for
these rows: the exact URL contains the address itself. Seed verifies
`conSourceUrl = 3652 = 3659 - 7`. 3 non-email handles containing '@' are
shown as-is.

## Row classes

| Class | Count | Rule |
| --- | ---: | --- |
| usable | 3.689 | `quarantine == null` AND `hist.totalPicks` int > 0 AND `months` non-empty |
| quarantined | 27 | `quarantine` set: 12 HTTP errors, 15 http-200-without-data |

Retry of the 12 HTTP errors ONLY (authorized by Juan 2026-11-20, 5s pacing,
sequential, stop-on-block; the 15 empty-200 were NOT retried): 6x302 now
resolve with Location `/tipsters` (redirect evidenced; a redirect alone does
not prove the profile was removed), 3x500 persist, 1x404 persists, and 2
returned 200 with partial data (ids 12802 Jorgejota
and 26373 LuisCale: a single month with 18 picks each, matching the listing,
but the all-time `hist` block is absent from the page). Deriving totalPicks
from months would fabricate the missing hist block, so both stay HELD
(klass `cuarentena[hist-missing-months-only]`) pending adjudication. All 12
keep unknown classification; importable count unchanged (3.659). Original
checkpoints preserved in /tmp/ap_capture, retry evidence in /tmp/ap_retry.

Quarantined rows: do not import stats. Their `isPaid`, `hist`, `m3/m6/m12`
fields are artifacts of parsing an error page — classification is **unknown**,
never free-by-default. Outside the private raw dataset these 27 rows surface
ONLY as "classification unknown"; the http200-empty detail (which 15 of the
27 returned an empty 200 page) stays in the private raw files. Recapture needs
its own authorization (policy: no automatic redo). The six 302s are redirects,
not generic failures; a later headers-only check can resolve them, but no
headers were preserved from the original capture, so that check is future
work with the network, not now.

## Field-by-field (usable rows)

| JSONL field | Import as | Notes |
| --- | --- | --- |
| `id` | platform profile key | unique, proven 1:1 against target catalog |
| `username` | display name | keep raw, brackets/pipes included |
| `active` | listing-only flag (1 publishing / 0 stopped) | from listing snapshot 2026-11-19 22:45 CET; 60 active-with-0-picks were out of capture scope |
| `type_list` | listing type (22 standard / 33 Gold) | listing provenance |
| `followers`, `pickPrice`, `plans` | profile evidence | `plans` flattened to `{key: price}` |
| `isPaid` | derived: `pickPrice>0 OR any plan price>0` | verified from profile on 3.689 usable: 253 paid / 3.436 free; dry-run recomputes and asserts equality |
| `hist` | all-time stats | totalPicks, yield%; raw units |
| `m3`, `m6`, `m12` | rolling 3/6/12-month windows from capture date | NOT calendar months (verified on 4 profiles) |
| `months` | monthly history array | raw entries preserved (`numpicks`, `sumprofit`, `sumstaked`, `aciertos`, `fecha_pub`, `fecha_pub2`, `yield`) |
| `lastActivityMonth` | `YYYY-MM` | NULL only on the 27 quarantined |
| `timing`, `http`, `capturedAt` | provenance metadata | keep for audit |

## Zero/absence semantics (the rule that must survive import)

- Window objects are present on every usable row with explicit zeros. A
  window with `totalPicks = 0` means **no activity in the window**: import the
  period as absent/NULL, and `yield` must stay NULL — never imported as 0.
  (`parse.ts` already enforces this: `yield: totalPicks > 0 ? num(s.yield) : null`.)
- Counts with data: m3 = 116, m6 = 161, m12 = 293 profiles with picks > 0.
- `profitUnit = 'apuestes-units'`: stake/profit are platform units; the
  on-site EUR figure is the subscription price. `eurosunidad` is 0 and unused.
  No € conversion anywhere.

## Discrepancy rows (27) — held out of import

Rows with `discrepancy != null`: listing `totalPicks` disagrees with profile
`hist.totalPicks`. Real cases from the dataset: id 13439 Brabender (listing
1084 vs profile 1086), id 555 Erbtiko (listing 302 vs profile 213, profile
LOWER), id 23992 CSCTENIS (listing 1 vs profile 13). Neither side is treated
as resolved and no cause is asserted.

Schema compatibility (validated against `db/schema.ts`): `tipsters.picks` is
`integer NOT NULL DEFAULT 0`, so a null/unknown totalPicks is NOT
representable field-level — importing 0 would fabricate data. The only
schema-compatible route is a ROW-LEVEL HOLD: the 27 rows leave the import
set entirely (3.689 usable -> 3.659 importable), logged in the shape of
`import_validation_log` with klass `cuarentena[totalPicks-discrepancy]`.
Both source values remain only in the private raw dataset.
`scripts/apuestes-import-dry-run.mts` runs the real projection and asserts
all 27 rows are held.

## Months-incomplete rows (2) — held out of import

Whole-dataset check `sum(months.numpicks) < hist.totalPicks`: exactly 2
usable rows — id 54750 GolDeOro (hist 1117 vs months sum 392; site exposes
only Oct 2025-Apr 2026) and id 54299 SurfOnly (hist 331 vs months sum 18;
only Sep 2025-Feb 2026). The site's months array shows only recent months
for these profiles. Conservative rule in force: both rows are HELD OUT of
the import set COMPLETELY (klass `cuarentena[months-incomplete]`), pending
adjudication — importing them with just the months field stripped is not
accepted as a resolution. Originals stay in the private raw dataset for
later evaluation; no recapture is needed for this local close-out.
Note: gaps BETWEEN listed months (598 rows) are benign — their totals
reconcile exactly with `hist.totalPicks`, so a gap means a zero-pick month
the site omits, not missing data.

## Verification harness

- `scripts/apuestes-parse-equivalence.mts` — runs the real repo TS parser
  over the 11 preserved raw HTML profiles and diffs field-by-field against
  the Python-parsed capture (9 full + 2 reduced refs). 11/11 OK. This test
  caught a real bug: multi-pass unescaping corrupted `\u00f3`-style content
  and silently dropped the `stats` block (months, lastActivityMonth); fixed
  with single-pass decoding.
- `scripts/apuestes-import-dry-run.mts` — reads the full 3.716-row JSONL,
  applies this mapping, runs the real import projection, asserts: 3.716 rows
  / 27 quarantined / 27 unknown-classification / 3.689 usable / 3.436 free /
  253 paid / 27 discrepancy-flagged / 27 held out of import / 2
  months-incomplete also held (ids 54299, 54750) / 3.659 importable /
  window checks for
  ALL THREE windows: m3<=m6<=m12 ordering holds on every row, window picks
  never exceed hist.totalPicks in any window, empty windows carry NULL yield
  (m3: 3.573, m6: 3.528, m12: 3.396 rows) / 0 usable-without-months.
  All assertions pass.
- Full-capture HTML was deleted by design after parsing (16 MB of JSON
  checkpoints kept, not ~1.8 GB of HTML), so parser equivalence covers the
  11 surviving raws; a full-coverage rerun is only possible via an authorized
  recapture.
