import { describe, it, expect } from 'vitest'
import { buildFilters } from '@/lib/query'

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

  it('adds excludeYears filter', () => {
    const filters = buildFilters({ excludeYears: [2024, 2025] })
    expect(filters).toHaveLength(1)
  })

  it('adds price range with isPaid=true when priceMin/priceMax set', () => {
    const filters = buildFilters({ priceMin: 5, priceMax: 20 })
    // enforces is_paid=true + price >= + price <=
    expect(filters).toHaveLength(3)
  })
})
