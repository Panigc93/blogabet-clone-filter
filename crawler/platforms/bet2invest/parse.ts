// Bet2Invest parser: pure functions over their server-rendered Nuxt pages.
// No fetching and no DB here: HTTP and persistence live elsewhere, and
// nothing in this module runs on a schedule.
//
// Shape verified 2026-11-16 on two public profiles and the public listing.
// 'Profit by month': populated sections expose one button per month whose
// aria-label is plain text ("1/2025 · 190 bets · +20.86 U"); parsed strictly
// into monthly[] (profit and bets only: the page shows NO stake, so no
// monthly yield exists). Public 'Subscribe · $X/Month' button text is
// parsed literally into subscribePrice (currency as displayed, no FX).
//
// Fail-closed rules:
// - A challenge page (Cloudflare), a page without a stats block, a summary
//   table with unrecognised headers or a malformed profile URL all raise
//   Bet2InvestParseError. The parser never returns a quietly-empty record
//   for a page it did not understand.
// - Absent fields are null, never 0. Unknown stays unknown.
// - The listing has NO visible period label: its figures are stored without
//   a period claim (see docs/bet2invest-design.md).
// - 'roiPct' is the platform's own yield (their docs: profit / total
//   staked). The staked denominator is NOT displayed; the figure is stored
//   as reported, not recomputed. The profile's stake basis is INFERRED
//   (the page contrasts it with the flat 'Profit (1U)' mode), not labelled.
// - The listing column 'Profit (1U)' is a FLAT-STAKE figure and is kept in
//   its own field. It is never mixed with the profile profit.
// - Money keeps its displayed currency symbol; no conversion, no invented
//   units.

import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

export type Bet2InvestStatsScope = 'all_time' | 'other_period' | 'unknown'

export interface Bet2InvestAudience {
  rating: number | null
  subscribers: number | null
  followers: number | null
}

export interface Bet2InvestResultsSummary {
  won: number | null
  halfWon: number | null
  refunded: number | null
  halfLost: number | null
  lost: number | null
}

export interface Bet2InvestSummaryRow {
  label: string
  bets: number | null
  winRatePct: number | null
  profitUnits: number | null
  roiPct: number | null
  clvPct: number | null
  clevPct: number | null
  avgOdds: number | null
  avgMaxBet: number | null // liquidity figure as displayed
  avgMaxBetCurrency: string | null // symbol as displayed, e.g. '$'; never converted
}

export interface Bet2InvestProfile {
  platform: 'bet2invest'
  username: string
  profileUrl: string
  periodLabel: string | null // active period button as shown, e.g. 'All'
  statsScope: Bet2InvestStatsScope // 'all_time' ONLY when the active label is 'All'
  accountType: 'pro' | 'free' | 'paid' | 'unknown' // explicit og label 'PRO Tipster' / 'Free Tipster' / 'Paid Tipster' only
  accountLabel?: string | null // provenance: which og field(s) carried the label; null when unknown
  audience: Bet2InvestAudience
  settledBets: number | null
  profitUnits: number | null // profile profit; stake basis inferred (page contrasts flat 1U), not labelled
  roiPct: number | null // platform yield as reported (denominator not displayed)
  avgOdds: number | null
  avgMaxBet: number | null
  avgMaxBetCurrency: string | null
  clvPct: number | null
  results: Bet2InvestResultsSummary
  bySport: Bet2InvestSummaryRow[]
  monthlyAvailable: boolean // false when the section shows its empty state
  monthly?: Bet2InvestMonthRow[] | null // null: absent/empty/unparseable; never partial
  subscribePrice?: Bet2InvestSubscribePrice | null // null: not shown or not matching the strict pattern
}

export interface Bet2InvestMonthRow {
  year: number
  month: number // 1-12
  bets: number
  profitUnits: number // Bet2Invest units; no stake shown, so no yield
}

export interface Bet2InvestSubscribePrice {
  amount: number
  currency: '$' // literal symbol as displayed to an anonymous visitor; unverified beyond that
  period: 'Month'
  text: string
}

