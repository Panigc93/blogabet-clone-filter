import { describe, it, expect } from 'vitest'
import { mysScore, rankTopMys, recentSampleReliable, MysScoreInput } from '@/lib/mysScore'

const NOW = new Date('2026-10-30T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5)

function base(over: Partial<MysScoreInput> = {}): MysScoreInput {
  return {
    yield: '15.00',
    yield3m: '15.00',
    yield6m: '15.00',
    picks: 500,
    picks6mAvg: '20.00',
    verifiedPct: '95.00',
    resetCount: 0,
    lastPickAt: daysAgo(1),
    ...over,
  }
}

describe('recentSampleReliable', () => {
  it('exige al menos 30 picks en la ventana de 6 meses', () => {
    expect(recentSampleReliable(base({ picks6mAvg: '5.00' }))).toBe(true)   // 30 exactos
    expect(recentSampleReliable(base({ picks6mAvg: '4.99' }))).toBe(false)  // 29.94
    expect(recentSampleReliable(base({ picks6mAvg: null }))).toBe(false)
  })
})

describe('mysScore', () => {
  it('yield reciente con muestra minuscula puntua neutro, no inflado', () => {
    const inflado = base({ yield6m: '1080.00', yield3m: '1866.67', picks6mAvg: '1.67' })
    const sinStats = base({ yield6m: null, yield3m: null, picks6mAvg: '1.67' })
    expect(mysScore(inflado, NOW)).toBeCloseTo(mysScore(sinStats, NOW), 10)
  })

  it('un yield 6m fiable y alto mejora la puntuacion', () => {
    const bueno = base({ yield6m: '30.00' })
    const malo = base({ yield6m: '-10.00' })
    expect(mysScore(bueno, NOW)).toBeGreaterThan(mysScore(malo, NOW))
  })

  it('el yield historico tiene tope: 30% y 80% puntuan igual en ese componente', () => {
    const a = mysScore(base({ yield: '30.00' }), NOW)
    const b = mysScore(base({ yield: '80.00' }), NOW)
    expect(a).toBeCloseTo(b, 10)
  })

  it('cada reset penaliza un 15%', () => {
    const s0 = mysScore(base({ resetCount: 0 }), NOW)
    const s1 = mysScore(base({ resetCount: 1 }), NOW)
    const s2 = mysScore(base({ resetCount: 2 }), NOW)
    expect(s1).toBeCloseTo(s0 * 0.85, 10)
    expect(s2).toBeCloseTo(s0 * 0.85 * 0.85, 10)
  })

  it('la penalizacion por resets se acota en 4', () => {
    const s4 = mysScore(base({ resetCount: 4 }), NOW)
    const s9 = mysScore(base({ resetCount: 9 }), NOW)
    expect(s9).toBeCloseTo(s4, 10)
  })

  it('mas muestra puntua mas, en escala logaritmica', () => {
    const grande = mysScore(base({ picks: 10000 }), NOW)
    const mediana = mysScore(base({ picks: 1000 }), NOW)
    const justa = mysScore(base({ picks: 100 }), NOW)
    expect(grande).toBeGreaterThan(mediana)
    expect(mediana).toBeGreaterThan(justa)
    expect(justa).toBeGreaterThan(0)
  })

  it('un lastPickAt futuro no infla la recencia por encima del tope', () => {
    const futuro = mysScore(base({ lastPickAt: daysAgo(-30) }), NOW)
    const hoy = mysScore(base({ lastPickAt: daysAgo(0) }), NOW)
    expect(futuro).toBeCloseTo(hoy, 10)
  })

  it('la recencia del ultimo avistamiento (proxy last_pick_at) suma y caduca a los 90 dias', () => {
    const hoy = mysScore(base({ lastPickAt: daysAgo(0) }), NOW)
    const viejo = mysScore(base({ lastPickAt: daysAgo(90) }), NOW)
    const nulo = mysScore(base({ lastPickAt: null }), NOW)
    expect(hoy).toBeGreaterThan(viejo)
    expect(viejo).toBeCloseTo(nulo, 10)
  })

  it('soporta nulos y cadenas vacias sin romper', () => {
    const s = mysScore({ yield: null, yield3m: null, yield6m: null, picks: 100, picks6mAvg: null, verifiedPct: null, resetCount: 0, lastPickAt: null }, NOW)
    expect(Number.isFinite(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
  })

  it('verifiedPct fuera de rango se acota', () => {
    const s = mysScore(base({ verifiedPct: '150.00' }), NOW)
    expect(Number.isFinite(s)).toBe(true)
  })
})

describe('rankTopMys', () => {
  const rows = [
    { id: 1, slug: 'a', picks: 500 },
    { id: 2, slug: 'b', picks: 500 },
    { id: 3, slug: 'c', picks: 900 },
  ]
  const toScore = (r: { picks: number }) => base({ picks: r.picks })

  it('ordena por puntuacion y limita al top N', () => {
    const ranked = rankTopMys(rows, toScore, NOW, 2)
    expect(ranked).toHaveLength(2)
    expect(ranked[0].item.slug).toBe('c') // mas picks, misma base
  })

  it('desempata por picks y luego por id estable', () => {
    const ranked = rankTopMys(rows, toScore, NOW, 3)
    expect(ranked[1].item.id).toBe(1)
    expect(ranked[2].item.id).toBe(2)
    // determinista: misma entrada, mismo orden
    const again = rankTopMys(rows, toScore, NOW, 3).map(r => r.item.id)
    expect(ranked.map(r => r.item.id)).toEqual(again)
  })

  it('con limite mayor que el pool devuelve todo el pool', () => {
    expect(rankTopMys(rows, toScore, NOW, 50)).toHaveLength(3)
  })
})
