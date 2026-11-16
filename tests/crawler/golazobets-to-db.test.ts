import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  golazobetsClosureGate,
  golazobetsCaptureToInsert,
  GZB_SUM_TOL,
  GZB_YIELD_INTERVAL,
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

  it('candidatos limite reales: compatibles con redondeo (solape de intervalos), NO causalidad; diffs conservadas', () => {
    // Estos 4 quedan etiquetados en docs/golazobets-import.md: su compatibilidad
    // es por amplitud de intervalo (volumen bajo), no por cierre exacto.
    for (const slug of ['Alexf1Bets', 'Barbosa97', 'FutbolEnCasa', 'GOLAZOBETS']) {
      const cap = load(slug)
      const r = golazobetsClosureGate(cap)
      expect(r.ok).toBe(true)
      if (r.ok) {
        // diffs registradas, no borradas: profit <= 0,02 y yield <= 0,1 medidos
        expect(Math.abs(r.diffs.profit)).toBeLessThanOrEqual(0.021)
        expect(Math.abs(r.diffs.yield)).toBeLessThanOrEqual(0.1)
        // el intervalo derivado contiene la cabecera (motivo del pase)
        expect(r.diffs.yieldLo).toBeLessThanOrEqual((cap.header.yield ?? 0) + 0.005 + 1e-9)
        expect(r.diffs.yieldHi).toBeGreaterThanOrEqual((cap.header.yield ?? 0) - 0.005 - 1e-9)
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

  it('profit en el borde del solape de intervalos (0,005*(filas+1)): dentro pasa, fuera cuarentena', () => {
    // 2 filas -> cota 0,005*2 + 0,005 = 0,015
    expect(golazobetsClosureGate({ ...base, header: { ...base.header, profit: 1.014 } }).ok).toBe(true)
    const r = golazobetsClosureGate({ ...base, header: { ...base.header, profit: 1.016 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[cierre-profit]')
  })

  it('yield: fuera del intervalo derivado -> cuarentena[cierre-yield]; borde del intervalo pasa', () => {
    const fuera = golazobetsClosureGate({ ...base, header: { ...base.header, yield: 12.0 } })
    expect(fuera.ok).toBe(false)
    if (!fuera.ok) expect(fuera.clase).toBe('cuarentena[cierre-yield]')
    // intervalo derivado de base: [9,890, 10,111]; 10,11 solapa (+-0,005), 10,12 no
    expect(golazobetsClosureGate({ ...base, header: { ...base.header, yield: 10.11 } }).ok).toBe(true)
    const r = golazobetsClosureGate({ ...base, header: { ...base.header, yield: 10.12 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[cierre-yield]')
  })

  it('yield indeterminado con denominador bajo -> cuarentena[volumen-cero] (no se deriva, no es 0)', () => {
    // suma total_bet 0,004 con 1 fila: el denominador real puede ser <= 0
    const cap = {
      ...base,
      header: { ...base.header, number_bets: 1, total_bet: 0.004, profit: 0.001, yield: 25 },
      monthly: [{ ...base.monthly[0], total_picks: 1, total_bet: 0.004, profit: 0.001 }],
    }
    const r = golazobetsClosureGate(cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('cuarentena[volumen-cero]')
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

  it('intervalos: la suma crece con filas; el intervalo de yield se estrecha con volumen; denominador dudoso -> null', () => {
    expect(GZB_SUM_TOL(1)).toBeCloseTo(0.005)
    expect(GZB_SUM_TOL(20)).toBeCloseTo(0.1)
    const grande = GZB_YIELD_INTERVAL(10, 1000, 10)
    const chico = GZB_YIELD_INTERVAL(0.1, 10, 10)
    expect(grande).not.toBeNull()
    expect(chico).not.toBeNull()
    if (grande && chico) {
      expect(grande.hi - grande.lo).toBeLessThan(chico.hi - chico.lo)
    }
    expect(GZB_YIELD_INTERVAL(0, 0.04, 10)).toBeNull() // s - 0,005*10 <= 0
    expect(GZB_YIELD_INTERVAL(0, 0, 1)).toBeNull()
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
      // sinceYear YA no es null: se deriva del primer mes con apuestas>0
      // del histórico all-time (decisión usuario 16-nov; KROM90 = 2026).
      expect(m.insert.sinceYear).toBe(2026)
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
