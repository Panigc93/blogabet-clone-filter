// Golazobets parser: pure functions over their server-rendered Inertia pages.
// No fetching and no DB here: fetch.ts owns HTTP, and nothing writes to Neon.
//
// Privacy: their JSON embeds the tipster's email address. We never read it,
// never return it, and never write it anywhere. parseListingItem picks only
// the fields listed below.

export interface GolazobetsListingItem {
  platform: 'golazobets'
  platformId: number
  username: string
  profileUrl: string
  accountType: 'free' | 'premium' | 'unknown'
  sportId: number | null
  sportName: string | null
  followers: number | null
  picksReported: number | null
  stats: GolazobetsAggregateStats | null
  profitSeries: number[] | null
}

export interface GolazobetsAggregateStats {
  numberBets: number | null
  totalBetUnits: number | null
  profitUnits: number | null
  yieldPct: number | null
  averageStake: number | null
  averageOdds: number | null
  winRatePct: number | null
}

export interface GolazobetsListingPage {
  currentPage: number
  lastPage: number
  total: number
  perPage: number
  items: GolazobetsListingItem[]
}

export interface GolazobetsMonthStat {
  year: number
  month: number
  totalPicks: number | null
  totalBetUnits: number | null
  profitUnits: number | null
  yieldPct: number | null
  averageStake: number | null
  averageOdds: number | null
  winRatePct: number | null
}

export interface GolazobetsBreakdownRow {
  label: string
  totalPicks: number | null
  profitUnits: number | null
  yieldPct: number | null
  winRatePct: number | null
}

export interface GolazobetsProfile {
  item: GolazobetsListingItem
  monthly: GolazobetsMonthStat[]
  bySport: GolazobetsBreakdownRow[]
  byBookie: GolazobetsBreakdownRow[]
  recentResults: string[]
}

export class GolazobetsParseError extends Error {}

// The Inertia payload lives in <div id="app" data-page="..."> with HTML-escaped JSON.
export function extractDataPage(html: string): Record<string, unknown> {
  const match = html.match(/data-page="([^"]*)"/)
  if (!match) throw new GolazobetsParseError('no data-page attribute found')
  const unescaped = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  let parsed: unknown
  try {
    parsed = JSON.parse(unescaped)
  } catch {
    throw new GolazobetsParseError('data-page attribute is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GolazobetsParseError('data-page payload is not an object')
  }
  const component = (parsed as { component?: unknown }).component
  if (typeof component !== 'string' || !component.startsWith('tipsters/')) {
    throw new GolazobetsParseError(`unexpected component: ${String(component)}`)
  }
  return parsed as Record<string, unknown>
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

function props(page: Record<string, unknown>): Record<string, unknown> {
  const p = page.props
  if (typeof p !== 'object' || p === null) throw new GolazobetsParseError('no props object')
  return p as Record<string, unknown>
}

function parseStats(raw: unknown): GolazobetsAggregateStats | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  return {
    numberBets: num(s.number_bets),
    totalBetUnits: num(s.total_bet),
    profitUnits: num(s.profit),
    yieldPct: num(s.yield),
    averageStake: num(s.average_stake),
    averageOdds: num(s.average_odds),
    winRatePct: num(s.win_rate),
  }
}

function parseAccountType(raw: unknown): 'free' | 'premium' | 'unknown' {
  if (raw === 'free' || raw === 'premium') return raw
  return 'unknown'
}

export function parseListingItem(raw: unknown): GolazobetsListingItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const item = raw as Record<string, unknown>
  const id = num(item.id)
  const user = (typeof item.user === 'object' && item.user !== null
    ? item.user
    : {}) as Record<string, unknown>
  const username = str(user.username)
  // An item without id or username cannot be linked back to its source profile.
  if (id === null || username === null) return null
  const sport = (typeof item.sport === 'object' && item.sport !== null
    ? item.sport
    : {}) as Record<string, unknown>
  const series = Array.isArray(item.profit_series)
    ? item.profit_series.filter((v): v is number => typeof v === 'number')
    : null
  return {
    platform: 'golazobets',
    platformId: id,
    username,
    profileUrl: `https://golazobets.com/tipster/${encodeURIComponent(username)}`,
    accountType: parseAccountType(item.type),
    sportId: num(sport.id),
    sportName: str(sport.name),
    followers: num(item.total_follows_received),
    picksReported: num(item.picks_count),
    stats: parseStats(item.tipster_stats),
    profitSeries: series,
  }
}

export function parseListingPage(html: string): GolazobetsListingPage {
  const page = extractDataPage(html)
  if (page.component !== 'tipsters/Index') {
    throw new GolazobetsParseError(`not a listing page: ${String(page.component)}`)
  }
  const t = props(page).tipsters
  if (typeof t !== 'object' || t === null || !Array.isArray((t as { data?: unknown }).data)) {
    throw new GolazobetsParseError('listing payload has no tipsters.data array')
  }
  const paginator = t as Record<string, unknown>
  const items = (paginator.data as unknown[])
    .map(parseListingItem)
    .filter((i): i is GolazobetsListingItem => i !== null)
  return {
    currentPage: num(paginator.current_page) ?? 1,
    lastPage: num(paginator.last_page) ?? 1,
    total: num(paginator.total) ?? items.length,
    perPage: num(paginator.per_page) ?? items.length,
    items,
  }
}

function parseBreakdown(raw: unknown): GolazobetsBreakdownRow[] {
  if (!Array.isArray(raw)) return []
  const rows: GolazobetsBreakdownRow[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const label = str(e.label)
    if (label === null) continue
    rows.push({
      label,
      totalPicks: num(e.total_picks),
      profitUnits: num(e.profit),
      yieldPct: num(e.yield),
      winRatePct: num(e.win_rate),
    })
  }
  return rows
}

export function parseProfilePage(html: string): GolazobetsProfile {
  const page = extractDataPage(html)
  if (page.component !== 'tipsters/TipsterProfile') {
    throw new GolazobetsParseError(`not a profile page: ${String(page.component)}`)
  }
  const p = props(page)
  const item = parseListingItem(p.tipster)
  if (item === null) throw new GolazobetsParseError('profile payload has no usable tipster object')
  // The profile-level followers prop is authoritative over the embedded listing count.
  const followers = num(p.followers)
  if (followers !== null) item.followers = followers

  const monthly: GolazobetsMonthStat[] = []
  if (Array.isArray(p.stats)) {
    for (const entry of p.stats) {
      if (typeof entry !== 'object' || entry === null) continue
      const e = entry as Record<string, unknown>
      const year = num(e.year)
      const month = num(e.month)
      if (year === null || month === null) continue
      monthly.push({
        year,
        month,
        totalPicks: num(e.total_picks),
        totalBetUnits: num(e.total_bet),
        profitUnits: num(e.profit),
        yieldPct: num(e.yield),
        averageStake: num(e.average_stake),
        averageOdds: num(e.average_odds),
        winRatePct: num(e.win_rate),
      })
    }
  }

  const detailed = (typeof p.detailed_stats === 'object' && p.detailed_stats !== null
    ? p.detailed_stats
    : {}) as Record<string, unknown>

  return {
    item,
    monthly,
    bySport: parseBreakdown(detailed.by_sport),
    byBookie: parseBreakdown(detailed.by_bookie),
    recentResults: Array.isArray(p.recent_results)
      ? p.recent_results.filter((r): r is string => typeof r === 'string')
      : [],
  }
}
