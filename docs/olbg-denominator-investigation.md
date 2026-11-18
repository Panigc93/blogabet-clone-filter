# OLBG denominator investigation
17 November 2026, Europe/Madrid. Private supporting research for Clone Filter.

## Decision still open
A separately named, approximate fixed-stake return can be prepared from complete global monthly All Tips data. It must not replace OLBG's published ROI or the production yield columns without an explicit comparison decision. The local reader now adds `derivedLevelStakesYieldPct` to closed-window summaries, with basis and quantization metadata. Production yield remains null, databaseReady remains false. No UI/importer/shared contract changes.

## Official definitions
- https://www.olbg.com/help defines competition LSP as 1 point on a win tip, or 0.5 on each leg of EW. Thus each non-void selection has a total standard stake of 1 unit, not 2 for EW.
- The same help describes virtual stakes of 50 to 500 and monthly competition balances. Stakes and profit from ante-post bets can fall in different months, with profit attributed when the result is known. Do not interpret a tip's event date as a universal settlement timestamp.
- https://www.olbg.com/bookmakers/articles/betting-terminology-a-z-guide defines ROI generally as profit/loss relative to the money used for betting. It does not specify the historical monthly performance table's exact denominator or rounding policy.
- https://www.olbg.com/best-tipsters/Darts/15 describes editorial performance as level 10-point stakes, independent of advised stake. https://www.olbg.com/best-tipsters/Horse_Racing/2 uses that presentation too. These are not proof that the separate monthly competition ROI uses the same denominator.
- https://www.olbg.com/tipsters/tips/history/565069 and https://www.olbg.com/tipsters/tips/history/535122 state that public history contains the last 35 days and that competition results are a simulation, not a promise of real-life performance.

## Direct reconciliation, current month only
Captured signed out on 17 November, around 18:40-18:44 UTC. The existing three-profile pilot was not expanded.

| Profile | Public history rows in November | Voids | Reported tips | Total non-void virtual stake | Profit | Reconstructed LSP | Source monthly LSP/ROI |
|---|---:|---:|---:|---:|---:|---:|---|
| ewanvrs 565069 | 81 | 5 | 76 | 3,800 | -675 | -13.50 | -13.50 / -18% |
| Fjori 535122 | 51 | 0 | 51 | 2,550 | -1,007 | -20.14 | -20.14 / -39% |

For both current months each tip has total virtual stake 50, including 25+25 EW. Consequently both candidate ROI formulas coincide here: these reconciliations do NOT distinguish advised-stake ROI from fixed-stake ROI in the general case. They do validate current reported tip counts excluding void and the EW total-stake interpretation. The oldest retained Fjori history row was 14 October, so October was not fully recoverable. All six available Fjori history pages had 182 rows in total; no arbitrary date/ID enumeration was used.

Monthly source URLs:
- https://www.olbg.com/api/members/performance-tables?mode=month&id=565069&sp=60
- https://www.olbg.com/api/members/performance-tables?mode=month&id=535122&sp=60
- https://www.olbg.com/api/members/performance-tables?mode=month&id=342919&sp=60

Public history read route and pagination were discovered from the page's own JavaScript, not guessed. It returns the same public tips. Table endpoint returns formatted LSP/ROI/profit, no total stake or extra ROI precision.

## Contradictions and limits
- ewanvrs May: 112.13 LSP / 270 tips = approximately 41.53%, but published ROI is 40%.
- Fjori April: -20.84 LSP / 121 tips = approximately -17.22%, but published ROI is -5%.
These differences exceed rounding. Variable virtual stakes are allowed, but the retained current histories all use total stake 50. The historical discrepancies cannot be conclusively attributed to variable stakes from this evidence. Do not report that hypothesis as established.
- Published monthly ROI cannot safely be aggregated with an arithmetic or picks-weighted average; its total-staked denominator is absent.
- Public history cannot reconstruct an entire previous year. There is no claim that official historical statistics are wrong.

## Derivation and completeness rules
1. Use monthly selector 60 (global All Tips) only. Never sum overlapping sport/competition/comments/NAP tables.
2. Use exactly the last 3, 6 or 12 closed calendar months anchored to the source's current-month label. Exclude the partial current month.
3. Every required month must exist. Missing is unknown, not zero, including a gap which could represent genuine inactivity. An explicit row with zero tips may contribute zero; a complete window with zero total tips has null return, not 0%.
4. Approximate fixed-stake return = 100 * sum(reported monthly LSP) / sum(reported monthly tips). This assumes the historical count follows the non-void convention validated on the two current pilots. Each non-void tip is 1 unit total, including EW at 0.5+0.5. Voids are 0 P/L and are excluded from the validated count.
5. Source LSP is displayed to 0.01 units. Output is approximate even if code retains more decimal places. A conditional input-quantization allowance is n * 0.01 * 100 / total tips percentage points, assuming each month differs from its unquantized LSP by no more than 0.01 units. This accommodates common rounding/truncation, is not a verified OLBG policy, and is not a guarantee against source errors or differing historical count conventions. No exact-error claim.
6. Preserve source ROI, competition profit, LSP and derived return separately.

## Examples from retained pilot captures
| Profile | Closed window | Tips | Sum LSP | Approx. derived fixed-stake return | Completeness |
|---|---|---:|---:|---:|---|
| ewanvrs | May-Oct 2026 | 1,337 | 441.71 | 33.04% | 6/6 months |
| Fjori | Nov 2025-Oct 2026 | 1,505 | -234.38 | -15.57% | 12/12 months |
| ToofanExpress | May-Oct 2026 | unknown | unknown | unknown | June missing |

For ewanvrs six months, the conditional input-quantization allowance is about 0.00449 percentage points. Displaying 33.04% introduces separate display rounding; source errors are outside this allowance. Historical source ROI is not reconstructed.

## Verification and delivery
Local change is limited to preparation, tests and documentation. 285 tests passed across 30 files; TypeScript check passed. New tests cover a complete positive window, synthetic negatives, missing months, zero denominator, conditional precision metadata, preserved null source/production ROI, and independence from overlapping sport-table values. Raw current history responses are retained privately outside the application repository and projected statistical evidence is included separately. No new visual output was created.
