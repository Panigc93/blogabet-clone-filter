import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  golazobetsClosureGate,
  golazobetsCaptureToInsert,
  GZB_PROFIT_TOL,
  GZB_YIELD_TOL,
  type GzbProfileCapture,
} from '@/crawler/platforms/golazobets/to-db'

const CAP_DIR = join(__dirname, '../../crawler/platforms/golazobets/captures/2026-11-15-profiles')
const load = (slug: string): GzbProfileCapture =>
  JSON.parse(readFileSync(join(CAP_DIR, `${slug}.json`), 'utf8')) as GzbProfileCapture

const base: GzbProfileCapture = {
  tipster_id: 1,
  type: 'free',
  sport_id: 1,
  header: { number_bets: 10, total_bet: 10, profit: 1.0, yield: 10.0, win_rate: 50, average_stake: 1, average_odds: 2 },
  monthly: [
    { year: 2026, month: 10, total_picks: 6, total_bet: 6, profit: 0.6, yield: 10, win_rate: 50, average_stake: 1, average_odds: 2 },
    { year: 2026, month: 11, total_picks: 4, total_bet: 4, profit: 0.4, yield: 10, win_rate: 50, average_stake: 1, average_odds: 2 },
  ],
  picks_total: 10,
  recent_results: null,
}

describe('golazobetsClosureGate', () => {
  it('cierre exacto real: KROM90 (captura 2026-11-15) pasa con diffs ~0', () => {
    const r = golazobetsClosureGate(load('KROM90'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.diffs.picks).toBe(0)
      expect(Math.abs(r.diffs.profit)).toBeLessThan(0.011)
      expect(Math.abs(r.diffs.yield)).toBeLessThan(0.06)
    }
  })

  it('candidatos limite reales dentro de cota pasan la puerta pero conservan diff medida', () => {
    for (const slug of ['Alexf1Bets', 'Barbosa97', 'FutbolEnCasa', 'GOLAZOBETS']) {
      const r = golazobetsClosureGate(load(slug))
      expect(r.ok).toBe(true)
      if (r.ok) {
        // diffs registradas, no borradas: profit <= 0,02 y yield <= 0,1 medidos
        expect(Math.abs(r.diffs.profit)).toBeLessThanOrEqual(0.021)
        expect(Math.abs(r.diffs.yield)).toBeLessThanOrEqual(0.1)
      }
    }
  })

  it('cierra con suma mensual exacta (sintetico)', () => {
    expect(golazobetsClosureGate(base).ok).toBe(true)
  })

  it('picks no exactos -> cuarentena[cierre-picks]', () => {
    const cap = { ...base, header: { ...base.header, number_bets: 11 } }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[cierre-picks]')
  })

  it('profit fuera de cota -> cuarentena[cierre-profit]', () => {
    const cap = { ...base, header: { ...base.header, profit: 1.5 } }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[cierre-profit]')
  })

  it('profit dentro de cota de redondeo (0,005*meses+0,01) pasa', () => {
    const cap = { ...base, header: { ...base.header, profit: 1.019 } } // 2 meses -> cota 0,02
    expect(golazobetsClosureGate(cap).ok).toBe(true)
  })

  it('yield fuera de cota escalada -> cuarentena[cierre-yield]', () => {
    const cap = { ...base, header: { ...base.header, yield: 12.0 } }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[cierre-yield]')
  })

  it('tipo desconocido -> cuarentena[tipo-desconocido] (nunca free por defecto)', () => {
    const r = golazobetsClosureGate({ ...base, type: 'vip' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[tipo-desconocido]')
  })

  it('stats de cabecera ausentes -> cuarentena[stats-ausentes] (null, no 0)', () => {
    const r = golazobetsClosureGate({ ...base, header: { ...base.header, profit: null } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[stats-ausentes]')
  })

  it('sin filas mensuales -> cuarentena[datos-mensuales-ausentes]', () => {
    const r = golazobetsClosureGate({ ...base, monthly: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[datos-mensuales-ausentes]')
  })

  it('fila mensual con null -> cuarentena[datos-mensuales-ausentes]', () => {
    const cap = { ...base, monthly: [{ ...base.monthly[0], profit: null }, base.monthly[1]] }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[datos-mensuales-ausentes]')
  })

  it('volumen cero -> cuarentena[volumen-cero]', () => {
    const cap = {
      ...base,
      header: { ...base.header, number_bets: 1, total_bet: 0, profit: 0, yield: 0 },
      monthly: [{ ...base.monthly[0], total_picks: 1, total_bet: 0, profit: 0 }],
    }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[volumen-cero]')
  })

  it('cotas: profit crece con meses; yield decrece con volumen', () => {
    expect(GZB_PROFIT_TOL(1)).toBeCloseTo(0.015)
    expect(GZB_PROFIT_TOL(20)).toBeCloseTo(0.11)
    expect(GZB_YIELD_TOL(100, 2)).toBeLessThan(GZB_YIELD_TOL(10, 2))
  })
})

describe('golazobetsCaptureToInsert', () => {
  it('mapea cabecera a fila solo tras puerta ok (KROM90 real)', () => {
    const m = golazobetsCaptureToInsert('KROM90', load('KROM90'), { capturedAt: '2026-11-15' })
    expect(m.ok).toBe(true)
    if (m.ok) {
      expect(m.insert.platform).toBe('golazobets')
      expect(m.insert.slug).toBe('KROM90')
      expect(m.insert.picks).toBe(140)
      expect(Number(m.insert.profit)).toBeCloseTo(55.63)
      expect(Number(m.insert.yield)).toBeCloseTo(42.14)
      expect(m.insert.profitUnit).toBe('golazobets-units')
      expect(m.insert.isPaid).toBe(false)
      expect(m.insert.sourcePortfolioId).toBe(822)
      // no expuestos -> null (ausente = null, nunca 0)
      expect(m.insert.verifiedPct).toBeNull()
      expect(m.insert.followers).toBeNull()
      expect(m.insert.sinceYear).toBeNull()
      expect(m.insert.signupAt).toBeNull()
      expect(m.insert.price).toBeNull()
    }
  })

  it('premium -> isPaid true', () => {
    const cap = { ...base, type: 'premium' }
    const m = golazobetsCaptureToInsert('x', cap, { capturedAt: '2026-11-15' })
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.insert.isPaid).toBe(true)
  })

  it('puerta no ok -> no hay insert', () => {
    const m = golazobetsCaptureToInsert('x', { ...base, type: 'vip' }, { capturedAt: '2026-11-15' })
    expect(m.ok).toBe(false)
  })
})
