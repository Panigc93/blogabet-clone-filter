import { describe, it, expect } from 'vitest'
import { CoverageTracker, formatCoverage } from '../../crawler/coverage'

const rows = (...f: number[]) => f.map((followers, i) => ({ id: followers * 10 + i, followers }))

describe('CoverageTracker', () => {
  it('clean crawl ending on an empty page reaches the end, without claiming proof', () => {
    const t = new CoverageTracker()
    t.addPage([{ id: 1, followers: 9 }, { id: 2, followers: 8 }], 1)
    t.addPage([{ id: 3, followers: 7 }], 0)
    t.finish('empty_page')
    const s = t.summary()
    expect(s).toMatchObject({ pages: 2, rows: 3, uniqueIds: 3, duplicateIds: 0, orderViolations: 0, newIds: 1, reachedEnd: true, endLooksValid: null })
    expect(s.note).toMatch(/not proof/)
  })
  it('duplicates mean the listing shifted: complete but flagged', () => {
    const t = new CoverageTracker()
    t.addPage([{ id: 1, followers: 9 }, { id: 2, followers: 8 }])
    t.addPage([{ id: 2, followers: 8 }, { id: 3, followers: 7 }])
    t.finish('empty_page')
    const s = t.summary()
    expect(s.duplicateIds).toBe(1)
    expect(s.note).toMatch(/shifted/)
    expect(s.newIds).toBeNull()
  })
  it('order violations are counted across pages', () => {
    const t = new CoverageTracker()
    t.addPage([{ id: 1, followers: 5 }])
    t.addPage([{ id: 2, followers: 6 }])
    t.finish('empty_page')
    expect(t.summary().orderViolations).toBe(1)
  })
  it('an error is never complete', () => {
    const t = new CoverageTracker()
    t.addPage(rows(3, 2))
    t.finish('error')
    const s = t.summary()
    expect(s.reachedEnd).toBe(false)
    expect(s.note).toMatch(/partial/)
  })
  it('no finish is never complete', () => {
    const t = new CoverageTracker()
    t.addPage(rows(3))
    expect(t.summary().reachedEnd).toBe(false)
  })
  it('empty first page is not complete', () => {
    const t = new CoverageTracker()
    t.finish('empty_page')
    expect(t.summary().reachedEnd).toBe(false)
  })
  it('an empty end below the expected row count is not a valid end', () => {
    const t = new CoverageTracker(3000)
    t.addPage(rows(3, 2))
    t.finish('empty_page')
    const s = t.summary()
    expect(s.endLooksValid).toBe(false)
    expect(s.note).toMatch(/failure/)
  })
  it('an empty end above the expected row count is verified', () => {
    const t = new CoverageTracker(2)
    t.addPage(rows(3, 2))
    t.finish('empty_page')
    expect(t.summary().endLooksValid).toBe(true)
  })
  it('formats a markdown summary', () => {
    const t = new CoverageTracker()
    t.addPage(rows(3, 2), 2)
    t.finish('empty_page')
    expect(formatCoverage(t.summary())).toMatch(/Catalog crawl coverage[\s\S]*New ids inserted: 2/)
  })
})
