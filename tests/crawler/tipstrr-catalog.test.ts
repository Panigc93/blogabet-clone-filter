import { describe, it, expect } from 'vitest'
import {
  validateCatalogCapture,
  buildCatalogIndex,
  TIPSTRR_LISTING_PAGE_SIZE,
  type CatalogCapture,
  type CatalogQueryParams,
} from '@/crawler/platforms/tipstrr/catalog'

// Synthetic fixtures only. The real capture awaits an explicitly authorized
// bounded pass; these lock the validation rules that pass must satisfy so
// its count is a measurement (stored slugs), never a sum of assumed pages.

const PARAMS: CatalogQueryParams = {
  filterType: 0,
  sportId: 1,
  profit: 0,
  roi: 0,
  tips: 45,
  minOdds: 1.2,
  maxOdds: 1000,
  portfolioType: 2,
  order: 0,
  period: 3,
}

const page = (page: number, slugs: string[]) => ({
  page,
  fetchedAt: '2026-11-15T15:00:00Z',
  slugs,
})

const capture = (pages: ReturnType<typeof page>[]): CatalogCapture => ({
  meta: {
    source: 'tipstrr-listing',
    endpoint: 'https://tipstrr.com/api/portfolio',
    params: PARAMS,
    sport: 'football',
    executedAt: '2026-11-15T15:00:00Z',
  },
  pages,
})

const slugs = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`)

describe('validateCatalogCapture', () => {
  it('accepts a complete, terminated capture and counts unique slugs', () => {
    const c = capture([
      page(1, slugs('a', TIPSTRR_LISTING_PAGE_SIZE)),
      page(2, slugs('b', TIPSTRR_LISTING_PAGE_SIZE)),
      page(3, slugs('c', 4)),
      page(4, []),
    ])
    const v = validateCatalogCapture(c)
    expect(v.ok).toBe(true)
    expect(v.totalEntries).toBe(34)
    expect(v.uniqueSlugs).toBe(34)
    expect(v.missingPages).toEqual([])
    expect(v.terminated).toBe(true)
    expect(v.trailingEmptyPages).toBe(1)
  })

  it('flags duplicate slugs across pages (count is then NOT unique tipsters)', () => {
    const c = capture([
      page(1, ['x', 'y']),
      page(2, ['y', 'z']),
      page(3, []),
    ])
    const v = validateCatalogCapture(c)
    expect(v.ok).toBe(false)
    expect(v.duplicateSlugs).toEqual(['y'])
    expect(v.totalEntries).toBe(4)
    expect(v.uniqueSlugs).toBe(3)
  })

  it('flags unobserved pages inside the range (the 2026-11-15 probe mistake)', () => {
    // pages 1 and 3 fetched, page 2 never observed: no count claim allowed
    const c = capture([page(1, slugs('a', 15)), page(3, slugs('c', 15))])
    const v = validateCatalogCapture(c)
    expect(v.ok).toBe(false)
    expect(v.missingPages).toEqual([2])
    expect(v.terminated).toBe(false)
  })

  it('flags an empty page followed by a non-empty one (ordering anomaly)', () => {
    const c = capture([page(1, slugs('a', 15)), page(2, []), page(3, slugs('c', 2))])
    const v = validateCatalogCapture(c)
    expect(v.ok).toBe(false)
    expect(v.nonTrailingEmptyPages).toEqual([2])
  })

  it('flags pages larger than the observed page size', () => {
    const c = capture([page(1, slugs('a', 16))])
    const v = validateCatalogCapture(c)
    expect(v.ok).toBe(false)
    expect(v.issues.join(' ')).toContain('page size')
  })

  it('rejects an empty capture', () => {
    const v = validateCatalogCapture(capture([]))
    expect(v.ok).toBe(false)
  })
})

describe('buildCatalogIndex', () => {
  it('returns deduped slugs in page order with the explicit params echoed', () => {
    const c = capture([
      page(2, ['b1', 'a1']), // unsorted input on purpose
      page(1, ['a1', 'a2']),
      page(3, []),
    ])
    const idx = buildCatalogIndex(c)
    expect(idx.uniqueSlugs).toEqual(['a1', 'a2', 'b1'])
    expect(idx.params).toEqual(PARAMS)
    expect(idx.sport).toBe('football')
    expect(idx.validation.uniqueSlugs).toBe(3)
    expect(idx.validation.duplicateSlugs).toEqual(['a1'])
  })
})
