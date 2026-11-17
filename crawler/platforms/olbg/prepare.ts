import type { OlbgPerformance } from './reader'

export interface OlbgClosedSummary {
  closedMonths: 3 | 6 | 12
  fromMonth: string
  throughMonth: string
  presentMonths: string[]
  missingMonths: string[]
  tips: number | null
  levelStakeProfit: number | null
  roiPct: null
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
  const shift = (m: string, n: number) => {
    const d = new Date(m + '-01T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + n)
    return d.toISOString().slice(0, 7)
  }
  const byMonth = new Map(monthly.months.map(x => [x.month, x]))
  if (monthly.months.some(x => x.currentMonth && x.month !== shift(through, 1))) throw new Error('Monthly capture and table anchors conflict')
  const summaries: OlbgClosedSummary[] = ([3, 6, 12] as const).map(n => {
    const window = Array.from({ length: n }, (_, i) => shift(through, i - n + 1))
    const presentMonths = window.filter(m => byMonth.has(m))
    const missingMonths = window.filter(m => !byMonth.has(m))
    return {
      closedMonths: n, fromMonth: window[0], throughMonth: through, presentMonths, missingMonths,
      tips: missingMonths.length ? null : window.reduce((v, m) => v + byMonth.get(m)!.tips, 0),
      levelStakeProfit: missingMonths.length ? null : Math.round(window.reduce((v, m) => v + byMonth.get(m)!.levelStakeProfit, 0) * 100) / 100,
      roiPct: null,
    }
  })
  const names = Array.from(new Set([monthly, six, twelve].map(x => x.username)))
  return {
    platform: 'olbg' as const, profileId: monthly.profileId, username: monthly.username, observedNames: names,
    profileUrl: monthly.profileUrl, sources: [monthly.source, six.source, twelve.source],
    months: monthly.months, tables: allTables, summaries,
    // No averaged ROI, hidden zero-fill, inferred all-time or backdated activity.
    globalYieldPct: null, allTime: null, lastPickAt: null, followers: null,
    databaseReady: false as const,
    blockers: ['No verified aggregate yield/total-staked denominator', 'Existing scalar row needs explicit statistic scope before integration'],
  }
}

export type OlbgPreparedProfile = ReturnType<typeof prepareOlbgProfile>
