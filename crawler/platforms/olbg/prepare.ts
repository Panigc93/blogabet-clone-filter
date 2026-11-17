import type { OlbgPerformance, OlbgMonth } from './reader'

export interface OlbgClosedSummary {
  closedMonths: 3 | 6 | 12
  fromMonth: string
  throughMonth: string
  presentMonths: string[]
  missingMonths: string[]
  tips: number | null
  levelStakeProfit: number | null
  roiPct: null
  derivedLevelStakesYieldPct: number | null
  derivedLevelStakesBasis: {
    scope: 'global-all-tips'
    unitStakePerTip: 1
    eachWayUnitsPerLeg: 0.5
    denominatorUnits: number | null
    approximate: true
    sourceLspResolutionUnits: 0.01
    conditionalQuantizationAllowancePct: number | null
    allowanceAssumption: string
    limitation: string
  }
}

export function summarizeOlbgMonths(months: OlbgMonth[], through: string): OlbgClosedSummary[] {
  const shift = (m: string, n: number) => {
    const d = new Date(m + '-01T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + n)
    return d.toISOString().slice(0, 7)
  }
  const byMonth = new Map(months.map(x => [x.month, x]))
  if (months.some(x => x.currentMonth && x.month !== shift(through, 1))) throw new Error('Monthly capture and table anchors conflict')
  return ([3, 6, 12] as const).map(n => {
    const window = Array.from({ length: n }, (_, i) => shift(through, i - n + 1))
    const presentMonths = window.filter(m => byMonth.has(m))
    const missingMonths = window.filter(m => !byMonth.has(m))
    const tips = missingMonths.length ? null : window.reduce((v, m) => v + byMonth.get(m)!.tips, 0)
    const lsp = missingMonths.length ? null : Math.round(window.reduce((v, m) => v + byMonth.get(m)!.levelStakeProfit, 0) * 100) / 100
    const hasDenominator = tips !== null && tips > 0
    return {
      closedMonths: n, fromMonth: window[0], throughMonth: through, presentMonths, missingMonths,
      tips,
      levelStakeProfit: lsp,
      roiPct: null,
      derivedLevelStakesYieldPct: hasDenominator ? 100 * lsp! / tips! : null,
      derivedLevelStakesBasis: {
        scope: 'global-all-tips' as const,
        unitStakePerTip: 1 as const,
        eachWayUnitsPerLeg: 0.5 as const,
        denominatorUnits: tips,
        approximate: true as const,
        sourceLspResolutionUnits: 0.01 as const,
        // Conditional allowance for rounded OR truncated monthly inputs. This
        // is not a guaranteed source-error bound or an OLBG rounding policy.
        conditionalQuantizationAllowancePct: hasDenominator ? n * 0.01 * 100 / tips! : null,
        allowanceAssumption: 'Each monthly LSP differs from its unquantized value by at most 0.01 units; source policy unverified',
        limitation: 'Own fixed-stake metric, not published ROI; non-void count reconciled on two current pilot months, not every historical month',
      },
    }
  })
}

// Read-only preparation for a later database/UI integration. Deliberately NOT a
// TipsterInsert: the existing scalar columns cannot express these scopes safely.
export function prepareOlbgProfile(monthly: OlbgPerformance, six: OlbgPerformance, twelve: OlbgPerformance) {
  if (monthly.tables.length || six.months.length || twelve.months.length) throw new Error('Unexpected capture modes')
  if ([six, twelve].some(x => x.profileId !== monthly.profileId)) throw new Error('Mixed profile identities')
  if (six.tables.some(x => x.closedMonths !== 6) || twelve.tables.some(x => x.closedMonths !== 12)) throw new Error('Mixed periods')
  const allTables = [...six.tables, ...twelve.tables]
  const anchors = Array.from(new Set(allTables.map(x => x.throughMonth)))
  if (anchors.length !== 1) throw new Error('Missing or conflicting source period anchors')
  const through = anchors[0]
  const summaries = summarizeOlbgMonths(monthly.months, through)
  const names = Array.from(new Set([monthly, six, twelve].map(x => x.username)))
  return {
    platform: 'olbg' as const, profileId: monthly.profileId, username: monthly.username, observedNames: names,
    profileUrl: monthly.profileUrl, sources: [monthly.source, six.source, twelve.source],
    months: monthly.months, tables: allTables, summaries,
    // No averaged ROI, hidden zero-fill, inferred all-time or backdated activity.
    globalYieldPct: null, allTime: null, lastPickAt: null, followers: null,
    databaseReady: false as const,
    blockers: ['Published aggregate ROI denominator unavailable; derived fixed-stake yield requires an explicit comparison decision', 'Existing scalar row needs explicit statistic scope before integration'],
  }
}

export type OlbgPreparedProfile = ReturnType<typeof prepareOlbgProfile>
