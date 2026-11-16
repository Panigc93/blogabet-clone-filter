import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runCrawl } from '@/crawler/platforms/bet2invest/run'
import { readPause, loadState, resume, type RefreshPolicy } from '@/crawler/platforms/bet2invest/capture-store'
import type { CrawlDeps } from '@/crawler/platforms/bet2invest/crawl'

// Synthetic only: fake fetch, temp dir, no network.
const POLICY: RefreshPolicy = { refreshAfterMs: 1000, backoffBaseMs: 1000, backoffMaxMs: 4000, batchSize: 10 }
const page = (slug: string) => `<html><head><link rel="canonical" href="https://bet2invest.com/tipsters/performance-stats/${slug}">
<meta property="og:title" content="${slug}, PRO Tipster on Bet2Invest"><meta property="og:description" content="a PRO Tipster"></head><body>
<div data-testid="stats-period"><div role="group" aria-label="Period"><button aria-pressed="true">All</button></div></div>
<p data-testid="stats-settledBetsNumber">0</p><p data-testid="stats-profit">0.00</p><p data-testid="stats-roi">0.00 %</p><div data-testid="stats-results"></div></body></html>`

function mk(responses: Record<string, any>, startMs = 1_000_000) {
  let t = startMs
  const fetched: string[] = []
  const deps: CrawlDeps = {
    now: () => new Date(t),
    sleep: async (ms) => { t += ms },
    fetch: async (url) => {
      const slug = decodeURIComponent(url.split('/').pop()!)
      fetched.push(slug)
      const r = responses[slug]
      if (r instanceof Error) throw r
      return r ?? { status: 200, body: page(slug) }
    },
  }
  return { deps, fetched, advance: (ms: number) => { t += ms } }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'b2i-run-'))

describe('runCrawl', () => {
  it('captura, guarda, y tras 429 pausa globalmente sin contar el perfil como fallo ni como captura', async () => {
    const dir = tmp()
    const responses: Record<string, any> = { b: { status: 429, body: '' } }
    const { deps, fetched, advance } = mk(responses)
    const r = await runCrawl({ dir, slugs: ['a', 'b', 'c'], policy: POLICY, deps, mapId: () => -1 })
    expect(r.status).toBe('stopped')
    expect(fetched).toEqual(['a', 'b']) // c nunca se pide
    expect(loadState(dir, 'a').lastValid).not.toBeNull()
    expect(loadState(dir, 'b')).toMatchObject({ lastValid: null, lastAttempt: null, consecutiveFailures: 0 })
    expect(loadState(dir, 'c')).toMatchObject({ lastValid: null, lastAttempt: null })
    expect(readPause(dir)?.triggerSlug).toBe('b')
    // mucho tiempo despues: sigue en pausa, 0 peticiones
    advance(10 * 24 * 3600_000)
    const again = await runCrawl({ dir, slugs: ['a', 'b', 'c'], policy: POLICY, deps, mapId: () => -1 })
    expect(again).toMatchObject({ status: 'paused', requests: 0 })
    expect(fetched).toEqual(['a', 'b'])
    // decision explicita => reanuda
    resume(dir, { decidedBy: 'Juan', note: 'senal externa' }, deps.now())
    delete responses.b
    const resumed = await runCrawl({ dir, slugs: ['a', 'b', 'c'], policy: POLICY, deps, mapId: () => -1 })
    expect(resumed.status).toBe('completed')
    fs.rmSync(dir, { recursive: true })
  })
  it('reset de transporte y desafio tambien pausan', async () => {
    for (const bad of [new Error('ECONNRESET'), { status: 200, body: '<html><script>window.__CF$cv$params={}</script>challenge-platform</html>' }]) {
      const dir = tmp()
      const { deps } = mk({ a: bad })
      const r = await runCrawl({ dir, slugs: ['a', 'b'], policy: POLICY, deps, mapId: () => -1 })
      expect(r.status).toBe('stopped')
      expect(readPause(dir)).not.toBeNull()
      fs.rmSync(dir, { recursive: true })
    }
  })
  it('5xx detiene el lote como fallo de servicio (causa distinguible), sin reintento y sin tocar la captura valida', async () => {
    const dir = tmp()
    const first = mk({})
    await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: first.deps, mapId: () => -1 })
    const valid = loadState(dir, 'a').lastValid
    const m = mk({ b: { status: 503, body: '' } }, 5_000_000) // b (nunca capturado) va primero
    const r = await runCrawl({ dir, slugs: ['a', 'b', 'c'], policy: POLICY, deps: m.deps, mapId: () => -1 })
    expect(r.status).toBe('stopped')
    expect(m.fetched).toEqual(['b']) // un solo intento, nada despues (ni c ni a)
    const pause = readPause(dir)!
    expect(pause.cause).toBe('service-error')
    expect(pause.reason).toContain('not a confirmed block')
    expect(loadState(dir, 'a')).toMatchObject({ lastValid: valid, consecutiveFailures: 0 })
    fs.rmSync(dir, { recursive: true })
  })
  it('429 queda como access-signal', async () => {
    const dir = tmp()
    await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: mk({ a: { status: 429, body: '' } }).deps, mapId: () => -1 })
    expect(readPause(dir)?.cause).toBe('access-signal')
    fs.rmSync(dir, { recursive: true })
  })
  it('un parse-failed normal no pausa, no sustituye la captura valida y suma fallo', async () => {
    const dir = tmp()
    const first = mk({})
    await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: first.deps, mapId: () => -1 })
    const valid = loadState(dir, 'a').lastValid
    const second = mk({ a: { status: 200, body: '<html>cut' } }, 5_000_000)
    const r = await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: second.deps, mapId: () => -1 })
    expect(r.status).toBe('completed')
    expect(readPause(dir)).toBeNull()
    const s = loadState(dir, 'a')
    expect(s.lastValid).toEqual(valid)
    expect(s.consecutiveFailures).toBe(1)
    fs.rmSync(dir, { recursive: true })
  })
  it('nada vencido = 0 peticiones', async () => {
    const dir = tmp()
    const m = mk({})
    await runCrawl({ dir, slugs: ['a'], policy: { ...POLICY, refreshAfterMs: 10 ** 12 }, deps: m.deps, mapId: () => -1 })
    const r = await runCrawl({ dir, slugs: ['a'], policy: { ...POLICY, refreshAfterMs: 10 ** 12 }, deps: m.deps, mapId: () => -1 })
    expect(r).toMatchObject({ status: 'nothing-due', requests: 0 })
    fs.rmSync(dir, { recursive: true })
  })
})