export interface Bet2InvestListingRow {
  username: string
  profileUrl: string
  periodLabel: null // the listing shows no period: figures carry no period claim
  followers: number | null
  flatProfit1U: number | null // 'Profit (1U)': flat-stake mode, NOT the profile profit
  roiPct: number | null
  clvPct: number | null
  bets: number | null
  subscribers: number | null
  sinceYear: number | null
}

export class Bet2InvestParseError extends Error {}

const KNOWN_PERIOD_LABELS = new Set(['All', '30 d', '3 months', '1 year'])

function normalizeNumberText(text: string): string {
  return text
    .replace(/−/g, '-') // unicode minus
    .replace(/[  ​]/g, '') // nbsp, narrow nbsp, zero-width space
    .trim()
}

function parseNumber(text: string | undefined | null): number | null {
  if (!text) return null
  const cleaned = normalizeNumberText(text)
    .replace(/[+$%\s]/g, '')
    .replace(/,/g, '')
    .replace(/U$/i, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

// Splits a displayed money figure into value + raw currency symbol, either
// order ('$4,100' or '4,100 $'). The symbol is kept as displayed.
function parseMoney(text: string | undefined | null): { value: number | null; currency: string | null } {
  if (!text) return { value: null, currency: null }
  const normalized = normalizeNumberText(text)
  const symbolMatch = normalized.match(/[^\d\s,.\-+()]/)
  const withoutSymbol = symbolMatch ? normalized.replace(symbolMatch[0], '') : normalized
  return { value: parseNumber(withoutSymbol), currency: symbolMatch ? symbolMatch[0] : null }
}

function safeDecode(component: string): string {
  try {
    return decodeURIComponent(component)
  } catch {
    throw new Bet2InvestParseError(`malformed URI component: ${component.slice(0, 40)}`)
  }
}

// The Cloudflare challenge script is embedded even on fully-rendered pages,
// so the marker alone means nothing: validity is decided per page type by
// the presence of the expected content (stats block / listing table).
function looksLikeChallenge(html: string): boolean {
  return /challenge-platform|__CF\$cv\$params/.test(html)
}

// A challenge response: the marker AND no stats block. The marker alone is
// not enough (it is embedded in complete pages too).
export function isChallengeResponse(html: string): boolean {
  return looksLikeChallenge(html) && !html.includes('data-testid="stats-settledBetsNumber"')
}

function testid($: cheerio.CheerioAPI, id: string): string {
  return $(`[data-testid="${id}"]`).first().text().trim()
}

// Identity comes ONLY from a fully validated canonical URL: https, host
// exactly bet2invest.com, no credentials/port/query/fragment, and a path of
// exactly /tipsters/performance-stats/<slug> (one segment, no extras).
function usernameFromCanonical($: cheerio.CheerioAPI): string {
  const href = $('link[rel="canonical"]').attr('href') ?? ''
  let url: URL
  try {
    url = new URL(href)
  } catch {
    throw new Bet2InvestParseError('no performance-stats canonical link found')
  }
  const m = /^\/tipsters\/performance-stats\/([^/]+)$/.exec(url.pathname)
  const ok =
    url.protocol === 'https:' &&
    url.hostname === 'bet2invest.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    m !== null
  if (!ok || !m) throw new Bet2InvestParseError('no performance-stats canonical link found')
  return safeDecode(m[1])
}

function parseStatsScope($: cheerio.CheerioAPI): { periodLabel: string | null; statsScope: Bet2InvestStatsScope } {
  const active = $('[data-testid="stats-period"] button[aria-pressed="true"]').first().text().trim()
  if (!active) return { periodLabel: null, statsScope: 'unknown' }
  if (active === 'All') return { periodLabel: active, statsScope: 'all_time' }
  return { periodLabel: active, statsScope: KNOWN_PERIOD_LABELS.has(active) ? 'other_period' : 'unknown' }
}

function parseAudience($: cheerio.CheerioAPI): Bet2InvestAudience {
  const audience: Bet2InvestAudience = { rating: null, subscribers: null, followers: null }
  $('[data-testid="tipster-audience"] > div').each((_, el) => {
    const value = $(el).find('span').first().text().trim()
    const label = $(el).find('span').last().text().trim().toLowerCase()
    if (label === 'rating') audience.rating = parseNumber(value)
    if (label === 'subscribers') audience.subscribers = parseNumber(value)
    if (label === 'followers') audience.followers = parseNumber(value)
  })
  return audience
}

function parseResults($: cheerio.CheerioAPI): Bet2InvestResultsSummary {
  const results: Bet2InvestResultsSummary = {
    won: null,
    halfWon: null,
    refunded: null,
    halfLost: null,
    lost: null,
  }
  const text = normalizeNumberText($('[data-testid="stats-results"]').text())
  // Two renderings of the same figures (observed 2026-11-16): the headline
  // line 'Label : N (p %)' lists only NON-ZERO categories on some profiles;
  // the legend <li><span>Label</span><b>N</b>... lists all five, including
  // explicit zeros. The headline wins; the legend (read by DOM, never from
  // concatenated text) supplies the explicit count.
  const legend = new Map<string, number>()
  $('[data-testid="stats-results"] li').each((_, li) => {
    const label = $(li).children('span').toArray().map((e) => $(e).text().trim()).find((t) => /[A-Za-z]/.test(t)) ?? ''
    const n = parseNumber($(li).children('b').first().text())
    if (label && n !== null) legend.set(label, n)
  })
  const pick = (label: string): number | null => {
    const head = text.match(new RegExp(`${label}\\s*:\\s*([\\d,]+)`))
    if (head) return parseNumber(head[1])
    return legend.get(label) ?? null
  }
  results.won = pick('Bets won')
  results.halfWon = pick('Half won bets')
  results.refunded = pick('Refunded bets')
  results.halfLost = pick('Half lost bets')
  results.lost = pick('Lost bets')
  return results
}

// Maps header labels to column indexes for the active summary table.
// Throws when the table's headers are not the known set: a layout change
// must fail loudly, never shift values into the wrong field.
const SUMMARY_HEADERS = ['sport', 'bets', 'win rate', 'profit', 'roi', 'clv', 'clev', 'avg odds', 'avg max bet']

function summaryColumnMap($: cheerio.CheerioAPI, table: cheerio.Cheerio<AnyNode>): Map<string, number> {
  const headers = table
    .find('thead th')
    .map((_, th) => $(th).text().trim().toLowerCase())
    .get()
  const map = new Map<string, number>()
  headers.forEach((h, i) => map.set(h, i))
  const missing = SUMMARY_HEADERS.filter((h) => !map.has(h))
  if (missing.length > 0) {
    throw new Bet2InvestParseError(`summary table headers not recognised: missing ${missing.join(', ')}`)
  }
  return map
}

function parseSummaryRows($: cheerio.CheerioAPI): Bet2InvestSummaryRow[] {
  const section = $('[data-testid="stats-summary"]').first()
  if (section.length === 0) return []
  const table = section.find('table').first()
  if (table.length === 0) return []
  const col = summaryColumnMap($, table)
  const rows: Bet2InvestSummaryRow[] = []
  table.find('[data-testid="summary-row"]').each((_, el) => {
    const cells = $(el).find('td')
    if (cells.length < 2) return
    const label = $(cells[col.get('sport')!]).text().trim()
    if (!label) return
    const at = (name: string): string => $(cells[col.get(name)!]).text().trim()
    const money = parseMoney(at('avg max bet'))
    rows.push({
      label,
      bets: parseNumber(at('bets')),
      winRatePct: parseNumber(at('win rate')),
      profitUnits: parseNumber(at('profit')),
      roiPct: parseNumber(at('roi')),
      clvPct: parseNumber(at('clv')),
      clevPct: parseNumber(at('clev')),
      avgOdds: parseNumber(at('avg odds')),
      avgMaxBet: money.value,
      avgMaxBetCurrency: money.currency,
    })
  })
  return rows
}

const MONTH_LABEL = /^(\d{1,2})\/(\d{4}) · (\d+) bets · ([+-]\d+(?:\.\d+)?) U$/

// All-or-nothing: one malformed, out-of-range, duplicated or non-contiguous
// bar discards the whole series (null), never a partial one.
export function parseMonthly($: cheerio.CheerioAPI): Bet2InvestMonthRow[] | null {
  const bars = $('[data-testid="stats-monthly"] [data-testid="stats-month"]')
  if (bars.length === 0) return null
  const rows: Bet2InvestMonthRow[] = []
  for (const el of bars.toArray()) {
    const m = MONTH_LABEL.exec(($(el).attr('aria-label') ?? '').trim())
    if (!m) return null
    const month = Number(m[1])
    if (month < 1 || month > 12) return null
    const row = { year: Number(m[2]), month, bets: Number(m[3]), profitUnits: Number(m[4]) }
    if (!Number.isFinite(row.profitUnits)) return null
    rows.push(row)
  }
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].year * 12 + rows[i - 1].month
    if (rows[i].year * 12 + rows[i].month - prev !== 1) return null
  }
  return rows
}

