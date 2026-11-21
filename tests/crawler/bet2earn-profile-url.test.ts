import { describe, expect, it } from 'vitest'
import {
  bet2earnProfileUrl,
  bet2earnProfileUrlFromSource,
} from '@/crawler/platforms/bet2earn/types'

// Every case below was taken from a link the bet2earn.com site itself
// generated on 2026-11-21 (premium/free listings and the search box), so the
// mapping is demonstrated, not guessed.
describe('bet2earnProfileUrl (frontend route, demonstrated 2026-11-21)', () => {
  it('spaces become hyphens', () => {
    expect(bet2earnProfileUrl('fabian rivero')).toBe('https://bet2earn.com/tipsters/fabian-rivero')
    expect(bet2earnProfileUrl('mvpicks javi futbol femenino')).toBe('https://bet2earn.com/tipsters/mvpicks-javi-futbol-femenino')
  })
  it('underscores are kept', () => {
    expect(bet2earnProfileUrl('krlostm_winamax')).toBe('https://bet2earn.com/tipsters/krlostm_winamax')
  })
  it('accented letters are kept raw (the site URL-encodes them in hrefs)', () => {
    expect(bet2earnProfileUrl('elgüije')).toBe('https://bet2earn.com/tipsters/elgüije')
  })
  it('ampersand is kept raw', () => {
    expect(bet2earnProfileUrl('pensador & grupo 6 pinnacle')).toBe('https://bet2earn.com/tipsters/pensador-&-grupo-6-pinnacle')
  })
})

describe('bet2earnProfileUrlFromSource', () => {
  it('derives the frontend URL from the captured API source URL', () => {
    expect(bet2earnProfileUrlFromSource('https://bet2earn.com/api/user/fabian%20rivero'))
      .toBe('https://bet2earn.com/tipsters/fabian-rivero')
  })
  it('falls back to the site root when the source URL is missing', () => {
    expect(bet2earnProfileUrlFromSource(null)).toBe('https://bet2earn.com/')
  })
  it('never fabricates a slug from an unexpected URL shape', () => {
    expect(bet2earnProfileUrlFromSource('https://bet2earn.com/api/other/thing'))
      .toBe('https://bet2earn.com/')
  })
})

import { fromDbTipster, type TipsterReadRow } from '@/components/tipster-card-model'

describe('bet2earn card destination', () => {
  const row = {
    platform: 'bet2earn',
    name: 'fabian rivero',
    slug: 'fabian rivero',
    sourceUrl: 'https://bet2earn.com/api/user/fabian%20rivero',
    avatarUrl: null, capturedAt: null, sinceYear: 2023, picks: 7,
    profit: '-5.33', yield: '-76.14', followers: 0, isPaid: false,
    isVerified: null, resetCount: 0, price: null, priceCurrency: null,
    yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null,
    yield3mTrace: null, yield6mTrace: null, yield12mTrace: null,
    lastPickAt: null, signupAt: null, sourcePortfolioId: null,
    flagUrl: null, countryCode: null,
  } as unknown as TipsterReadRow

  it('links VER EN BET2EARN to the public profile page, not the API JSON', () => {
    const card = fromDbTipster(row)
    expect(card.sourceUrl).toBe('https://bet2earn.com/tipsters/fabian-rivero')
    expect(card.sourceLabel).toBe('bet2earn.com/tipsters/fabian-rivero')
  })

  it('keeps a missing source URL at the site root, never a fabricated slug', () => {
    const card = fromDbTipster({ ...row, sourceUrl: null })
    expect(card.sourceUrl).toBe('https://bet2earn.com/')
  })
})
