import { describe, it, expect } from 'vitest'
import {
  parseProfilePage,
  parseListingPage,
  Bet2InvestParseError,
} from '@/crawler/platforms/bet2invest/parse'
import { evaluateMys } from '@/crawler/platforms/mys'

// Fixtures are FULLY SYNTHETIC: invented tipsters, figures and currencies
// that do not match any captured page. They only reproduce the DOM shape
// (data-testid hooks, aria-pressed toggles, summary table) seen 2026-11-16.

function statCard(id: string, value: string, label: string): string {
  return `<div><div><span>${label}</span></div><p data-testid="${id}">${value}</p></div>`
}

const DEFAULT_SUMMARY_ROWS = `<tr data-testid="summary-row">
  <td><a href="/tipsters/basketball">Basketball</a></td>
  <td>800</td><td>52.25 %</td><td>+35.10</td><td>+6.10 %</td><td>+1.20 %</td><td>-0.85 %</td><td>2.020</td><td>2,400 $</td>
</tr>
<tr data-testid="summary-row">
  <td><a href="/tipsters/ice-hockey">Ice hockey</a></td>
  <td>12</td><td>58.33 %</td><td>+2.32</td><td>+24.10 %</td><td>+3.05 %</td><td>+0.10 %</td><td>1.760</td><td>150 $</td>
</tr>`

const SUMMARY_THEAD =
  '<thead><tr><th>Sport</th><th>Bets</th><th>Win rate</th><th>Profit</th><th>ROI</th><th>CLV</th><th>CLEV</th><th>Avg odds</th><th>Avg max bet</th></tr></thead>'

function profileHtml(
  overrides: {
    slug?: string
    ogTitle?: string
    ogDescription?: string
    bets?: string
    profit?: string
    roi?: string
    avgOdds?: string
    avgMaxBet?: string
    clv?: string
    activePeriod?: string | null
    monthlyEmpty?: boolean
    summaryThead?: string
    summaryRows?: string
    includeStatsBlock?: boolean
  } = {},
): string {
  const slug = overrides.slug ?? 'TESTPUNTER'
  const active = overrides.activePeriod === undefined ? 'All' : overrides.activePeriod
  const periods = ['30 d', '3 months', '1 year', 'All']
  const periodBlock =
    active === null
      ? ''
      : `<div data-testid="stats-period"><div role="group" aria-label="Period">
          ${periods
            .map((p) => `<button aria-pressed="${p === active ? 'true' : 'false'}">${p}</button>`)
            .join('')}
        </div></div>`
  const statsBlock =
    overrides.includeStatsBlock === false
      ? ''
      : `<div data-testid="stats-general">
        ${statCard('stats-settledBetsNumber', overrides.bets ?? '812', 'Bets')}
        ${statCard('stats-profit', overrides.profit ?? '+37.42', 'Profit')}
        ${statCard('stats-roi', overrides.roi ?? '+6.31%', 'ROI')}
        ${statCard('stats-averageBetMax', overrides.avgMaxBet ?? '€2,750', 'Avg max bet')}
        ${statCard('stats-averagePrice', overrides.avgOdds ?? '2.014', 'Avg odds')}
        ${statCard('stats-clv', overrides.clv ?? '+1.38%', 'CLV')}
      </div>
      <section data-testid="stats-results">
        <h2>Betting summary</h2>
        <ul>
          <li>Bets won : 360 (44.3 %)</li>
          <li>Half won bets : 31 (3.8 %)</li>
          <li>Refunded bets : 88 (10.8 %)</li>
          <li>Half lost bets : 18 (2.2 %)</li>
          <li>Lost bets : 315 (38.8 %)</li>
        </ul>
      </section>
      <section data-testid="stats-monthly">
        <h2>Profit by month</h2>
        ${overrides.monthlyEmpty === false ? '<div>chart</div>' : '<div data-testid="stats-empty"></div>'}
      </section>
      <section data-testid="stats-summary">
        <table>
          ${overrides.summaryThead ?? SUMMARY_THEAD}
          <tbody>${overrides.summaryRows ?? DEFAULT_SUMMARY_ROWS}</tbody>
        </table>
      </section>`
  return `<html><head>
    <link rel="canonical" href="https://bet2invest.com/tipsters/performance-stats/${slug}">
    <meta property="og:title" content="${overrides.ogTitle ?? `${slug}, PRO Tipster on Bet2Invest`}">
    <meta property="og:description" content="${overrides.ogDescription ?? `Discover ${slug}, a PRO Tipster. 6.31% ROI on 812 tips.`}">
  </head><body>
    <div data-testid="tipster-audience">
      <div><span>3.2</span><span>Rating</span></div>
      <div><span>11</span><span>Subscribers</span></div>
      <div><span>240</span><span>Followers</span></div>
    </div>
    ${periodBlock}
    ${statsBlock}
  </body></html>`
}

