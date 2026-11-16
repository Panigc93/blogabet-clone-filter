import { describe, it, expect } from 'vitest'
import {
  bet2investProfileToInsert,
  mergeBet2InvestUpdate,
  planBet2InvestUpsert,
  assertBet2InvestRealImportProvenance,
  B2I_ROUND,
} from '@/crawler/platforms/bet2invest/to-db'
import type { Bet2InvestProfile } from '@/crawler/platforms/bet2invest/parse'
import type { TipsterInsert } from '@/db/schema'

// Fixtures FULLY SYNTHETIC: invented tipsters and figures. They reproduce
// the parsed record shape, not any captured profile.

const CAPTURED = new Date('2026-11-16T10:00:00.000Z')
const OPTS = { id: -910001, idSource: 'isolated-fixture' as const, slug: 'testpunter', capturedAt: CAPTURED }

function baseProfile(overrides: Partial<Bet2InvestProfile> = {}): Bet2InvestProfile {
  return {
    platform: 'bet2invest',
    username: 'TESTPUNTER',
    profileUrl: 'https://bet2invest.com/tipsters/performance-stats/TESTPUNTER',
    periodLabel: 'All',
    statsScope: 'all_time',
    accountType: 'pro',
    audience: { rating: 4.2, subscribers: 31, followers: 1200 },
    settledBets: 812,
    profitUnits: 37.42,
    roiPct: 6.31,
    avgOdds: 2.014,
    avgMaxBet: 2750,
    avgMaxBetCurrency: '€',
    clvPct: 1.38,
    results: { won: 360, halfWon: 31, refunded: 88, halfLost: 18, lost: 315 },
    bySport: [
      { label: 'Basketball', bets: 800, winRatePct: 52.25, profitUnits: 35.1, roiPct: 6.1, clvPct: 1.2, clevPct: -0.85, avgOdds: 2.02, avgMaxBet: 2400, avgMaxBetCurrency: '$' },
      { label: 'Ice hockey', bets: 12, winRatePct: 58.33, profitUnits: 2.32, roiPct: 24.1, clvPct: 3.05, clevPct: 0.1, avgOdds: 1.76, avgMaxBet: 150, avgMaxBetCurrency: '$' },
    ],
    monthlyAvailable: false,
    ...overrides,
  }
}

describe('bet2investProfileToInsert: camino OK', () => {
  it('mapea un perfil all_time pro consistente con disciplina de campos', () => {
    const m = bet2investProfileToInsert(baseProfile(), OPTS)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const i = m.insert
    expect(i.platform).toBe('bet2invest')
    expect(i.slug).toBe('testpunter')
    expect(i.name).toBe('TESTPUNTER')
    expect(i.isPaid).toBe(true)
    expect(i.price).toBeNull() // precio no capturado: no se asume
    expect(i.profitUnit).toBe('bet2invest-units')
    expect(i.picks).toBe(812)
    expect(i.profit).toBe('37.42')
    expect(i.yield).toBe('6.31') // ROI publicado por la fuente, no recalculado
    expect(i.sinceYear).toBeNull() // 'Since' del listado: semántica no verificada
    expect(i.followers).toBe(1200)
    expect(i.verifiedPct).toBeNull()
    expect(i.lastPickAt).toBeNull()
    expect(i.yield3m).toBeNull()
    expect(i.yield6m).toBeNull()
    expect(i.yield12m).toBeNull()
    expect(i.picks6mAvg).toBeNull()
    expect(i.picksFree3mAvg).toBeNull()
    expect(i.yieldFree3m).toBeNull()
    expect(i.capturedAt).toEqual(CAPTURED)
    expect(i.statsUpdatedAt).toEqual(CAPTURED)
  })

  it('followers ausente queda null, nunca 0', () => {
    const m = bet2investProfileToInsert(baseProfile({ audience: { rating: null, subscribers: null, followers: null } }), OPTS)
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.insert.followers).toBeNull()
  })

  it('admite suma de profit por deporte dentro del intervalo de redondeo', () => {
    // Σdeporte = 37.43 vs total 37.42: |diff| = 0.01 <= 0.005*(2+1)
    const p = baseProfile()
    p.bySport[1].profitUnits = 2.33
    const m = bet2investProfileToInsert(p, OPTS)
    expect(m.ok).toBe(true)
  })
})

