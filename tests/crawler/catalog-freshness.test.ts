import { describe, it, expect } from 'vitest'
import { shouldClearInactiveStats } from '@/crawler/catalogFreshness'

describe('shouldClearInactiveStats', () => {
  it('clears when nearly all active tipsters were refreshed', () => {
    expect(shouldClearInactiveStats({ activeInWindow: 2000, refreshedRecently: 1900 }).clear).toBe(true)
  })
  it('does not clear after a partial catalog crawl (10 of 2000)', () => {
    const r = shouldClearInactiveStats({ activeInWindow: 2000, refreshedRecently: 10 })
    expect(r.clear).toBe(false)
    expect(r.reason).toMatch(/stale/)
  })
  it('does not clear with an empty window', () => {
    expect(shouldClearInactiveStats({ activeInWindow: 0, refreshedRecently: 0 }).clear).toBe(false)
  })
  it('does not clear on invalid counts', () => {
    expect(shouldClearInactiveStats({ activeInWindow: 5, refreshedRecently: 9 }).clear).toBe(false)
    expect(shouldClearInactiveStats({ activeInWindow: -1, refreshedRecently: 0 }).clear).toBe(false)
  })
  it('boundary 80% clears, just below does not', () => {
    expect(shouldClearInactiveStats({ activeInWindow: 100, refreshedRecently: 80 }).clear).toBe(true)
    expect(shouldClearInactiveStats({ activeInWindow: 100, refreshedRecently: 79 }).clear).toBe(false)
  })
})