describe('parseProfilePage', () => {
  it('parses the stats block with period, currency and provenance kept apart', () => {
    const profile = parseProfilePage(profileHtml())
    expect(profile.platform).toBe('bet2invest')
    expect(profile.username).toBe('TESTPUNTER')
    expect(profile.profileUrl).toBe('https://bet2invest.com/tipsters/performance-stats/TESTPUNTER')
    expect(profile.accountType).toBe('pro')
    expect(profile.periodLabel).toBe('All')
    expect(profile.statsScope).toBe('all_time')
    expect(profile.settledBets).toBe(812)
    expect(profile.profitUnits).toBe(37.42)
    expect(profile.roiPct).toBe(6.31)
    expect(profile.avgOdds).toBe(2.014)
    expect(profile.avgMaxBet).toBe(2750)
    expect(profile.avgMaxBetCurrency).toBe('€')
    expect(profile.clvPct).toBe(1.38)
  })

  it('parses rating, subscribers and followers', () => {
    const { audience } = parseProfilePage(profileHtml())
    expect(audience).toEqual({ rating: 3.2, subscribers: 11, followers: 240 })
  })

  it('parses the betting summary counts', () => {
    const { results } = parseProfilePage(profileHtml())
    expect(results).toEqual({ won: 360, halfWon: 31, refunded: 88, halfLost: 18, lost: 315 })
  })

  it('parses per-sport rows by header name with currency kept', () => {
    const { bySport } = parseProfilePage(profileHtml())
    expect(bySport).toHaveLength(2)
    expect(bySport[0]).toEqual({
      label: 'Basketball',
      bets: 800,
      winRatePct: 52.25,
      profitUnits: 35.1,
      roiPct: 6.1,
      clvPct: 1.2,
      clevPct: -0.85,
      avgOdds: 2.02,
      avgMaxBet: 2400,
      avgMaxBetCurrency: '$',
    })
    expect(bySport[1].label).toBe('Ice hockey')
  })

  it('marks a non-All active period as other_period, never as all-time', () => {
    const profile = parseProfilePage(profileHtml({ activePeriod: '30 d' }))
    expect(profile.periodLabel).toBe('30 d')
    expect(profile.statsScope).toBe('other_period')
  })

  it('marks a missing period group as unknown scope', () => {
    expect(parseProfilePage(profileHtml({ activePeriod: null })).statsScope).toBe('unknown')
  })

  it('flags the monthly empty state instead of inventing rows', () => {
    expect(parseProfilePage(profileHtml()).monthlyAvailable).toBe(false)
    expect(parseProfilePage(profileHtml({ monthlyEmpty: false })).monthlyAvailable).toBe(true)
  })

  it('keeps absent figures as null, never 0', () => {
    const profile = parseProfilePage(profileHtml({ profit: '', roi: '-' }))
    expect(profile.profitUnits).toBeNull()
    expect(profile.roiPct).toBeNull()
  })

  it('handles unicode minus and narrow spaces in figures', () => {
    const profile = parseProfilePage(profileHtml({ profit: '−12.40', bets: '1 208' }))
    expect(profile.profitUnits).toBe(-12.4)
    expect(profile.settledBets).toBe(1208)
  })

  it('marks non-PRO pages as unknown account type', () => {
    const profile = parseProfilePage(
      profileHtml({ ogTitle: 'TESTPUNTER, Tipster on Bet2Invest', ogDescription: 'Discover TESTPUNTER, a Tipster.' }),
    )
    expect(profile.accountType).toBe('unknown')
  })

  it('throws on a challenge page instead of emitting nulls', () => {
    const challenge = '<html><head><script>window.__CF$cv$params={}</script></head><body>challenge-platform</body></html>'
    expect(() => parseProfilePage(challenge)).toThrow(Bet2InvestParseError)
  })

  it('throws on a canonical page without a stats block', () => {
    expect(() => parseProfilePage(profileHtml({ includeStatsBlock: false }))).toThrow(
      Bet2InvestParseError,
    )
  })

  it('throws on a summary table whose headers changed', () => {
    const wrongThead = '<thead><tr><th>Deporte</th><th>Apuestas</th></tr></thead>'
    expect(() => parseProfilePage(profileHtml({ summaryThead: wrongThead }))).toThrow(
      Bet2InvestParseError,
    )
  })

  it('throws on a malformed percent-encoded slug', () => {
    expect(() => parseProfilePage(profileHtml({ slug: '%E0%A4%A' }))).toThrow(Bet2InvestParseError)
  })

  it('rejects pages without a performance-stats canonical link', () => {
    expect(() => parseProfilePage('<html><body></body></html>')).toThrow(Bet2InvestParseError)
  })

  it('feeds MYS from the same global sample', () => {
    const profile = parseProfilePage(profileHtml())
    const mys = evaluateMys({ picks: profile.settledBets, yieldPct: profile.roiPct })
    expect(mys).toEqual({ muestra: true, yield: false, passesMY: false })
  })
})