// Closure of the monthly series against the all-time totals: bets exact,
// profit within the rounding interval (0.005 per rounded figure).
export function monthlyClosesWithTotals(p: Bet2InvestProfile): boolean {
  if (!p.monthly || p.monthly.length === 0) return false
  if (p.settledBets === null || p.profitUnits === null) return false
  if (p.statsScope !== 'all_time') return false
  const bets = p.monthly.reduce((a, r) => a + r.bets, 0)
  const profit = p.monthly.reduce((a, r) => a + r.profitUnits, 0)
  return bets === p.settledBets && Math.abs(profit - p.profitUnits) <= 0.005 * (p.monthly.length + 1) + 1e-9
}

const SUBSCRIBE_PRICE = /^Subscribe\s*·\s*\$\s?(\d+(?:\.\d{1,2})?)\s*\/\s*Month$/

export function parseSubscribePrice($: cheerio.CheerioAPI): Bet2InvestSubscribePrice | null {
  const found = new Set<string>()
  $('button, a').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (/^Subscribe\b/.test(t) && SUBSCRIBE_PRICE.test(t)) found.add(t)
  })
  if (found.size !== 1) return null // none, or ambiguous
  const text = Array.from(found)[0]
  const m = SUBSCRIBE_PRICE.exec(text)!
  return { amount: Number(m[1]), currency: '$', period: 'Month', text }
}

