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

export type Bet2InvestBankrollSelection =
  | { status: 'selected'; ids: Bet2InvestProfileIds; basis: 'single-public-bankroll' | 'default-stats-equal-header' }
  | { status: 'candidate'; ids: Bet2InvestProfileIds; why: string } // default bankroll found, but its stats do not equal the header: NOT linked
  | { status: 'ambiguous'; why: string }

// Header ROI is published with 2 decimals; the bankroll stats carry 3+. Same gate as the closing check.
export const B2I_HEADER_ROI_TOLERANCE = 0.005 + 1e-9

/**
 * Chooses the public bankroll whose months to fetch. Rule (observed on 970 profiles, not an official definition):
 * a single public bankroll is taken as is; with several, exactly one must have default=true AND its payload
 * statistics (betsNumber, roi) must equal the header. Otherwise it is a candidate or ambiguous and is never linked.
 * A single bankroll does not guarantee the same scope as the header (user/summary/bankroll counters can differ).
 */
export function selectProfileIds(html: string): Bet2InvestBankrollSelection {
  const $ = cheerio.load(html)
  const raw = $('script#__NUXT_DATA__').first().text()
  if (!raw) return { status: 'ambiguous', why: 'no payload' }
  let d: unknown[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { status: 'ambiguous', why: 'payload not an array' }
    d = parsed
  } catch {
    return { status: 'ambiguous', why: 'payload not json' }
  }
  const val = (v: unknown): unknown => (typeof v === 'number' && v >= 0 && v < d.length && (typeof d[v] !== 'object' || d[v] === null) ? d[v] : v)
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  const users = d.filter((x): x is Record<string, unknown> => isObj(x) && 'lastBetAt' in x && 'username' in x)
  const banks = d.filter((x): x is Record<string, unknown> => isObj(x) && 'lastReset' in x && 'isMutable' in x && val(x.type) === 'public')
  if (users.length !== 1) return { status: 'ambiguous', why: 'user absent or not unique' }
  if (banks.length === 0) return { status: 'ambiguous', why: 'no public bankroll' }
  const userId = val(users[0].id)
  if (typeof userId !== 'number') return { status: 'ambiguous', why: 'user id missing' }
  const s = (v: unknown) => (typeof val(v) === 'string' ? (val(v) as string) : null)
  const mk = (b: Record<string, unknown>): Bet2InvestProfileIds | null => {
    const bankId = val(b.id)
    if (typeof bankId !== 'number') return null
    return { userId, publicBankrollId: bankId, username: s(users[0].username), createdAt: s(users[0].createdAt), lastBetAt: s(users[0].lastBetAt) }
  }
  if (banks.length === 1) {
    const ids = mk(banks[0])
    return ids ? { status: 'selected', ids, basis: 'single-public-bankroll' } : { status: 'ambiguous', why: 'bankroll id missing' }
  }
  const m = html.match(/og:description" content="[^"]*?(-?[\d.]+)% ROI on (\d+) tips/)
  if (!m) return { status: 'ambiguous', why: 'header missing, several bankrolls' }
  const hdrRoi = parseFloat(m[1])
  const hdrBets = parseInt(m[2], 10)
  const defaults = banks.filter((b) => val(b.default) === true)
  if (defaults.length !== 1) return { status: 'ambiguous', why: `default absent or not unique (${defaults.length})` }
  const stats = (b: Record<string, unknown>): { bets: unknown; roi: unknown } | null => {
    const st = typeof b.statistics === 'number' ? d[b.statistics] : null
    return isObj(st) ? { bets: val(st.betsNumber), roi: val(st.roi) } : null
  }
  const matches = (b: Record<string, unknown>): boolean => {
    const st = stats(b)
    return !!st && st.bets === hdrBets && typeof st.roi === 'number' && Math.abs(st.roi - hdrRoi) <= B2I_HEADER_ROI_TOLERANCE
  }
  const dflt = defaults[0]
  const matching = banks.filter(matches)
  if (matching.length >= 1 && !matching.includes(dflt)) return { status: 'ambiguous', why: 'header matches a non-default bankroll' }
  if (matching.length > 1) return { status: 'ambiguous', why: 'several bankrolls match header' }
  const ids = mk(dflt)
  if (!ids) return { status: 'ambiguous', why: 'default bankroll id missing' }
  if (matching.length === 1) return { status: 'selected', ids, basis: 'default-stats-equal-header' }
  const st = stats(dflt)
  return { status: 'candidate', ids, why: `default stats ${st ? `${String(st.bets)}/${String(st.roi)}` : 'absent'} vs header ${hdrBets}/${hdrRoi}` }
}

/** Ids of the selected public bankroll, or null when the selection is a candidate or ambiguous. */
export function extractProfileIds(html: string): Bet2InvestProfileIds | null {
  const r = selectProfileIds(html)
  return r.status === 'selected' ? r.ids : null // candidate or ambiguous: never guess
}
