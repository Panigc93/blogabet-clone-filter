# Apuestes audit package v5 (private, contains personal data)

Self-contained evidence for independent review. No network access needed.
Branch `apuestes-local-prep`, code commit 2ecc5d4 (2026-11-20, v3).

Contents:

- `data/apuestes/profiles.jsonl` — full capture, 3.716 rows (raw, includes
  personal emails; never committed to git, never publish)
- `data/apuestes/manifest.json` — dataset manifest and policies
- `data/apuestes/QUARANTINE.txt` — quarantined profiles with reasons
- `data/apuestes/profile-urls.json` — exact source URLs from the listing
  evidence (contains the 7 email addresses; private)
- `evidence/apuestes/html/` — 11 preserved raw profile HTML pages
- `evidence/apuestes/capture/` — 9 raw capture checkpoint JSONs matching the
  HTMLs (ElKaiser and Tradingchevaux have no checkpoint; they compare against
  the compact sample instead)
- `evidence/apuestes/ap_sample.json` — compact validated sample (11 profiles)
- `evidence/apuestes/apuestes_parse.py` — the Python capture parser
- `crawler/platforms/apuestes/` — parse.ts, types.ts (parser), to-db.ts
  (row mapping, gated), import.ts (plan + executor route)
- `db/schema.ts` — target schema; `drizzle/0000`–`0005` full migration chain
  plus `drizzle/0006_apuestes_source_url.sql` (LOCAL DRAFT, not applied
  remotely), with `drizzle/meta/_journal.json`
- Full reproduction deps: `package.json`, `tsconfig.json`, `vitest.config.ts`,
  `drizzle.config.ts`, and the transitive import closure of both test files
  and all four scripts (28 files: components/, lib/, crawler/platforms/{apuestes,olbg,tipstrr},
  app/lab/tipstrr/ficha/fixtures.ts)
- `scripts/apuestes-parse-equivalence.mts` — real-parser equivalence test
- `scripts/apuestes-import-dry-run.mts` — import projection + assertions
- `scripts/seed-apuestes-local.ts` — PGlite seed, two-pass idempotency proof
- `scripts/apuestes-import-regression.ts` — update-semantics regression
- `tests/crawler/apuestes-to-db.test.ts`,
  `tests/components/tipster-card-model.test.ts` — 26 vitest tests
- `docs/apuestes-import-mapping.md`, `docs/apuestes-local-preparation.md`

To reproduce inside the repo clone (apuestes-local-prep @ 2ecc5d4):

    npx tsx scripts/apuestes-parse-equivalence.mts   # 11 profiles, 0 mismatches
    npx tsx scripts/apuestes-import-dry-run.mts      # all assertions passed
    npx vitest run tests/crawler/apuestes-to-db.test.ts tests/components/tipster-card-model.test.ts
    PGLITE_DIR=/tmp/pglite-x npx tsx scripts/seed-apuestes-local.ts
    npx tsx scripts/apuestes-import-regression.ts    # 20/20 PASS

No fetch is performed: everything reads from the files in this package.

## What v3 proves (new since v2)

- PK strategy: ids assigned by `tipsters_internal_id_seq` (existing internal
  mechanism, from -2,000,000,000 descending) inside the import transaction,
  never `-sourceId`. No exclusive negative space is assumed. Regression:
  pre-seeded blogabet (12345) and tipstrr (-221629) rows intact after two
  full imports; 3.659 distinct ids, zero collisions.
- Absence vs true empty: nulls reaching the DB are only true empties
  (window picks=0); the conflict update overwrites all managed columns, so
  populated->empty sets the yield to NULL (proven: 28.74 -> NULL) and
  empty->populated applies the new value (NULL -> 15.50), with a real profit
  change (68.150 -> 99.500) and immutable id/platform/slug.
- The regression caught a real bug: drizzle `onConflictDoUpdate` silently
  ignores snake_case `set` keys; fixed with explicit [property, column]
  pairs. This also affected the v2 COALESCE version.
- Email-shaped usernames (7): masked name/slug AND no `source_url` stored
  (the exact URL contains the address). Seed: conSourceUrl=3652=3659-7.

## Standing figures (unchanged by v3)

- 3.716 rows -> 27 capture-quarantined -> 3.689 usable -> holds: 27
  totalPicks discrepancies, 2 months-incomplete (54750, 54299), 1 yield out
  of range (55379 NHLPICK, held, no schema widening) -> 3.659 importable
  (237 paid among them; free/paid from profile evidence only).
- Plan price semantics ('10'/'12') unverified -> price never shown.
- Remote scope still pending approval: apply 0006 on Neon, run the import
  against Neon, live verification of plan semantics, push/deploy.

## v4 additions (2026-11-20)

- Atomicity: the executor wraps ALL upsert batches and the holds log in one
  transaction; regression proves rollback (batch-2 NOT NULL failure leaves 0
  rows and 0 log entries from the run; table untouched).
- Stale figures cleaned (were 3660/3662/conSourceUrl=3659; actual
  3659/conSourceUrl=3652) in docs and data/apuestes/manifest.json.
- Git hygiene, verifiable without private data:
  - `git log --all --oneline -- data/apuestes evidence/apuestes` -> one early
    commit (sample-11.json only): audited, 2.4 KB compact stats of 11 public
    usernames, zero email-shaped strings.
  - The 7 real addresses were found hardcoded in the privacy test; replaced
    with fabricated fixtures and purged from ALL branch history with
    git-filter-repo --replace-text. Post-purge scan: zero hits for any of
    the 7 strings across every commit on the branch.
  - Remaining generic '@'-pattern files in history are vendor contacts
    (multi-platform-design.md), the npm lockfile, and other platforms'
    pre-existing fixtures from master — no Apuestes personal data.
  - data/apuestes/ and evidence/apuestes/ are gitignored; nothing private is
    tracked at HEAD.
