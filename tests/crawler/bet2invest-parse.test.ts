import { describe, it, expect } from 'vitest'
import {
  parseProfilePage,
  parseListingPage,
  Bet2InvestParseError,
} from '@/crawler/platforms/bet2invest/parse'
import { evaluateMys } from '@/crawler/platforms/mys'

// Fixtures use fictional tipsters modelled on the real DOM shape captured
// 2026-11-16 (data-testid attributes, aria-pressed toggles, summary table).
// No real tipster data is stored in tests.

function statCard(id: string, value: string, label: string): string {
  return `<div><div><span>${label}</span></div><p data-testid="${id}">${value}</p></div>`
}

function profileHtml(overrides: {
  slug?: string
  ogDescription?: string
  bets?: string
  profit?: string
  roi?: string
  avgOdds?: string
  avgMaxBet?: string
  clv?: string
  monthlyEmpty?: boolean
  summaryRows?: string
} = {}): string {
  const slug = overrides.slug ?? 'TESTPUNTER'
  const og =
    overrides.ogDescription ?? `Discover ${slug}, a PRO Tipster. 9.50% ROI on 640 tips.`
  const summaryRows =
    overrides.summaryRows ??
    `<tr data-testid="summary-row">
      <td><a href="/tipsters/soccer">Soccer</a></td>
      <td>638</td><td>45.40 %</td><td>+58.10</td><td>+9.55 %</td><td>+2.10 %</td><td>-1.05 %</td><td>1.950</td><td>4,100 $</td>
    </tr>
    <tr data-testid="summary-row">
      <td><a href="/tipsters/tennis">Tennis</a></td>
      <td>2</td><td>50.00 %</td><td>+0.70</td><td>+35.00 %</td><td>+4.00 %</td><td>+0.00 %</td><td>1.800</td><td>200 $</td>
    </tr>`
  return `<html><head>
    <link rel="canonical" href="https://bet2invest.com/tipsters/performance-stats/${slug}">
    <meta property="og:description" content="${og}">
  </head><body>
    <div data-testid="tipster-audience">
      <div><span>4.5</span><span>Rating</span></div>
      <div><span>7</span><span>Subscribers</span></div>
      <div><span>120</span><span>Followers</span></div>
    </div>
    <div data-testid="stats-period">
      <div role="group" aria-label="Period">
        <button aria-pressed="false">30 d</button>
        <button aria-pressed="false">3 months</button>
        <button aria-pressed="false">1 year</button>
        <button aria-pressed="true">All</button>
      </div>
    </div>
    <div data-testid="stats-general">
      ${statCard('stats-settledBetsNumber', overrides.bets ?? '640', 'Bets')}
      ${statCard('stats-profit', overrides.profit ?? '+58.80', 'Profit')}
      ${statCard('stats-roi', overrides.roi ?? '+9.50%', 'ROI')}
      ${statCard('stats-averageBetMax', overrides.avgMaxBet ?? '$3,900', 'Avg max bet')}
      ${statCard('stats-averagePrice', overrides.avgOdds ?? '1.945', 'Avg odds')}
      ${statCard('stats-clv', overrides.clv ?? '+2.20%', 'CLV')}
    </div>
    <section data-testid="stats-results">
      <h2>Betting summary</h2>
      <ul>
        <li>Bets won : 290 (45.3 %)</li>
        <li>Half won bets : 20 (3.1 %)</li>
        <li>Refunded bets : 60 (9.4 %)</li>
        <li>Half lost bets : 25 (3.9 %)</li>
        <li>Lost bets : 245 (38.3 %)</li>
      </ul>
    </section>
    <section data-testid="stats-monthly">
      <h2>Profit by month</h2>
      ${overrides.monthlyEmpty === false ? '<div>chart</div>' : '<div data-testid="stats-empty"></div>'}
    </section>
    <section data-testid="stats-summary">
      <table>
        <thead><tr><th>Sport</th><th>Bets</th><th>Win rate</th><th>Profit</th><th>ROI</th><th>CLV</th><th>CLEV</th><th>Avg odds</th><th>Avg max bet</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </section>
  </body></html>`
}

describe('parseProfilePage', () => {
  it('parses the all-time stats block with provenance kept apart', () => {
    const profile = parseProfilePage(profileHtml())
    expect(profile.platform).toBe('bet2invest')
    expect(profile.username).toBe('TESTPUNTER')
    expect(profile.profileUrl).toBe(
      'https://bet2invest.com/tipsters/performance-stats/TESTPUNTER',
    )
    expect(profile.accountType).toBe('pro')
    expect(profile.periodLabel).toBe('All')
    expect(profile.settledBets).toBe(640)
    expect(profile.profitUnits).toBe(58.8)
    expect(profile.roiPct).toBe(9.5)
    expect(profile.avgOdds).toBe(1.945)
    expect(profile.avgMaxBet).toBe(3900)
    expect(profile.clvPct).toBe(2.2)
  })

  it('parses rating, subscribers and followers', () => {
    const { audience } = parseProfilePage(profileHtml())
    expect(audience).toEqual({ rating: 4.5, subscribers: 7, followers: 120 })
  })

  it('parses the betting summary counts', () => {
    const { results } = parseProfilePage(profileHtml())
    expect(results).toEqual({ won: 290, halfWon: 20, refunded: 60, halfLost: 25, lost: 245 })
  })

  it('parses per-sport rows with every column', () => {
    const { bySport } = parseProfilePage(profileHtml())
    expect(bySport).toHaveLength(2)
    expect(bySport[0]).toEqual({
      label: 'Soccer',
      bets: 638,
      winRatePct: 45.4,
      profitUnits: 58.1,
      roiPct: 9.55,
      clvPct: 2.1,
      clevPct: -1.05,
      avgOdds: 1.95,
      avgMaxBet: 4100,
    })
    expect(bySport[1].label).toBe('Tennis')
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

  it('marks non-PRO descriptions as unknown account type', () => {
    const profile = parseProfilePage(
      profileHtml({ ogDescription: 'Discover TESTPUNTER, a Tipster.' }),
    )
    expect(profile.accountType).toBe('unknown')
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

function listingRow(username: string, cells: string[], followers: string): string {
  return `<tr class="tipster-row">
    <td><a href="/tipsters/performance-stats/${username}"></a><p>${username}</p><span>${followers}</span></td>
    ${cells.map((c) => `<td>${c}</td>`).join('')}
  </tr>`
}

describe('parseListingPage', () => {
  it('parses rows keeping flat 1U profit in its own field', () => {
    const html = `<table>${listingRow(
      'FLATCHECK',
      ['91.62U', '19.68%', '2.84%', '753', '21', '2023'],
      '1138 followers',
    )}</table>`
    const rows = parseListingPage(html)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      username: 'FLATCHECK',
      profileUrl: 'https://bet2invest.com/tipsters/performance-stats/FLATCHECK',
      followers: 1138,
      flatProfit1U: 91.62,
      roiPct: 19.68,
      clvPct: 2.84,
      bets: 753,
      subscribers: 21,
      sinceYear: 2023,
    })
  })

  it('skips rows without a profile link', () => {
    expect(parseListingPage('<table><tr class="tipster-row"><td>empty</td></tr></table>')).toEqual([])
  })
})
