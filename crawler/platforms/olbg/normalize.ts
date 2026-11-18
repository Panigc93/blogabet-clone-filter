import type { NormalizedTipster, StatSample } from '../types'
import type { OlbgPreparedProfile } from './prepare'

// No DB row or surrogate ID. Source monthly ROI stays source-only; derived
// closed-window returns travel in a distinct optional field, never yieldPct.
export function normalizeOlbg(p: OlbgPreparedProfile): NormalizedTipster {
  const sourceMonths: StatSample[] = p.months.map(m => ({
    picks: m.tips, profitUnits: m.levelStakeProfit, yieldPct: m.roiPct,
    yieldBasis: 'unknown', winRatePct: m.strikePct, avgOdds: null,
    periodLabel: m.month, scope: 'month-global-all-tips', scopeKey: m.month,
  }))
  const derived: StatSample[] = p.summaries.map(s => ({
    picks: s.tips, profitUnits: s.levelStakeProfit, yieldPct: null,
    yieldBasis: 'unknown', winRatePct: null, avgOdds: null,
    periodLabel: `${s.fromMonth} - ${s.throughMonth}`, scope: 'closed-global-all-tips', scopeKey: `${s.closedMonths}m`,
    derivedYield: {
      valuePct: s.derivedLevelStakesYieldPct, basis: 'level-stakes', approximate: true,
      denominatorUnits: s.derivedLevelStakesBasis.denominatorUnits,
      fromMonth: s.fromMonth, throughMonth: s.throughMonth,
      presentMonths: [...s.presentMonths], missingMonths: [...s.missingMonths],
      sourceLspResolutionUnits: 0.01,
      conditionalQuantizationAllowancePct: s.derivedLevelStakesBasis.conditionalQuantizationAllowancePct,
    },
  }))
  return {
    platform: 'olbg', platformId: String(p.profileId), username: p.username,
    profileUrl: p.profileUrl, accountType: 'unknown', sportName: null, followers: null,
    samples: [...sourceMonths, ...derived],
  }
}
