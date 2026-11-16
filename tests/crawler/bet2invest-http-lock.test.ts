import { describe, it, expect, afterEach } from 'vitest'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { AddressInfo } from 'net'
import { createHttpFetcher, PRODUCTION_ORIGIN } from '@/crawler/platforms/bet2invest/http-fetch'
import { runCrawl } from '@/crawler/platforms/bet2invest/run'
import { forceReleaseLock, readLock, acquireLock, type RefreshPolicy } from '@/crawler/platforms/bet2invest/capture-store'
import type { CrawlDeps } from '@/crawler/platforms/bet2invest/crawl'

// LOOPBACK server only. No request in this file leaves the machine.
type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void
let server: http.Server | null = null
const seen: { url: string; headers: http.IncomingHttpHeaders }[] = []
async function start(h: Handler): Promise<string> {
  seen.length = 0
  server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? '', headers: req.headers })
    h(req, res)
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()))
  server = null
})
const cfg = (origin: string, over = {}) => ({ allowedOrigin: origin, timeoutMs: 1000, maxBytes: 1000, userAgent: 'test-agent/1', ...over })
const P = '/tipsters/performance-stats/'

describe('createHttpFetcher', () => {
  it('pide solo el destino permitido, con cabeceras fijas, y registra destino efectivo', async () => {
    const origin = await start((_q, res) => { res.writeHead(200, { 'set-cookie': 'a=b' }); res.end('hola') })
    const f = createHttpFetcher(cfg(origin))
    const r = await f.fetch(`${origin}${P}abc`)
    expect(r).toEqual({ status: 200, body: 'hola' })
    expect(seen[0].headers['user-agent']).toBe('test-agent/1')
    expect(seen[0].headers['accept-encoding']).toBe('identity')
    expect(seen[0].headers.cookie).toBeUndefined()
    expect(f.log[0]).toMatchObject({ url: `${origin}${P}abc`, remoteAddress: '127.0.0.1', status: 200, bytes: 4, error: null })
    expect(Object.isFrozen(f.effective)).toBe(true)
    expect(f.effective.maxBytes).toBe(1000)
  })
  it('rechaza destinos fuera del permitido ANTES de conectar', async () => {
    const origin = await start((_q, res) => res.end('x'))
    const f = createHttpFetcher(cfg(origin))
    for (const bad of [
      'http://127.0.0.1:1/tipsters/performance-stats/a', // otro puerto
      `${origin}/other/path`,
      `${origin}${P}a#frag`,
      `http://user:pw@${origin.slice(7)}${P}a`,
      'https://bet2invest.com/tipsters/performance-stats/a', // produccion: NO es el origen configurado
      'not a url',
    ]) await expect(f.fetch(bad), bad).rejects.toThrow()
    expect(seen).toHaveLength(0)
  })
  it('no sigue redirecciones: devuelve el 3xx y no pide el destino', async () => {
    const origin = await start((q, res) => {
      if (q.url!.endsWith('/a')) { res.writeHead(302, { location: `${P}b` }); res.end() } else res.end('b')
    })
    const f = createHttpFetcher(cfg(origin))
    const r = await f.fetch(`${origin}${P}a`)
    expect(r.status).toBe(302)
    expect(seen.map((s) => s.url)).toEqual([`${P}a`])
  })
  it('corta por tamaño y por timeout, y rechaza Content-Encoding', async () => {
    const big = await start((_q, res) => res.end('x'.repeat(5000)))
    await expect(createHttpFetcher(cfg(big)).fetch(`${big}${P}a`)).rejects.toThrow(/maxBytes/)
    await new Promise<void>((r) => server!.close(() => r())); server = null
    const slow = await start(() => { /* nunca responde */ })
    const f = createHttpFetcher(cfg(slow, { timeoutMs: 150 }))
    await expect(f.fetch(`${slow}${P}a`)).rejects.toThrow(/timeout/)
    expect(f.log[0].error).toMatch(/timeout/)
    await new Promise<void>((r) => server!.close(() => r())); server = null
    const gz = await start((_q, res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(zlib.gzipSync('x')) })
    await expect(createHttpFetcher(cfg(gz)).fetch(`${gz}${P}a`)).rejects.toThrow(/Content-Encoding/)
  })
  it('valida la configuracion: origen https (http solo loopback), limites obligatorios', () => {
    expect(() => createHttpFetcher(cfg('http://bet2invest.com'))).toThrow()
    expect(() => createHttpFetcher(cfg('https://bet2invest.com/x'))).toThrow()
    expect(() => createHttpFetcher(cfg(PRODUCTION_ORIGIN, { timeoutMs: 0 }))).toThrow()
    expect(() => createHttpFetcher(cfg(PRODUCTION_ORIGIN, { maxBytes: 1.5 }))).toThrow()
    expect(() => createHttpFetcher(cfg(PRODUCTION_ORIGIN, { userAgent: ' ' }))).toThrow()
    expect(createHttpFetcher(cfg(PRODUCTION_ORIGIN)).effective.allowedOrigin).toBe(PRODUCTION_ORIGIN) // solo construye, no conecta
  })
})

