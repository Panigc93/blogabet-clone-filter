# Profit unit read correction - candidate only

Base: 969dbf541b61bc6a28edaa68a6ae9f87b6ca6044. No deployment, activation, import, migration or production connection.

## Evidence

On 18 November 2026, the signed-in https://blogabet.com/tipsters listing exposed Profit as a bare number, separate from EUR subscription prices. Examples: bobic +1232; dedi22 +7538 and 55 EUR/month; Jimin Jibao +15634. The parser reads the third `.pins .number` directly, without money conversion. The official explanation at https://blogabet.com/betting-guide/blogabet-tutorials/betting-blogs-and-tipster-stats-explained defines Profit as net units. Additional stake guidance: https://blogabet.com/help. The EUR default in our schema is not evidence for the source's Profit unit.

Bettingexpert defines profit as returns minus stakes: https://www.bettingexpert.com/about/faq. This does not establish money, equal bankroll risk or a conversion between tipsters. Preserve all original numbers. No multiplication/division, no exchange rate and no equal-stake reconstruction.

## Changes

- New BB parse results explicitly name `blogabet-units`. Existing crawler conflict updates do not backfill old metadata.
- Shared SQL SELECT projection and Profit grouping override legacy BB unit metadata in reads only. API uses this projection. Other platforms and numeric amounts are unchanged. Subscription EUR fields, filters and labels are unchanged.
- Legacy schema default is deliberately retained and documented, avoiding an implicit schema migration. No SQL migration is supplied. Any future backfill/default change requires fresh inventory and DB approval separately.
- BB label is Profit (u.). BE label is Beneficio (u.); period traces and the combined Profit warning say units with platform origin. BE Since remains unknown, with a visible missing-signup note. Capture time and first tip are not used as signup. Only Wewillrockyou and The_doctorbr public profile signup availability was individually checked, not the full catalogue.
- Profit remains grouped by source-specific unit, not a common profit leaderboard. Yield filtering/ranking formulas are unchanged. UI notes recommend matching periods and sample size, not interpreting equal yields as equal risk.
- The reviewed-pack iterator test now uses Array.from for the project's TypeScript target. This repairs a pre-existing type error in exact base 969dbf5, not a business-logic change.

## Verification

Full suite, three disjoint groups: 171 + 198 + 178 = 547 passed, 13 skipped (database integration suites not enabled). TypeScript passes. Build completes with NEXT_IGNORE_INCORRECT_LOCKFILE=1 to prevent Next from repairing this shared environment's incomplete SWC lockfile. Its remaining warning concerns old Browserslist data. No production environment credentials were loaded or used.

Pixels inspected at 390 and 1280 widths: real source figures for dedi22 plus retained BE Wewillrockyou/Doctor records, source dates visible, no horizontal overflow, unknown BE Since shown, BB 55 EUR/month remains separate. Missing avatars are represented by initials in this preview. Exact BE values retain source-to-DB precision and display rules.

This candidate does not include the separate journal/rollback wrapper, nor diagnostic PR21/22 compatibility changes. It does not approve OLBG LSP/picks or enable OLBG.