const LISTING_THEAD =
  '<thead><tr><th>Tipster</th><th>ROI</th><th>Profit (1U)</th><th>CLV</th><th>Bets</th><th>Subscribers</th><th>Since</th></tr></thead>'

function listingRow(username: string, cellsByHeader: Record<string, string>, followers: string): string {
  const order = ['ROI', 'Profit (1U)', 'CLV', 'Bets', 'Subscribers', 'Since']
  const cells = order.map((h) => `<td>${cellsByHeader[h] ?? ''}</td>`).join('')
  return `<tr class="tipster-row">
    <td><a href="/tipsters/performance-stats/${username}"></a><p>${username}</p><span>${followers}</span></td>
    ${cells}
  </tr>`
}

describe('parseListingPage', () => {
  it('maps columns by header text, not position (ROI before Profit 1U here)', () => {
    const html = `<table>${LISTING_THEAD}${listingRow(
      'SYNTHETICA',
      { ROI: '7.42%', 'Profit (1U)': '22.15U', CLV: '1.10%', Bets: '432', Subscribers: '9', Since: '2024' },
      '318 followers',
    )}</table>`
    const rows = parseListingPage(html)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      username: 'SYNTHETICA',
      profileUrl: 'https://bet2invest.com/tipsters/performance-stats/SYNTHETICA',
      periodLabel: null,
      followers: 318,
      flatProfit1U: 22.15,
      roiPct: 7.42,
      clvPct: 1.1,
      bets: 432,
      subscribers: 9,
      sinceYear: 2024,
    })
  })

  it('carries no period claim on listing figures', () => {
    const html = `<table>${LISTING_THEAD}${listingRow('NOPERIOD', { ROI: '1.00%' }, '2 followers')}</table>`
    expect(parseListingPage(html)[0].periodLabel).toBeNull()
  })

  it('throws when the listing table has unrecognised headers', () => {
    const html = `<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead>${listingRow(
      'ANYONE',
      { ROI: '1.00%' },
      '1 followers',
    )}</table>`
    expect(() => parseListingPage(html)).toThrow(Bet2InvestParseError)
  })

  it('throws on a challenge page instead of returning an empty list', () => {
    const challenge = '<html><head><script>window.__CF$cv$params={}</script></head><body>challenge-platform</body></html>'
    expect(() => parseListingPage(challenge)).toThrow(Bet2InvestParseError)
  })

  it('skips rows without a profile link inside a valid table', () => {
    const html = `<table>${LISTING_THEAD}<tr class="tipster-row"><td>empty</td></tr></table>`
    expect(parseListingPage(html)).toEqual([])
  })
})
