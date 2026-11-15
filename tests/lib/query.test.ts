import { describe, it, expect } from 'vitest'
import { buildFilters, sortOrder, ignoredFilters, ignoredWarning } from '@/lib/query'

describe('buildFilters', () => {
  it('returns empty array for default params', () => {
    const filters = buildFilters({})
    expect(filters).toHaveLength(0)
  })

  it('adds isPaid filter for tipo=free', () => {
    const filters = buildFilters({ tipo: 'free' })
    expect(filters).toHaveLength(1)
  })

  it('adds isPaid filter for tipo=paid', () => {
    const filters = buildFilters({ tipo: 'paid' })
    expect(filters).toHaveLength(1)
  })

  it('adds yield filter when minYield is set', () => {
    const filters = buildFilters({ minYield: 10 })
    expect(filters).toHaveLength(1)
  })

  it('adds picks filter when minPicks is set', () => {
    const filters = buildFilters({ minPicks: 50 })
    expect(filters).toHaveLength(1)
  })

  it('adds multiple filters together', () => {
    const filters = buildFilters({ tipo: 'free', minYield: 5, minPicks: 100 })
    expect(filters).toHaveLength(3)
  })

  it('adds minYears filter in the Blogabet view', () => {
    const filters = buildFilters({ minYears: 1, platform: 'blogabet' })
    expect(filters).toHaveLength(2) // platform + minYears
  })

  it('adds resetOlderThan filter when enabled in the Blogabet view', () => {
    const filters = buildFilters({ resetOlderThan: true, platform: 'blogabet' })
    expect(filters).toHaveLength(2) // platform + resetOlderThan
  })

  it('does not add resetOlderThan filter when disabled', () => {
    const filters = buildFilters({ resetOlderThan: false })
    expect(filters).toHaveLength(0)
  })

  it('ignores Blogabet-only filters outside the Blogabet view and reports them (direct URLs cannot silently hide Tipstrr rows)', () => {
    const bbOnly = { activityMonths: 3, minYears: 1, conPicksFree: true, resetOlderThan: true, priceMin: 5, priceMax: 50 }
    // combined view (platform undefined): no condition at all
    expect(buildFilters(bbOnly)).toHaveLength(0)
    expect(ignoredFilters(bbOnly).sort()).toEqual(['activity', 'conPicksFree', 'minYears', 'price', 'resetOlderThan'].sort())
    // Tipstrr view: only the platform clause
    const tt = { ...bbOnly, platform: 'tipstrr' as const }
    expect(buildFilters(tt)).toHaveLength(1)
    expect(ignoredFilters(tt)).toHaveLength(5)
    // Blogabet view: everything applies, nothing ignored
    const bb = { ...bbOnly, platform: 'blogabet' as const }
    expect(ignoredFilters(bb)).toHaveLength(0)
    expect(buildFilters(bb).length).toBeGreaterThan(5)
    expect(ignoredWarning(tt)).toContain('Actividad')
    expect(ignoredWarning(bb)).toBeNull()
  })

  it('adds price range with isPaid=true and currency scope when priceMin/priceMax set in Blogabet view', () => {
    const filters = buildFilters({ priceMin: 5, priceMax: 20, platform: 'blogabet' })
    // is_paid=true + price_currency='eur' (EUR/GBP never mixed) + price >= + price <=
    expect(filters).toHaveLength(5)
  })

  it('ignores price range outside the Blogabet-only view (Tipstrr GBP / combined view) instead of silently hiding rows', () => {
    expect(buildFilters({ priceMin: 5, priceMax: 20, platform: 'tipstrr' })).toHaveLength(1) // platform only
    expect(buildFilters({ priceMin: 5, priceMax: 20 })).toHaveLength(0) // all-platforms view: no price clause
  })

  it('scopes by platform only when requested', () => {
    expect(buildFilters({ platform: 'tipstrr' })).toHaveLength(1)
    expect(buildFilters({ platform: 'blogabet' })).toHaveLength(1)
    expect(buildFilters({})).toHaveLength(0) // undefined = no platform clause
  })

  it('combines platform with other filters additively', () => {
    expect(buildFilters({ platform: 'tipstrr', minYield: 11 })).toHaveLength(2)
  })
})

describe('sortOrder', () => {
  it('adds a deterministic id tiebreaker to every sort', () => {
    const sorts = ['yield', 'profit', 'picks', 'followers', 'since_year', 'price', 'yield6m', 'yield12m', 'picks6m_avg'] as const
    for (const sort of sorts) {
      expect(sortOrder(sort)).toHaveLength(2)
    }
  })
})
