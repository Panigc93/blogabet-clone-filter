import { describe, it, expect } from 'vitest'
import { crawlProfiles, planFromSitemap, B2I_MIN_GAP_MS, type CrawlDeps } from '@/crawler/platforms/bet2invest/crawl'

// Synthetic: fake fetch only; no network.
const page = (slug: string, label = 'PRO') => `<html><head>
<link rel="canonical" href="https://bet2invest.com/tipsters/performance-stats/${slug}">
<meta property="og:title" content="${slug}, ${label} Tipster on Bet2Invest">
<meta property="og:description" content="Discover ${slug}, a ${label} Tipster."></head><body>
<div data-testid="stats-period"><div role="group" aria-label="Period"><button aria-pressed="true">All</button></div></div>
<p data-testid="stats-settledBetsNumber">0</p><p data-testid="stats-profit">0.00</p><p data-testid="stats-roi">0.00 %</p>
<div data-testid="stats-results"></div></body></html>`

function deps(responses: Record<string, any>) {
  let t = 1_000_000
  const sleeps: number[] = []
  const calls: number[] = []
  const d: CrawlDeps = {
    now: () => new Date(t),
    sleep: async (ms) => { sleeps.push(ms); t += ms },
    fetch: async (url) => {
      calls.push(t)
      const slug = decodeURIComponent(url.split('/').pop()!)
      const r = responses[slug]
      if (r instanceof Error) throw r
      return r ?? { status: 200, body: page(slug) }
    },
  }
  return { d, sleeps, calls }
}

describe('crawlProfiles', () => {
  it('espacia >= 10,1 s entre peticiones', async () => {
    const { d, calls } = deps({})
    await crawlProfiles(['a', 'b', 'c'], d, () => -1)
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(B2I_MIN_GAP_MS)
    expect(calls[2] - calls[1]).toBeGreaterThanOrEqual(B2I_MIN_GAP_MS)
  })
  it('para en 403/429 y no evalúa el resto', async () => {
    for (const status of [403, 429]) {
      const { d } = deps({ b: { status, body: '' } })
      const r = await crawlProfiles(['a', 'b', 'c'], d, () => -1)
      expect(r.stoppedEarly).toBe(true)
      expect(r.requests).toBe(2)
      expect(r.outcomes.at(-1)).toMatchObject({ slug: 'b', kind: 'stopped' })
    }
  })
  it('para ante reset/timeout de transporte (no reintenta)', async () => {
    const { d } = deps({ b: new Error('ECONNRESET') })
    const r = await crawlProfiles(['a', 'b', 'c'], d, () => -1)
    expect(r.stoppedEarly).toBe(true)
    expect(r.requests).toBe(2)
  })
  it('cuerpo truncado o desafío = parse-failed (falla cerrado), el run sigue', async () => {
    const { d } = deps({ b: { status: 200, body: '<html><head></head><body>cut' } })
    const r = await crawlProfiles(['a', 'b', 'c'], d, () => -1)
    expect(r.stoppedEarly).toBe(false)
    expect(r.outcomes.map((o) => o.kind)).toEqual(['ok', 'parse-failed', 'ok'])
  })
  it('slug canónico distinto al pedido = parse-failed', async () => {
    const { d } = deps({ a: { status: 200, body: page('otro') } })
    const r = await crawlProfiles(['a'], d, () => -1)
    expect(r.outcomes[0]).toMatchObject({ kind: 'parse-failed' })
  })
  it('cuenta sin etiqueta explícita = quarantine, Free explícito = ok', async () => {
    const { d } = deps({ a: { status: 200, body: page('a', 'Plain') }, b: { status: 200, body: page('b', 'Free') } })
    const r = await crawlProfiles(['a', 'b'], d, () => -1)
    expect(r.outcomes.map((o) => o.kind)).toEqual(['quarantine', 'ok'])
  })
})

describe('planFromSitemap', () => {
  it('toma los N primeros slugs del sitemap y valida el límite', () => {
    const xml = ['x', 'y', 'z'].map((s) => `<url><loc>https://bet2invest.com/tipsters/performance-stats/${s}</loc></url>`).join('')
    expect(planFromSitemap(xml, 2)).toEqual(['x', 'y'])
    expect(() => planFromSitemap(xml, 0)).toThrow()
  })
})
