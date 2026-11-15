import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { runListingDryRun, DRY_RUN_HARD_MAX_PAGES, DRY_RUN_MIN_DELAY_MS, type PageFetcher } from '@/crawler/dryRun'

function block(id: number, followers: number) {
  return `<div class="tipster-block"><div class="avatar"><a href="https://t${id}.blogabet.com" title="T${id}"><img class="img-circle" src="x.jpg"></a></div>
  <h3 class="name-t"><strong>T${id}</strong></h3><span onclick="tipsters.showFollowBox('${id}')"></span>
  <div class="pins"><span class="number">2020</span><span class="number">150</span><span class="number">+10</span><span class="number">12%</span><span class="number">0%</span><span class="number">${followers}</span></div></div>`
}
const page = (from: number) => ({ status: 200, html: Array.from({ length: 10 }, (_, i) => block(from + i, 1000 - (from + i))).join('\n') })
const okFetcher = (): PageFetcher => vi.fn(async (url: string) => page(Number(new URL(url).searchParams.get('f[start]'))))
const base = { lastActive: 1, sleep: vi.fn(async () => {}), delayMs: 1500 }

describe('listing dry run', () => {
  it('never exceeds the hard limit of 3 pages, even if asked for more', async () => {
    const f = okFetcher()
    const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 100 })
    expect(DRY_RUN_HARD_MAX_PAGES).toBe(3)
    expect(f).toHaveBeenCalledTimes(3)
    expect(r.stopReason).toBe('completed')
    expect(r.parsed).toBe(30)
    expect(r.uniqueIds).toBe(30)
    expect(r.duplicateIds).toBe(0)
    expect(r.followersNonIncreasing).toBe(false)
  })
  it('requests consecutive starts 0,10,20 with followers order and lastActive=1', async () => {
    const f = okFetcher()
    await runListingDryRun({ ...base, fetchPage: f, maxPages: 3 })
    const urls = (f as any).mock.calls.map((c: string[]) => new URL(c[0]).searchParams)
    expect(urls.map((u: URLSearchParams) => u.get('f[start]'))).toEqual(['0', '10', '20'])
    expect(urls.every((u: URLSearchParams) => u.get('f[order]') === 'followers' && u.get('f[lastActive]') === '1')).toBe(true)
  })
  it('stops at the first HTTP error without retrying', async () => {
    for (const status of [500, 403, 429]) {
      const f = vi.fn(async () => ({ status, html: '' })) as unknown as PageFetcher
      const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3 })
      expect(f).toHaveBeenCalledTimes(1)
      expect(r.stopReason).toBe('http_error')
      expect(r.statuses).toEqual([status])
    }
  })
  it('stops on a later error without retry and keeps earlier results', async () => {
    let n = 0
    const f = vi.fn(async (url: string) => (++n === 2 ? { status: 500, html: '' } : page(Number(new URL(url).searchParams.get('f[start]'))))) as unknown as PageFetcher
    const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3 })
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.pagesOk).toBe(1)
    expect(r.stopReason).toBe('http_error')
  })
  it('stops on a challenge or empty 200 page', async () => {
    const f = vi.fn(async () => ({ status: 200, html: '<html>verify you are human</html>' })) as unknown as PageFetcher
    const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3 })
    expect(f).toHaveBeenCalledTimes(1)
    expect(r.stopReason).toBe('challenge_or_empty')
  })
  it('stops on a network error without retry', async () => {
    const f = vi.fn(async () => { throw new Error('boom') }) as unknown as PageFetcher
    const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3 })
    expect(f).toHaveBeenCalledTimes(1)
    expect(r.stopReason).toBe('network_error')
  })
  it('detects duplicates across pages and ordering violations', async () => {
    const f = vi.fn(async () => page(0)) as unknown as PageFetcher
    const r = await runListingDryRun({ ...base, fetchPage: f, maxPages: 2 })
    expect(r.duplicateIds).toBe(10)
    expect(r.uniqueIds).toBe(10)
    expect(r.followersNonIncreasing).toBe(true)
  })
  it('requires an explicit delay of at least 1000 ms and waits it between pages', async () => {
    const f = okFetcher()
    const bad = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3, delayMs: DRY_RUN_MIN_DELAY_MS - 1 })
    expect(bad.stopReason).toBe('invalid_config')
    expect(f).not.toHaveBeenCalled()
    const nan = await runListingDryRun({ ...base, fetchPage: f, maxPages: 3, delayMs: NaN })
    expect(nan.stopReason).toBe('invalid_config')
    const sleep = vi.fn(async () => {})
    await runListingDryRun({ lastActive: 1, fetchPage: f, sleep, maxPages: 3, delayMs: 2500 })
    expect(sleep.mock.calls).toEqual([[2500], [2500]])
  })
})

describe('dry run isolation', () => {
  it('does not import or reference the database or crawl.ts', () => {
    for (const file of ['crawler/dryRun.ts', 'crawler/dry-run.ts', 'crawler/listing.ts']) {
      const src = readFileSync(file, 'utf8')
      expect(src).not.toMatch(/neon|drizzle|DATABASE_URL|playwright/i)
      // only type-only imports from the db schema are allowed (erased at runtime)
      expect(src).not.toMatch(/^import (?!type)[^\n]*from '(\.\.\/db[^']*|\.\/crawl)'/m)
    }
  })
  it('the CLI has no default delay', () => {
    const src = readFileSync('crawler/dry-run.ts', 'utf8')
    expect(src).toMatch(/DRY_RUN_DELAY_MS is required/)
    expect(src).not.toMatch(/DRY_RUN_DELAY_MS \?\?/)
  })
})
