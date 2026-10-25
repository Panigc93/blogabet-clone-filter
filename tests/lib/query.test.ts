import { describe, it, expect } from 'vitest'
import { buildFilters, sortOrder } from '@/lib/query'

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

  it('adds minYears filter', () => {
    const filters = buildFilters({ minYears: 1 })
    expect(filters).toHaveLength(1)
  })

  it('adds resetOlderThan filter when enabled', () => {
    const filters = buildFilters({ resetOlderThan: true })
    expect(filters).toHaveLength(1)
  })

  it('does not add resetOlderThan filter when disabled', () => {
    const filters = buildFilters({ resetOlderThan: false })
    expect(filters).toHaveLength(0)
  })

  it('adds price range with isPaid=true when priceMin/priceMax set', () => {
    const filters = buildFilters({ priceMin: 5, priceMax: 20 })
    // enforces is_paid=true + price >= + price <=
    expect(filters).toHaveLength(3)
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