describe('bet2investProfileToInsert: cuarentenas', () => {
  it('tipo-cuenta-desconocido: unknown no se asume free', () => {
    const m = bet2investProfileToInsert(baseProfile({ accountType: 'unknown' }), OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[tipo-cuenta-desconocido]')
  })

  it('free explícito persiste con isPaid=false; mismas puertas', () => {
    const m = bet2investProfileToInsert(baseProfile({ accountType: 'free' }), OPTS)
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.insert.isPaid).toBe(false)
    const bad = bet2investProfileToInsert(baseProfile({ accountType: 'free', settledBets: 999 }), OPTS)
    expect(bad.ok).toBe(false)
  })

  it('periodo-no-all-time: other_period y unknown no persisten', () => {
    for (const statsScope of ['other_period', 'unknown'] as const) {
      const m = bet2investProfileToInsert(baseProfile({ statsScope, periodLabel: '3 months' }), OPTS)
      expect(m.ok).toBe(false)
      if (!m.ok) expect(m.reason).toContain('cuarentena[periodo-no-all-time]')
    }
  })

  it('stats-ausentes: sin settledBets/profit/roi no hay verificación posible', () => {
    const m = bet2investProfileToInsert(baseProfile({ profitUnits: null }), OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[stats-ausentes]')
  })

  it('resumen-incompleto: categoría ausente', () => {
    const p = baseProfile()
    p.results.refunded = null
    const m = bet2investProfileToInsert(p, OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[resumen-incompleto]')
  })

  it('resumen-no-cierra: las categorías no suman el total', () => {
    const p = baseProfile()
    p.results.won = 359 // 811 != 812
    const m = bet2investProfileToInsert(p, OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[resumen-no-cierra]')
  })

  it('desglose-ausente: sin tabla por deporte no hay cierre cruzado', () => {
    const m = bet2investProfileToInsert(baseProfile({ bySport: [] }), OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[desglose-ausente]')
  })

  it('cierre-deporte-bets: Σbets por deporte distinta del total', () => {
    const p = baseProfile()
    p.bySport[0].bets = 799
    const m = bet2investProfileToInsert(p, OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[cierre-deporte-bets]')
  })

  it('cierre-deporte-profit: Σprofit fuera del intervalo de redondeo', () => {
    const p = baseProfile()
    p.bySport[0].profitUnits = 35.2 // Σ = 37.52 vs 37.42: 0.10 > 0.005*3
    const m = bet2investProfileToInsert(p, OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[cierre-deporte-profit]')
    expect(Math.abs(37.52 - 37.42)).toBeGreaterThan(B2I_ROUND * 3)
  })

  it('cero-inconsistente: 0 bets con cifras distintas de 0', () => {
    const m = bet2investProfileToInsert(baseProfile({ settledBets: 0 }), OPTS)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('cuarentena[cero-inconsistente]')
  })
})

describe('bet2investProfileToInsert: caso cero-real', () => {
  const zero = baseProfile({
    settledBets: 0,
    profitUnits: 0,
    roiPct: 0,
    results: { won: 0, halfWon: 0, refunded: 0, halfLost: 0, lost: 0 },
    bySport: [],
  })

  it('0 bets con todo a 0 persiste picks 0 y yield null', () => {
    const m = bet2investProfileToInsert(zero, OPTS)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.insert.picks).toBe(0)
    expect(m.insert.profit).toBe('0.00') // 0 mostrado: 0 real, no ausente
    expect(m.insert.yield).toBeNull() // ROI sobre 0 apostado no está definido
  })

  it('0 bets con profit ausente persiste profit null', () => {
    const m = bet2investProfileToInsert({ ...zero, profitUnits: null, roiPct: null }, OPTS)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.insert.picks).toBe(0)
    expect(m.insert.profit).toBeNull()
    expect(m.insert.yield).toBeNull()
  })
})

describe('mergeBet2InvestUpdate', () => {
  const existing = bet2investProfileToInsert(baseProfile(), OPTS)
  if (!existing.ok) throw new Error('fixture rota')

  it('un ausente nunca pisa un valor guardado; los presentes sí actualizan', () => {
    const next: TipsterInsert = {
      ...existing.insert,
      followers: null, // ausente nuevo: NO pisa el 1200 guardado
      profit: '40.10',
      yield: '6.80',
    }
    const merged = mergeBet2InvestUpdate(existing.insert, next)
    expect(merged.followers).toBe(1200)
    expect(merged.profit).toBe('40.10')
    expect(merged.yield).toBe('6.80')
  })

  it('la identidad es inmutable', () => {
    const next: TipsterInsert = { ...existing.insert, id: -1, slug: 'otro', platform: 'tipstrr' }
    const merged = mergeBet2InvestUpdate(existing.insert, next)
    expect(merged.id).toBe(existing.insert.id)
    expect(merged.slug).toBe('testpunter')
    expect(merged.platform).toBe('bet2invest')
  })
})

describe('planBet2InvestUpsert', () => {
  const okMapping = bet2investProfileToInsert(baseProfile(), OPTS)
  if (!okMapping.ok) throw new Error('fixture rota')

  it('cuarentena => skip sin tocar la fila existente', () => {
    const bad = bet2investProfileToInsert(baseProfile({ accountType: 'unknown' }), OPTS)
    const plan = planBet2InvestUpsert(okMapping.insert, bad)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('cuarentena')
  })

  it('sin fila existente => insert', () => {
    expect(planBet2InvestUpsert(null, okMapping).action).toBe('insert')
  })

  it('captura más reciente => update mezclado', () => {
    const older = { ...okMapping.insert, capturedAt: new Date('2026-11-15T10:00:00.000Z') }
    const plan = planBet2InvestUpsert(older, okMapping)
    expect(plan.action).toBe('update')
  })

  it('captura no más reciente => skip', () => {
    const newer = { ...okMapping.insert, capturedAt: new Date('2026-11-17T10:00:00.000Z') }
    expect(planBet2InvestUpsert(newer, okMapping).action).toBe('skip')
    const same = planBet2InvestUpsert(okMapping.insert, okMapping)
    expect(same.action).toBe('skip')
  })

  it('sin capturedAt ordenable => skip conservador', () => {
    const noDate = { ...okMapping.insert, capturedAt: null }
    expect(planBet2InvestUpsert(noDate, okMapping).action).toBe('skip')
    const badDate = bet2investProfileToInsert(baseProfile(), { ...OPTS, capturedAt: new Date('invalid') })
    if (badDate.ok) expect(planBet2InvestUpsert(okMapping.insert, badDate).action).toBe('skip')
  })
})

describe('assertBet2InvestRealImportProvenance', () => {
  it('rechaza ids de fixture aislado y admite surrogate transaccional', () => {
    expect(() => assertBet2InvestRealImportProvenance('isolated-fixture', 'testpunter')).toThrow(/import real rechazado/)
    expect(() => assertBet2InvestRealImportProvenance('internal-transactional', 'testpunter')).not.toThrow()
  })
})
