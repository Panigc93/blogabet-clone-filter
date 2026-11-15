import { describe, it, expect, vi } from 'vitest'
import { HttpError, BlockedError, retryWithPolicy, looksLikeChallenge } from '@/crawler/blockPolicy'
import { runStatsLoop } from '@/crawler/statsLoop'
import { decideStatsOutcome } from '@/crawler/statsOutcome'

const noSleep = async () => {}
vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('retryWithPolicy', () => {
  it.each([401, 403, 429])('HTTP %i: one attempt, no retry, raises BlockedError', async (status) => {
    const fn = vi.fn().mockRejectedValue(new HttpError(status, 'x'))
    await expect(retryWithPolicy(fn, 't', 5, noSleep)).rejects.toBeInstanceOf(BlockedError)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('transient 500: up to 5 total attempts, waits 2/4/6/8 s, then fails (not a block)', async () => {
    const waits: number[] = []
    const fn = vi.fn().mockRejectedValue(new HttpError(500, 'x'))
    await expect(retryWithPolicy(fn, 't', 5, async ms => { waits.push(ms) })).rejects.toBeInstanceOf(HttpError)
    expect(fn).toHaveBeenCalledTimes(5)
    expect(waits).toEqual([2000, 4000, 6000, 8000])
  })
  it('transient 500 that recovers returns the value', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(500, 'x')).mockResolvedValue('ok')
    await expect(retryWithPolicy(fn, 't', 5, noSleep)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('challenge detection', () => {
  it('matches explicit challenge markers only', () => {
    expect(looksLikeChallenge('<title>Just a moment...</title>')).toBe(true)
    expect(looksLikeChallenge('<div id="cf-chl-widget"></div>')).toBe(true)
    expect(looksLikeChallenge('<html><body>No archive yet</body></html>')).toBe(false)
    expect(looksLikeChallenge('')).toBe(false)
  })
})

describe('runStatsLoop', () => {
  const items = [1, 2, 3, 4].map(n => ({ id: n, slug: `t${n}` }))
  const mk = (fetchHtml: (s: string) => Promise<string>, parse: (h: string) => string | null = h => h) => {
    const write = vi.fn().mockResolvedValue(undefined)
    return { write, deps: { fetchHtml, parse, write, sleep: noSleep } }
  }
  it('block on tipster 2: no fetch of 3 and 4, no write for 2, previous kept, run marked blocked', async () => {
    const fetchHtml = vi.fn(async (s: string) => { if (s === 't2') throw new BlockedError('HTTP 429'); return 'data' })
    const { write, deps } = mk(fetchHtml)
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, deps)
    expect(fetchHtml.mock.calls.map(c => c[0])).toEqual(['t1', 't2'])
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(1, 'data')
    expect(r.blocked).toMatch(/429/)
    expect(r.errors).toBe(0)
    expect(r.refreshed).toBe(1)
    expect(r.next).toBe(1)
  })
  it('200 challenge page without data stops the whole run', async () => {
    const fetchHtml = vi.fn(async (s: string) => (s === 't1' ? '<title>Just a moment...</title>' : 'data'))
    const { write, deps } = mk(fetchHtml, h => (h === 'data' ? h : null))
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, deps)
    expect(fetchHtml).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
    expect(r.blocked).toMatch(/challenge/)
  })
  it('legitimate 200 without data does not stop: nothing written for it, not refreshed, others continue', async () => {
    const fetchHtml = vi.fn(async (s: string) => (s === 't2' ? '<html>no archive</html>' : 'data'))
    const { write, deps } = mk(fetchHtml, h => (h === 'data' ? h : null))
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, deps)
    expect(r.blocked).toBeUndefined()
    expect(write).toHaveBeenCalledTimes(3)
    expect(write).not.toHaveBeenCalledWith(2, expect.anything())
    expect(r.refreshed).toBe(3)
    expect(r.done).toBe(4)
  })
  it('ordinary failure (after retries) counts as error, writes nothing, run continues', async () => {
    const fetchHtml = vi.fn(async (s: string) => { if (s === 't2') throw new HttpError(500, 'x'); return 'data' })
    const { write, deps } = mk(fetchHtml)
    const r = await runStatsLoop(items, { offset: 0, done: 0, errors: 0 }, deps)
    expect(r.errors).toBe(1)
    expect(write).toHaveBeenCalledTimes(3)
    expect(r.blocked).toBeUndefined()
  })
})

describe('runStatsLoop circuit breaker', () => {
  const many = Array.from({ length: 50 }, (_, n) => ({ id: n + 1, slug: `t${n + 1}` }))
  it('aborts after N consecutive failures: no more fetches, nothing written, previous kept', async () => {
    const fetchHtml = vi.fn(async () => { throw new HttpError(500, 'x') })
    const write = vi.fn()
    const r = await runStatsLoop(many, { offset: 0, done: 0, errors: 0 },
      { fetchHtml, parse: (h: string) => h, write, sleep: noSleep, maxConsecutiveErrors: 5 })
    expect(fetchHtml).toHaveBeenCalledTimes(5)
    expect(write).not.toHaveBeenCalled()
    expect(r.blocked).toMatch(/5 consecutive/)
    expect(r.next).toBe(5)
  })
  it('isolated errors do not trip it: a success resets the streak', async () => {
    const fetchHtml = vi.fn(async (s: string) => { if (Number(s.slice(1)) % 3 === 0) throw new HttpError(500, 'x'); return 'data' })
    const r = await runStatsLoop(many, { offset: 0, done: 0, errors: 0 },
      { fetchHtml, parse: (h: string) => h, write: vi.fn(), sleep: noSleep, maxConsecutiveErrors: 3 })
    expect(r.blocked).toBeUndefined()
    expect(r.next).toBe(50)
  })
  it('aborts when the time budget is exceeded, keeping the resume point', async () => {
    let t = 0
    const fetchHtml = vi.fn(async () => 'data')
    const write = vi.fn()
    const r = await runStatsLoop(many, { offset: 0, done: 0, errors: 0 },
      { fetchHtml, parse: (h: string) => h, write, sleep: async () => { t += 1000 }, now: () => t, maxRuntimeMs: 10_000 })
    expect(r.blocked).toMatch(/time budget/)
    expect(fetchHtml.mock.calls.length).toBeLessThan(50)
    expect(write).toHaveBeenCalledTimes(fetchHtml.mock.calls.length)
    expect(r.next).toBe(fetchHtml.mock.calls.length)
  })
})

describe('outcome when blocked', () => {
  it('exits 1, never clears even with opt-in, says previous stats are kept', () => {
    const r = decideStatsOutcome({ selected: 3000, withStats: 3000, done: 10, refreshed: 10, errors: 0, completed: false, blocked: 'HTTP 429', clearRequested: true })
    expect(r.exitCode).toBe(1)
    expect(r.clear).toBe(false)
    expect(r.messages.join(' ')).toMatch(/previous stats kept/)
  })
})
