import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  applyOutcome, emptyState, selectDue, backoffMs, recordOutcome, loadState, readPause, resume,
  type RefreshPolicy,
  type SlugState,
} from '@/crawler/platforms/bet2invest/capture-store'
import type { CrawlOutcome } from '@/crawler/platforms/bet2invest/crawl'

const H = 3600_000
// Test-only values; NOT a proposed or authorized policy.
const DEFAULT_POLICY: RefreshPolicy = { refreshAfterMs: 7 * 24 * H, backoffBaseMs: H, backoffMaxMs: 24 * H, batchSize: 30 }
const T0 = new Date('2026-11-16T10:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const ok = (slug: string, cap: Date, picks = 100): CrawlOutcome => ({
  slug, kind: 'ok', capturedAt: cap,
  mapping: { ok: true, insert: { id: -1, platform: 'bet2invest', slug, name: slug, picks, capturedAt: cap } as any },
})
const bad = (slug: string, kind: 'quarantine' | 'parse-failed'): CrawlOutcome => ({ slug, kind, capturedAt: T0, reason: 'x' })
const stopped = (slug: string): CrawlOutcome => ({ slug, kind: 'stopped', reason: 'HTTP 429' })

describe('applyOutcome', () => {
  it('ok guarda captura valida con capturedAt real y limpia fallos', () => {
    const s = applyOutcome(emptyState('a'), ok('a', at(5000)), at(6000))
    expect(s.lastValid?.capturedAt).toBe(at(5000).toISOString())
    expect(s.lastAttempt?.attemptedAt).toBe(at(6000).toISOString()) // fecha de intento distinta
    expect(s.consecutiveFailures).toBe(0)
  })
  it('una captura invalida NO sustituye a la valida; solo cambia el intento', () => {
    const v = applyOutcome(emptyState('a'), ok('a', at(0), 100), at(0))
    for (const o of [bad('a', 'quarantine'), bad('a', 'parse-failed')]) {
      const s = applyOutcome(v, o, at(H))
      expect(s.lastValid).toEqual(v.lastValid)
      expect(s.lastAttempt?.kind).toBe(o.kind)
      expect(s.consecutiveFailures).toBe(1)
    }
  })
  it('stopped no cuenta como fallo propio ni toca intento/captura del perfil', () => {
    const v = applyOutcome(emptyState('a'), ok('a', at(0), 100), at(0))
    expect(applyOutcome(v, stopped('a'), at(H))).toEqual(v)
    const fresh = applyOutcome(emptyState('b'), stopped('b'), at(H))
    expect(fresh).toEqual(emptyState('b'))
  })
  it('una captura valida mas antigua no sustituye a una mas nueva', () => {
    const v = applyOutcome(emptyState('a'), ok('a', at(10 * H), 200), at(10 * H))
    const s = applyOutcome(v, ok('a', at(1 * H), 50), at(11 * H))
    expect(s.lastValid?.insert.picks).toBe(200)
  })
})

describe('selectDue', () => {
  const states = (m: Record<string, SlugState>) => new Map(Object.entries(m))
  it('nunca capturados primero, luego la captura mas antigua; no vencidos fuera', () => {
    const now = at(30 * 24 * H)
    const old = applyOutcome(emptyState('old'), ok('old', at(0)), at(0))
    const mid = applyOutcome(emptyState('mid'), ok('mid', at(10 * 24 * H)), at(10 * 24 * H))
    const fresh = applyOutcome(emptyState('fresh'), ok('fresh', at(29 * 24 * H)), at(29 * 24 * H))
    expect(selectDue(['fresh', 'mid', 'old', 'new'], states({ old, mid, fresh }), now, DEFAULT_POLICY)).toEqual(['new', 'old', 'mid'])
  })
  it('respeta backoff desde el ultimo INTENTO y el limite de lote', () => {
    const now = at(30 * 24 * H)
    let f = emptyState('f')
    f = applyOutcome(f, bad('f', 'parse-failed'), new Date(now.getTime() - 30 * 60_000)) // 1 fallo, hace 30 min
    expect(selectDue(['f'], states({ f }), now, DEFAULT_POLICY)).toEqual([]) // backoff 1 h
    expect(selectDue(['f'], states({ f }), new Date(now.getTime() + 31 * 60_000), DEFAULT_POLICY)).toEqual(['f'])
    const many = Array.from({ length: 50 }, (_, i) => `s${i}`)
    expect(selectDue(many, new Map(), now, DEFAULT_POLICY)).toHaveLength(DEFAULT_POLICY.batchSize)
  })
  it('backoff exponencial con tope', () => {
    expect(backoffMs(0, DEFAULT_POLICY)).toBe(0)
    expect(backoffMs(1, DEFAULT_POLICY)).toBe(H)
    expect(backoffMs(3, DEFAULT_POLICY)).toBe(4 * H)
    expect(backoffMs(20, DEFAULT_POLICY)).toBe(24 * H)
  })
})

describe('adaptador de ficheros', () => {
  it('persiste, recarga y conserva la captura valida tras un fallo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2i-store-'))
    recordOutcome(dir, ok('a/b', at(0), 77), at(1000))
    recordOutcome(dir, bad('a/b', 'parse-failed'), at(H))
    const s = loadState(dir, 'a/b')
    expect(s.lastValid?.insert.picks).toBe(77)
    expect(s.lastValid?.capturedAt).toBe(at(0).toISOString())
    expect(s.lastAttempt?.attemptedAt).toBe(at(H).toISOString())
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
    fs.rmSync(dir, { recursive: true })
  })
  it('slug sin fichero = estado vacio', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2i-store-'))
    expect(loadState(dir, 'zz')).toEqual(emptyState('zz'))
    fs.rmSync(dir, { recursive: true })
  })
})

describe('pausa global persistente', () => {
  it('stopped escribe pausa, no toca el slug, y el tiempo no la levanta; solo resume explicito', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2i-pause-'))
    recordOutcome(dir, ok('a', at(0), 5), at(0))
    recordOutcome(dir, stopped('b'), at(H))
    recordOutcome(dir, stopped('c'), at(2 * H)) // segunda senal: conserva el origen
    const p = readPause(dir)!
    expect(p.triggerSlug).toBe('b')
    expect(p.pausedAt).toBe(at(H).toISOString())
    expect(loadState(dir, 'b')).toEqual(emptyState('b'))
    expect(loadState(dir, 'a').consecutiveFailures).toBe(0)
    // pasan 365 dias: sigue en pausa
    expect(readPause(dir)).not.toBeNull()
    expect(() => resume(dir, { decidedBy: '', note: 'x' }, at(3 * H))).toThrow()
    expect(() => resume(dir, { decidedBy: 'Juan', note: '  ' }, at(3 * H))).toThrow()
    expect(readPause(dir)).not.toBeNull()
    const r = resume(dir, { decidedBy: 'Juan', note: 'nueva senal externa X' }, at(4 * H))
    expect(r.decidedBy).toBe('Juan')
    expect(readPause(dir)).toBeNull()
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'pause-log.json'), 'utf8'))).toHaveLength(1)
    fs.rmSync(dir, { recursive: true })
  })
})
