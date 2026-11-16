import { describe, expect, it, vi } from 'vitest'
import { runStatsLoop } from '@/crawler/statsLoop'
import { decideStatsOutcome } from '@/crawler/statsOutcome'
import { BlockedError } from '@/crawler/blockPolicy'

const items = Array.from({ length: 8 }, (_, id) => ({ id, slug: String(id) }))
const sleep = async () => {}

describe('invocation counters vs legacy checkpoint totals', () => {
  it('separates parsed writes, empty pages and errors from restored checkpoint', async () => {
    const write = vi.fn(async () => {})
    const r = await runStatsLoop(items.slice(0, 5), { offset: 2, done: 8, errors: 4 }, {
      fetchHtml: async s => { if (s === '4') throw Error('offline sample'); return s === '3' ? 'empty' : 'data' },
      parse: h => h === 'data' ? { ok: true } : null, write, sleep,
    })
    expect(r.counters).toEqual({ processed: 3, refreshed: 1, noData: 1, requestErrors: 1, checkpointOffset: 2, checkpointDone: 8, checkpointErrors: 4 })
    expect(r.done).toBe(10) // legacy still includes successful/empty processing from checkpoint
    expect(r.errors).toBe(5)
    expect(write).toHaveBeenCalledTimes(1)
    const messages = decideStatsOutcome({ selected: 5, withStats: 4000, done: r.done, refreshed: r.refreshed, errors: r.errors, completed: true, clearRequested: false, counters: r.counters }).messages.join('\n')
    expect(messages).toContain('processed=3, refreshed=1, noData=1, requestErrors=1')
    expect(messages).toContain('offset=2, done=8, errors=4')
    expect(messages).not.toContain('3990')
    expect(messages).not.toContain('rows with stats were not refreshed')
  })
  it('reports no-data circuit breaker without counting unknown remaining items', async () => {
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, {
      fetchHtml: async () => 'empty', parse: () => null, write: async () => {}, sleep, maxConsecutiveUnrefreshed: 2,
    })
    expect(r.counters.processed).toBe(2)
    expect(r.counters.noData).toBe(2)
    expect(r.counters.refreshed).toBe(0)
    expect(r.next).toBe(2)
    expect(r.blocked).toBeTruthy()
  })
  it('terminal denied response is not completed/no-data; existing stop remains', async () => {
    const write = vi.fn(async () => {})
    const fetchHtml = vi.fn(async () => { throw new BlockedError('offline denied sample') })
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, { fetchHtml, parse: () => null, write, sleep })
    expect(r.counters.processed).toBe(0)
    expect(r.counters.noData).toBe(0)
    expect(r.next).toBe(0)
    expect(fetchHtml).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })
  it('all parsed writes counted exactly once, no cumulative subtraction', async () => {
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, { fetchHtml: async () => 'data', parse: () => 1, write: async () => {}, sleep })
    expect(r.counters.processed).toBe(8)
    expect(r.counters.refreshed).toBe(8)
    expect(r.counters.noData).toBe(0)
    expect(r.counters.requestErrors).toBe(0)
  })
})