const POLICY: RefreshPolicy = { refreshAfterMs: 1000, backoffBaseMs: 1000, backoffMaxMs: 4000, batchSize: 10 }
const page = (slug: string) => `<html><head><link rel="canonical" href="https://bet2invest.com/tipsters/performance-stats/${slug}">
<meta property="og:title" content="${slug}, PRO Tipster on Bet2Invest"><meta property="og:description" content="a PRO Tipster"></head><body>
<div data-testid="stats-period"><div role="group" aria-label="Period"><button aria-pressed="true">All</button></div></div>
<p data-testid="stats-settledBetsNumber">0</p><p data-testid="stats-profit">0.00</p><p data-testid="stats-roi">0.00 %</p><div data-testid="stats-results"></div></body></html>`
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'b2i-lock-'))

describe('exclusion de concurrencia del runner', () => {
  it('dos runs sobre el mismo directorio: uno corre, el otro recibe locked con 0 peticiones; el lock se libera', async () => {
    const dir = tmp()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let t = 1_000_000
    const fetched: string[] = []
    const mk = (): CrawlDeps => ({
      origin: PRODUCTION_ORIGIN,
      now: () => new Date(t),
      sleep: async (ms) => { t += ms },
      fetch: async (url) => { fetched.push(url); await gate; return { status: 200, body: page(decodeURIComponent(url.split('/').pop()!)) } },
    })
    const first = runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: mk(), mapId: () => -1 })
    await new Promise((r) => setTimeout(r, 20))
    expect(readLock(dir)).not.toBeNull()
    const second = await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: mk(), mapId: () => -1 })
    expect(second).toMatchObject({ status: 'locked', requests: 0 })
    expect(fetched).toHaveLength(1)
    release()
    expect((await first).status).toBe('completed')
    expect(readLock(dir)).toBeNull()
    fs.rmSync(dir, { recursive: true })
  })
  it('el lock se libera aunque el run lance; un lock huerfano no caduca solo y exige decision explicita', async () => {
    const dir = tmp()
    const boom: CrawlDeps = { origin: PRODUCTION_ORIGIN, now: () => new Date(), sleep: async () => {}, fetch: async () => { throw new Error('x') } }
    await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: boom, mapId: () => -1 })
    expect(readLock(dir)).toBeNull()
    expect(acquireLock(dir, { pid: 1, startedAt: 'old', origin: PRODUCTION_ORIGIN }).acquired).toBe(true) // simula caida
    const r = await runCrawl({ dir, slugs: ['a'], policy: POLICY, deps: boom, mapId: () => -1 })
    expect(r).toMatchObject({ status: 'locked', held: { pid: 1 } })
    expect(() => forceReleaseLock(dir, { decidedBy: '', note: 'x' })).toThrow()
    expect(readLock(dir)).not.toBeNull()
    forceReleaseLock(dir, { decidedBy: 'Juan', note: 'proceso caido confirmado' })
    expect(readLock(dir)).toBeNull()
    fs.rmSync(dir, { recursive: true })
  })
})
