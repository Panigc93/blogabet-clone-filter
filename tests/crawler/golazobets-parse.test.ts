import { describe, it, expect } from 'vitest'
import {
  extractDataPage,
  parseListingPage,
  parseProfilePage,
  GolazobetsParseError,
} from '@/crawler/platforms/golazobets/parse'
import { evaluateMys, MYS_MIN_PICKS, MYS_MIN_YIELD_PCT } from '@/crawler/platforms/mys'

// Fixtures use fictional tipsters modelled on the real payload shape
// (captured 2026-11-15). The real payload embeds user.email; the fixture
// keeps that field on purpose to prove the parser never propagates it.

function listingHtml(items: unknown[], paginator: Record<string, unknown> = {}): string {
  const page = {
    component: 'tipsters/Index',
    props: {
      tipsters: {
        current_page: 1,
        last_page: 28,
        per_page: 36,
        total: 1001,
        data: items,
        ...paginator,
      },
    },
  }
  const json = JSON.stringify(page).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<html><body><div id="app" data-page="${json}"></div></body></html>`
}

const KROM_LIKE = {
  id: 822,
  user_id: 836,
  type: 'free',
  sport_id: 1,
  picks_count: 140,
  user: {
    id: 836,
    name: 'Ficticio',
    lastname: 'Ejemplo',
    username: 'TESTTIPSTER1',
    email: 'ficticio@example.com',
    profile_picture: 'pic.webp',
    status: 'enabled',
  },
  sport: { id: 1, name: 'Fútbol', color: '#A656CC' },
  tipster_stats: {
    tipster_id: 822,
    number_bets: 137,
    total_bet: 129,
    profit: 56.91,
    yield: 44.11,
    average_stake: 0.94,
    average_odds: 3.87,
    win_rate: 47.45,
  },
  total_follows_received: 20,
  profit_series: [2.85, 7.84, 13.93, 44.69, 56.91],
}

describe('extractDataPage', () => {
  it('parses the escaped Inertia payload', () => {
    const page = extractDataPage(listingHtml([]))
    expect(page.component).toBe('tipsters/Index')
  })

  it('rejects pages without data-page', () => {
    expect(() => extractDataPage('<html><body></body></html>')).toThrow(GolazobetsParseError)
  })

  it('rejects non-tipster components', () => {
    const json = JSON.stringify({ component: 'home/Index', props: {} }).replace(/"/g, '&quot;')
    expect(() => extractDataPage(`<div data-page="${json}"></div>`)).toThrow(GolazobetsParseError)
  })

  it('rejects malformed JSON', () => {
    expect(() => extractDataPage('<div data-page="{broken&quot;}"></div>')).toThrow(
      GolazobetsParseError,
    )
  })
})

describe('parseListingPage', () => {
  it('normalizes items and paginator', () => {
    const listing = parseListingPage(listingHtml([KROM_LIKE]))
    expect(listing.total).toBe(1001)
    expect(listing.lastPage).toBe(28)
    expect(listing.items).toHaveLength(1)
    const item = listing.items[0]
    expect(item.platform).toBe('golazobets')
    expect(item.platformId).toBe(822)
    expect(item.username).toBe('TESTTIPSTER1')
    expect(item.profileUrl).toBe('https://golazobets.com/tipster/TESTTIPSTER1')
    expect(item.accountType).toBe('free')
    expect(item.sportName).toBe('Fútbol')
    expect(item.followers).toBe(20)
    expect(item.picksReported).toBe(140)
    expect(item.stats).toEqual({
      numberBets: 137,
      totalBetUnits: 129,
      profitUnits: 56.91,
      yieldPct: 44.11,
      averageStake: 0.94,
      averageOdds: 3.87,
      winRatePct: 47.45,
    })
    expect(item.profitSeries).toEqual([2.85, 7.84, 13.93, 44.69, 56.91])
  })

  it('never leaks the embedded email into parsed output', () => {
    const listing = parseListingPage(listingHtml([KROM_LIKE]))
    const serialized = JSON.stringify(listing)
    expect(serialized).not.toContain('ficticio@example.com')
    expect(serialized).not.toContain('email')
  })

  it('drops items without id or username instead of inventing identity', () => {
    const noId = { ...KROM_LIKE, id: null }
    const noUser = { ...KROM_LIKE, user: {} }
    const listing = parseListingPage(listingHtml([noId, noUser, KROM_LIKE]))
    expect(listing.items).toHaveLength(1)
  })

  it('keeps absent stats as null, never zero', () => {
    const noStats = { ...KROM_LIKE, tipster_stats: null, picks_count: null }
    const listing = parseListingPage(listingHtml([noStats]))
    expect(listing.items[0].stats).toBeNull()
    expect(listing.items[0].picksReported).toBeNull()
  })

  it('marks unknown account types without failing the item', () => {
    const weird = { ...KROM_LIKE, type: 'sponsor' }
    expect(parseListingPage(listingHtml([weird])).items[0].accountType).toBe('unknown')
  })
})

describe('parseProfilePage', () => {
  const profileHtml = (() => {
    const page = {
      component: 'tipsters/TipsterProfile',
      props: {
        tipster: KROM_LIKE,
        followers: 21,
        stats: [
          {
            tipster_id: 822,
            year: 2026,
            month: 5,
            total_picks: 5,
            total_bet: 5,
            profit: 2.85,
            yield: 57,
            average_stake: 1,
            average_odds: 3.19,
            win_rate: 40,
          },
        ],
        detailed_stats: {
          by_sport: [
            { id: 'x', label: 'Fútbol', total_picks: 120, profit: 50, yield: 41.7, win_rate: 47 },
          ],
          by_bookie: [
            { id: 'y', label: 'Bet365', total_picks: 21, profit: 1.65, yield: 9.43, win_rate: 33.33 },
          ],
        },
        recent_results: ['lost', 'won'],
      },
    }
    const json = JSON.stringify(page).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return `<html><body><div id="app" data-page="${json}"></div></body></html>`
  })()

  it('parses monthly stats and breakdowns', () => {
    const profile = parseProfilePage(profileHtml)
    expect(profile.item.username).toBe('TESTTIPSTER1')
    expect(profile.item.followers).toBe(21)
    expect(profile.monthly).toHaveLength(1)
    expect(profile.monthly[0]).toMatchObject({ year: 2026, month: 5, totalPicks: 5, yieldPct: 57 })
    expect(profile.bySport[0]).toMatchObject({ label: 'Fútbol', totalPicks: 120 })
    expect(profile.byBookie[0].label).toBe('Bet365')
    expect(profile.recentResults).toEqual(['lost', 'won'])
  })

  it('rejects a listing page passed as a profile', () => {
    expect(() => parseProfilePage(listingHtml([KROM_LIKE]))).toThrow(GolazobetsParseError)
  })
})

describe('evaluateMys', () => {
  it('passes muestra and yield at the thresholds', () => {
    expect(evaluateMys({ picks: MYS_MIN_PICKS, yieldPct: MYS_MIN_YIELD_PCT })).toEqual({
      muestra: true,
      yield: true,
      passesMY: true,
    })
  })

  it('fails below either threshold', () => {
    expect(evaluateMys({ picks: 99, yieldPct: 44 }).passesMY).toBe(false)
    expect(evaluateMys({ picks: 500, yieldPct: 10.9 }).passesMY).toBe(false)
  })

  it('returns null (not false) when the sample is unknown', () => {
    expect(evaluateMys({ picks: null, yieldPct: null })).toEqual({
      muestra: null,
      yield: null,
      passesMY: null,
    })
  })
})
