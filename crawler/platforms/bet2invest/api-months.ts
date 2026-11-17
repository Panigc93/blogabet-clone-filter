// Bet2Invest monthly history from the public guest API the profile page itself calls
// (observed 2026-11-17): GET {apiBase}/v1/statistics/{userId}/summary/months/guest
//   ?bankrollId={id}&onlyImportedBets=false
// Ids come from the Nuxt payload (<script id="__NUXT_DATA__">) of the server HTML.
// Units are Bet2Invest units; no currency conversion. Pure functions only: no network here.
import * as cheerio from 'cheerio'

export const BET2INVEST_API_BASE = 'https://api.bet2invest.com'

export interface Bet2InvestApiMonth {
  year: number
  month: number
  bets: number
  profitUnits: number
  avgUnits: number // average stake per bet, B2I units
  stakeUnits: number // bets * avgUnits (derived)
  roiPct: number | null // platform value as returned
  avgOdds: number | null
  clvPct: number | null
  yieldPct: number | null // profit / stake * 100; null when stake is 0
}

export interface Bet2InvestProfileIds {
  userId: number
  publicBankrollId: number
  username: string | null
  createdAt: string | null // account creation, NOT start of betting history
  lastBetAt: string | null
}

export function monthsUrl(ids: Pick<Bet2InvestProfileIds, 'userId' | 'publicBankrollId'>): string {
  if (!Number.isInteger(ids.userId) || ids.userId <= 0) throw new Error('invalid userId')
  if (!Number.isInteger(ids.publicBankrollId) || ids.publicBankrollId <= 0) throw new Error('invalid bankrollId')
  return `${BET2INVEST_API_BASE}/v1/statistics/${ids.userId}/summary/months/guest?bankrollId=${ids.publicBankrollId}&onlyImportedBets=false`
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Strict: any malformed row, duplicate month or non-finite required field rejects the whole series (null). */
export function parseMonthsResponse(json: unknown): Bet2InvestApiMonth[] | null {
  if (!Array.isArray(json)) return null
  const out: Bet2InvestApiMonth[] = []
  const seen = new Set<string>()
  for (const row of json) {
    if (!row || typeof row !== 'object') return null
    const key = (row as { key?: unknown }).key
    const v = (row as { value?: Record<string, unknown> }).value
    if (typeof key !== 'string' || !v || typeof v !== 'object') return null
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(key)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2])
    if (month < 1 || month > 12 || seen.has(`${year}-${month}`)) return null
    seen.add(`${year}-${month}`)
    const bets = num(v.betsNumber)
    const profit = num(v.profit)
    const avgUnits = num(v.averageUnits)
    if (bets === null || !Number.isInteger(bets) || bets < 0 || profit === null || avgUnits === null || avgUnits < 0) return null
    const stake = bets * avgUnits
    out.push({
      year,
      month,
      bets,
      profitUnits: profit,
      avgUnits,
      stakeUnits: stake,
      roiPct: num(v.roi),
      avgOdds: num(v.averagePrice),
      clvPct: num(v.clv),
      yieldPct: stake > 0 ? (100 * profit) / stake : null,
    })
  }
  return out
}

/**
 * Month series vs all-time totals. Bets must match exactly. Profit tolerance depends on the source of the totals:
 * - 'rounded2': totals read from the page header (2 decimals) => half unit of the last digit, 0.005 + eps.
 * - 'full': totals with full API precision => 1e-6 (float noise only).
 * The caller must choose; there is no default.
 */
export function monthsCloseWithTotals(
  months: Bet2InvestApiMonth[],
  settledBets: number,
  profitUnits: number,
  totalsPrecision: 'rounded2' | 'full',
): boolean {
  const bets = months.reduce((a, r) => a + r.bets, 0)
  const profit = months.reduce((a, r) => a + r.profitUnits, 0)
  const tol = totalsPrecision === 'rounded2' ? 0.005 + 1e-9 : 1e-6
  return bets === settledBets && Math.abs(profit - profitUnits) <= tol
}

export interface Bet2InvestWindowYield {
  months: number
  bets: number
  profitUnits: number
  stakeUnits: number
  yieldPct: number | null // sum(profit) / sum(stake) * 100; null when total stake is 0. NOT a mean of monthly yields.
  excludedPartialMonth: boolean
}

/** Is this row the month containing `now` (UTC)? The API anchors keys at day 03; this only compares year/month. */
export function isCurrentMonth(m: Pick<Bet2InvestApiMonth, 'year' | 'month'>, now: Date): boolean {
  return m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1
}

/**
 * Yield over a set of months as sum(profit)/sum(stake). The month in progress is excluded by default
 * (it is partial and would bias the window); pass includePartial to keep it. Months without rows are not zeros.
 */
export function windowYield(months: Bet2InvestApiMonth[], now: Date, includePartial = false): Bet2InvestWindowYield {
  const used = months.filter((m) => includePartial || !isCurrentMonth(m, now))
  const profit = used.reduce((a, r) => a + r.profitUnits, 0)
  const stake = used.reduce((a, r) => a + r.stakeUnits, 0)
  return {
    months: used.length,
    bets: used.reduce((a, r) => a + r.bets, 0),
    profitUnits: profit,
    stakeUnits: stake,
    yieldPct: stake > 0 ? (100 * profit) / stake : null,
    excludedPartialMonth: !includePartial && used.length < months.length,
  }
}

/** Resolve a Nuxt devalue payload reference one level (values are indexes into the array). */
export function extractProfileIds(html: string): Bet2InvestProfileIds | null {
  const $ = cheerio.load(html)
  const raw = $('script#__NUXT_DATA__').first().text()
  if (!raw) return null
  let d: unknown[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    d = parsed
  } catch {
    return null
  }
  const val = (v: unknown): unknown => (typeof v === 'number' && v >= 0 && v < d.length && (typeof d[v] !== 'object' || d[v] === null) ? d[v] : v)
  const users = d.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x) && 'lastBetAt' in (x as object) && 'username' in (x as object))
  const banks = d.filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === 'object' && !Array.isArray(x) && 'lastReset' in (x as object) && 'isMutable' in (x as object) && val((x as Record<string, unknown>).type) === 'public',
  )
  if (users.length !== 1 || banks.length !== 1) return null // ambiguous or absent: never guess
  const userId = val(users[0].id)
  const bankId = val(banks[0].id)
  if (typeof userId !== 'number' || typeof bankId !== 'number') return null
  const s = (v: unknown) => (typeof val(v) === 'string' ? (val(v) as string) : null)
  return { userId, publicBankrollId: bankId, username: s(users[0].username), createdAt: s(users[0].createdAt), lastBetAt: s(users[0].lastBetAt) }
}
