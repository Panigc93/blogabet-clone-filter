// Apuestes.com source types. One profile page GET embeds every block as
// JSON.parse('<js-escaped>') in the Vue bootstrap: identity, all-time and
// 3/6/12-month stats, price plans and the monthly history. Profit and stake
// are stake units, never euros (the EUR figure on the site is the
// subscription price, same rule as Blogabet).

export interface ApuestesPeriodStats {
  totalPicks: number
  totalProfit: number | null
  stakeAvg: number | null
  oddsAvg: number | null
  winPicks: number | null
  lostPicks: number | null
  nullPicks: number | null
  winRate: number | null
  yield: number | null // null when totalPicks = 0, never 0-as-absence
}

export interface ApuestesPricePlan {
  price: number
  id: number
  days: string
}

export interface ApuestesListRow {
  id: number
  username: string
  active: number | null // listing-only flag: 1 publishing now, 0 stopped
  type: number | null // 22 standard, 33 Gold service
  followers: number | null
  totalPicks: number
  yield: string | null
  totalProfit: string | null
  winRate: number | null
  oddsAVG: string | null
  stakeAVG: string | null
  pickPrice: number | null
  pricePlans: Record<string, ApuestesPricePlan> | null
  urlProfile: string
}

export interface ApuestesProfile {
  id: number
  username: string
  type: number | null
  followers: number | null
  pickPrice: number | null
  pricePlans: Record<string, ApuestesPricePlan> | null
  historico: ApuestesPeriodStats
  m3: ApuestesPeriodStats
  m6: ApuestesPeriodStats
  m12: ApuestesPeriodStats
  lastActivityMonth: string | null // 'YYYY-MM' from stats.months fecha_pub2
}

// Free/Pago is decided ONLY from profile evidence: any paid plan price or a
// per-pick price means paid. The listing "free" bucket already contains 102
// tipsters with paid plans, so the list itself never classifies.
export function isPaidProfile(p: Pick<ApuestesProfile, 'pickPrice' | 'pricePlans'>): boolean {
  if ((p.pickPrice ?? 0) > 0) return true
  return Object.values(p.pricePlans ?? {}).some(plan => (plan.price ?? 0) > 0)
}