export function parseProfilePage(html: string): Bet2InvestProfile {
  const $ = cheerio.load(html)
  const username = usernameFromCanonical($)
  if ($('[data-testid="stats-settledBetsNumber"]').length === 0) {
    throw new Bet2InvestParseError(
      looksLikeChallenge(html)
        ? 'challenge page: no stats delivered'
        : 'profile page without a stats block: refusing to emit an empty record',
    )
  }

  // Explicit label only, read per field (og:title and og:description). Classes seen on 961 public pages
  // (2026-11-17): 'PRO Tipster', 'Free Tipster' and 'Paid Tipster' (title) / 'paid tipster' (description).
  // Conflicting classes across the two fields, or none, = unknown (never inferred from absence). 'paid' says the
  // account is paid, nothing about price, subscription or access to paid content. What a label implies for
  // persistence is decided in to-db.
  const labelOf = (txt: string): 'pro' | 'free' | 'paid' | 'conflict' | null => {
    const found = [/\bPRO Tipster\b/.test(txt) && 'pro', /\bFree Tipster\b/.test(txt) && 'free', /\bpaid tipster\b/i.test(txt) && 'paid'].filter(Boolean) as ('pro' | 'free' | 'paid')[]
    return found.length === 0 ? null : found.length === 1 ? found[0] : 'conflict'
  }
  const ogTitle = $('meta[property="og:title"]').attr('content') ?? ''
  const ogDesc = $('meta[property="og:description"]').attr('content') ?? ''
  const labels = [labelOf(ogTitle), labelOf(ogDesc)]
  const present = new Set(labels.filter((l): l is NonNullable<typeof l> => l !== null))
  const accountType: 'pro' | 'free' | 'paid' | 'unknown' =
    present.size === 1 && !present.has('conflict') ? (Array.from(present)[0] as 'pro' | 'free' | 'paid') : 'unknown'
  const accountLabel = accountType === 'unknown' ? null : `og:${labels[0] !== null ? 'title' : ''}${labels[0] !== null && labels[1] !== null ? '+' : ''}${labels[1] !== null ? 'description' : ''}`

  const { periodLabel, statsScope } = parseStatsScope($)
  const avgMaxBet = parseMoney(testid($, 'stats-averageBetMax'))

  const monthlySection = $('[data-testid="stats-monthly"]')
  const monthlyAvailable =
    monthlySection.length > 0 && monthlySection.find('[data-testid="stats-empty"]').length === 0

  const settledBets = parseNumber(testid($, 'stats-settledBetsNumber'))
  const profitUnits = parseNumber(testid($, 'stats-profit'))
  const roiPct = parseNumber(testid($, 'stats-roi'))
  if (settledBets === null && profitUnits === null && roiPct === null) {
    throw new Bet2InvestParseError('stats block present but empty: refusing a false-success record')
  }

  return {
    platform: 'bet2invest',
    username,
    profileUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(username)}`,
    periodLabel,
    statsScope,
    accountType,
    accountLabel,
    audience: parseAudience($),
    settledBets,
    profitUnits,
    roiPct,
    avgOdds: parseNumber(testid($, 'stats-averagePrice')),
    avgMaxBet: avgMaxBet.value,
    avgMaxBetCurrency: avgMaxBet.currency,
    clvPct: parseNumber(testid($, 'stats-clv')),
    results: parseResults($),
    bySport: parseSummaryRows($),
    monthlyAvailable,
    monthly: monthlyAvailable ? parseMonthly($) : null,
    subscribePrice: parseSubscribePrice($),
  }
}

// Listing columns are mapped by header text, never by raw position: an
// unexpected table layout throws instead of shifting values across fields.
const LISTING_HEADERS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'flatProfit1U', patterns: [/^profit \(1u\)$/i] },
  { key: 'roiPct', patterns: [/^roi$/i] },
  { key: 'clvPct', patterns: [/^clv$/i] },
  { key: 'bets', patterns: [/^bets$/i] },
  { key: 'subscribers', patterns: [/^subscribers$/i] },
  { key: 'sinceYear', patterns: [/^since$/i] },
]

// A valid listing page must carry a table whose thead matches at least two
// known columns; anything else (challenge, error, redesign) throws.
export function parseListingPage(html: string): Bet2InvestListingRow[] {
  const $ = cheerio.load(html)
  const rows: Bet2InvestListingRow[] = []
  let validTables = 0
  $('table').each((_, tableEl) => {
    const table = $(tableEl)
    const headers = table
      .find('thead th')
      .map((_, th) => $(th).text().trim())
      .get()
    const col = new Map<string, number>()
    headers.forEach((h, i) => {
      for (const { key, patterns } of LISTING_HEADERS) {
        if (patterns.some((p) => p.test(h))) col.set(key, i)
      }
    })
    if (col.size < 2) return // not the listing table
    validTables += 1
    table.find('tr.tipster-row').each((__, el) => {

      const href = $(el).find('a[href*="/tipsters/performance-stats/"]').attr('href') ?? ''
      const match = href.match(/\/tipsters\/performance-stats\/([^/?#]+)/)
      if (!match) return
      const username = safeDecode(match[1])
      const cells = $(el).find('td')
      const at = (key: string): string => {
        const i = col.get(key)
        return i === undefined ? '' : $(cells[i]).text().trim()
      }
      const identityText = $(cells[0]).text().trim()
      const followersMatch = identityText.match(/([\d,]+)\s+followers/i)
      const sinceMatch = at('sinceYear').match(/(\d{4})/)
      rows.push({
        username,
        profileUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(username)}`,
        periodLabel: null,
        followers: followersMatch ? parseNumber(followersMatch[1]) : null,
        flatProfit1U: parseNumber(at('flatProfit1U')),
        roiPct: parseNumber(at('roiPct')),
        clvPct: parseNumber(at('clvPct')),
        bets: parseNumber(at('bets')),
        subscribers: parseNumber(at('subscribers')),
        sinceYear: sinceMatch ? parseNumber(sinceMatch[1]) : null,
      })
    })
  })
  if (validTables === 0) {
    throw new Bet2InvestParseError(
      looksLikeChallenge(html)
        ? 'challenge page: no listing delivered'
        : 'listing table not found or headers not recognised',
    )
  }
  if (rows.length === 0) {
    throw new Bet2InvestParseError('listing table parsed but yielded no tipster rows')
  }
  return rows
}
