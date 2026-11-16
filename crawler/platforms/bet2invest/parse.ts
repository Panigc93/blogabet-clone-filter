// Bet2Invest parser: pure functions over their server-rendered Nuxt pages.
// No fetching and no DB here: HTTP and persistence live elsewhere, and
// nothing in this module runs on a schedule.
//
// Shape verified 2026-11-16 on two public profiles and the public listing.
// The 'Profit by month' section was observed only in its empty state, so
// monthly rows are NOT parsed yet (monthlyAvailable flags the state).
//
// Provenance rules (same as the other platform adapters):
// - Absent fields are null, never 0.
// - 'roiPct' is the platform's own real-stakes yield (their docs define it
//   as profit / total staked). The staked denominator is NOT displayed on
//   the page, so this figure is stored as reported, not recomputed.
// - The listing column 'Profit (1U)' is a FLAT-STAKE figure and is kept in
//   its own field. It is never mixed with the real-stakes profit.

import * as cheerio from 'cheerio'

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
  avgMaxBet: number | null // liquidity figure, displayed in $ by the platform
}

export interface Bet2InvestProfile {
  platform: 'bet2invest'
  username: string
  profileUrl: string
  periodLabel: string | null // active period button as shown, e.g. 'All'
  accountType: 'pro' | 'unknown'
  audience: Bet2InvestAudience
  settledBets: number | null
  profitUnits: number | null // real-stakes profit, as displayed
  roiPct: number | null // real-stakes yield as reported (basis: platform total staked)
  avgOdds: number | null
  avgMaxBet: number | null
  clvPct: number | null
  results: Bet2InvestResultsSummary
  bySport: Bet2InvestSummaryRow[]
  monthlyAvailable: boolean // false when the section shows its empty state
}

export interface Bet2InvestListingRow {
  username: string
  profileUrl: string
  followers: number | null
  flatProfit1U: number | null // 'Profit (1U)': flat-stake mode, NOT the real-stakes profit
  roiPct: number | null
  clvPct: number | null
  bets: number | null
  subscribers: number | null
  sinceYear: number | null
}

export class Bet2InvestParseError extends Error {}

function parseNumber(text: string | undefined | null): number | null {
  if (!text) return null
  const cleaned = text.replace(/[+$%\s]/g, '').replace(/,/g, '').replace(/U$/i, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

// Handles both '$5,303' and '5,306 $' display orders.
function parseMoney(text: string | undefined | null): number | null {
  return parseNumber(text)
}

function testid($: cheerio.CheerioAPI, id: string): string {
  return $(`[data-testid="${id}"]`).first().text().trim()
}

function usernameFromCanonical($: cheerio.CheerioAPI): string | null {
  const href = $('link[rel="canonical"]').attr('href') ?? ''
  const match = href.match(/\/tipsters\/performance-stats\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
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
  const text = $('[data-testid="stats-results"]').text()
  const pick = (pattern: RegExp): number | null => {
    const match = text.match(pattern)
    return match ? parseNumber(match[1]) : null
  }
  results.won = pick(/Bets won\s*:\s*([\d,]+)/)
  results.halfWon = pick(/Half won bets\s*:\s*([\d,]+)/)
  results.refunded = pick(/Refunded bets\s*:\s*([\d,]+)/)
  results.halfLost = pick(/Half lost bets\s*:\s*([\d,]+)/)
  results.lost = pick(/Lost bets\s*:\s*([\d,]+)/)
  return results
}

function parseSummaryRows($: cheerio.CheerioAPI): Bet2InvestSummaryRow[] {
  const rows: Bet2InvestSummaryRow[] = []
  $('[data-testid="summary-row"]').each((_, el) => {
    const cells = $(el).find('td')
    if (cells.length < 2) return
    const label = $(cells[0]).text().trim()
    if (!label) return
    const at = (i: number): string => $(cells[i]).text().trim()
    rows.push({
      label,
      bets: parseNumber(at(1)),
      winRatePct: parseNumber(at(2)),
      profitUnits: parseNumber(at(3)),
      roiPct: parseNumber(at(4)),
      clvPct: parseNumber(at(5)),
      clevPct: parseNumber(at(6)),
      avgOdds: parseNumber(at(7)),
      avgMaxBet: parseMoney(at(8)),
    })
  })
  return rows
}

export function parseProfilePage(html: string): Bet2InvestProfile {
  const $ = cheerio.load(html)
  const username = usernameFromCanonical($)
  if (!username) throw new Bet2InvestParseError('no performance-stats canonical link found')

  const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
  const accountType: 'pro' | 'unknown' = /\bPRO\b/i.test(ogDescription) ? 'pro' : 'unknown'

  const periodLabel =
    $('[data-testid="stats-period"] button[aria-pressed="true"]').first().text().trim() || null

  const monthlySection = $('[data-testid="stats-monthly"]')
  const monthlyAvailable =
    monthlySection.length > 0 && monthlySection.find('[data-testid="stats-empty"]').length === 0

  return {
    platform: 'bet2invest',
    username,
    profileUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(username)}`,
    periodLabel,
    accountType,
    audience: parseAudience($),
    settledBets: parseNumber(testid($, 'stats-settledBetsNumber')),
    profitUnits: parseNumber(testid($, 'stats-profit')),
    roiPct: parseNumber(testid($, 'stats-roi')),
    avgOdds: parseNumber(testid($, 'stats-averagePrice')),
    avgMaxBet: parseMoney(testid($, 'stats-averageBetMax')),
    clvPct: parseNumber(testid($, 'stats-clv')),
    results: parseResults($),
    bySport: parseSummaryRows($),
    monthlyAvailable,
  }
}

export function parseListingPage(html: string): Bet2InvestListingRow[] {
  const $ = cheerio.load(html)
  const rows: Bet2InvestListingRow[] = []
  $('tr.tipster-row').each((_, el) => {
    const href = $(el).find('a[href*="/tipsters/performance-stats/"]').attr('href') ?? ''
    const match = href.match(/\/tipsters\/performance-stats\/([^/?#]+)/)
    if (!match) return
    const username = decodeURIComponent(match[1])
    const cells = $(el).find('td')
    // Column order follows the listing thead: identity, Profit (1U), ROI,
    // CLV, Bets, Subscribers, Since. Read by position, keep flat vs real apart.
    const at = (i: number): string => $(cells[i]).text().trim()
    const identityText = at(0)
    const followersMatch = identityText.match(/([\d,]+)\s+followers/i)
    const sinceMatch = at(6).match(/(\d{4})/)
    rows.push({
      username,
      profileUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(username)}`,
      followers: followersMatch ? parseNumber(followersMatch[1]) : null,
      flatProfit1U: parseNumber(at(1)),
      roiPct: parseNumber(at(2)),
      clvPct: parseNumber(at(3)),
      bets: parseNumber(at(4)),
      subscribers: parseNumber(at(5)),
      sinceYear: sinceMatch ? parseNumber(sinceMatch[1]) : null,
    })
  })
  return rows
}
