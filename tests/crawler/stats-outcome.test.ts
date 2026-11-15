import { describe, it, expect } from 'vitest'
import { decideStatsOutcome, type StatsRunSummary } from '@/crawler/statsOutcome'

const base: StatsRunSummary = { selected: 2000, withStats: 2100, done: 2000, errors: 0, completed: true, clearRequested: false }

describe('decideStatsOutcome', () => {
  it('healthy run never clears by default and exits 0', () => {
    const r = decideStatsOutcome(base)
    expect(r.clear).toBe(false)
    expect(r.exitCode).toBe(0)
  })
  it('catalog totally old: 0 selected -> keeps data, exits 1, explains', () => {
    const r = decideStatsOutcome({ ...base, selected: 0, done: 0, completed: true, clearRequested: true })
    expect(r.clear).toBe(false)
    expect(r.exitCode).toBe(1)
    expect(r.messages.join(' ')).toMatch(/keep their stats/)
  })
  it('partial / reduced selection: no clear, reports unrefreshed rows', () => {
    const r = decideStatsOutcome({ ...base, selected: 10, done: 10, withStats: 2100 })
    expect(r.clear).toBe(false)
    expect(r.exitCode).toBe(0)
    expect(r.messages.join(' ')).toMatch(/2090 rows .* not refreshed/)
  })
  it('stats failures: partial errors exit 0 and block clear; all failed exits 1', () => {
    const some = decideStatsOutcome({ ...base, done: 1990, errors: 10, clearRequested: true })
    expect(some.clear).toBe(false)
    expect(some.exitCode).toBe(0)
    const all = decideStatsOutcome({ ...base, done: 0, errors: 2000 })
    expect(all.exitCode).toBe(1)
  })
  it('cancelled / incomplete run never clears', () => {
    const r = decideStatsOutcome({ ...base, completed: false, clearRequested: true })
    expect(r.clear).toBe(false)
  })
  it('explicit opt-in on a complete, clean run clears', () => {
    expect(decideStatsOutcome({ ...base, clearRequested: true }).clear).toBe(true)
  })
})
