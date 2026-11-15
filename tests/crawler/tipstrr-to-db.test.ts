import { describe, it, expect } from 'vitest'
import { tipstrrSnapshotToInsert, type TipstrrDbMapping } from '@/crawler/platforms/tipstrr/to-db'
import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'

const mustMap = (m: TipstrrDbMapping) => {
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'

describe('tipstrrSnapshotToInsert', () => {
  // TLE portfolioId 221629: real, from the captured per-tip object
  // (2026-11-15). Negative-space convention keeps BB and Tipstrr ids apart.
  const tle = mustMap(tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id: -221629,
    slug: 'the-least-expected',
    subscriptionPriceGbp: 39,
    isPaid: true,
  }))
  const statmind = mustMap(tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, {
    id: -999999, // fabricated for the test only; StatMind's portfolioId not captured
    slug: 'statmind',
    subscriptionPriceGbp: null,
    isPaid: false,
  }))

  it('keeps platform identity and unit separation', () => {
    expect(tle.id).toBe(-221629)
    expect(tle.platform).toBe('tipstrr')
    expect(tle.slug).toBe('the-least-expected')
    expect(tle.profitUnit).toBe('units')
    expect(tle.priceCurrency).toBe('gbp')
    expect(tle.price).toBe('39.00')
    expect(statmind.isPaid).toBe(false)
    expect(statmind.price).toBeNull()
  })

  it('stores units, never money', () => {
    // TLE: 1974 tips, exact monthly profit sum 361.815 units
    expect(tle.picks).toBe(1974)
    expect(parseFloat(tle.profit!)).toBeCloseTo(361.815, 3)
    expect(statmind.picks).toBe(291)
    expect(parseFloat(statmind.profit!)).toBeCloseTo(-59.125, 3)
  })

  it('verified tier stores the overview yield; a battery failure without numeric contradiction falls back to the exact-series yield', () => {
    expect(tle.yield).toBe('18.33')
    expect(statmind.yield).toBe('-20.32')
    // 2026-11-15 (revisión): un fallo de la batería que NO contradice las
    // cifras (p.ej. advised != level en stake variable) ya no anula el
    // yield: con tips/roi/profit cerrando contra la serie, el yield se
    // calcula de la serie exacta (misma base level-stake). Solo una
    // contradicción numérica real lo deja null.
    const broken = mustMap(tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, consistency: [{ name: 'x', passed: false }] },
      { id: -1, slug: 'x', isPaid: true }
    ))
    expect(broken.yield).toBe('18.33') // calculado: 361.82/1974 cierra con 18.33
  })

  it('computes period yields from exact monthly figures; incomplete windows are null', () => {
    // TLE ago+sep+oct 2026 cerrados: (35.25+19.1+27.25) / (136+106+78) = 81.6/320
    expect(parseFloat(tle.yield3m!)).toBeCloseTo((81.6 / 320) * 100, 2)
    expect(tle.yield6m).not.toBeNull()
    expect(tle.yield12m).not.toBeNull()
    // StatMind: single closed month (partial since signup) -> all null
    expect(statmind.yield3m).toBeNull()
    expect(statmind.yield6m).toBeNull()
    expect(statmind.yield12m).toBeNull()
  })

  it('missing overview total: measured series total persists; absent without series rejects; a real 0 is kept', () => {
    // 2026-11-15: the pick-count filter needs the real historical total and
    // the column is NOT NULL, so a total that cannot be established must NOT
    // become a fabricated 0 — the record is rejected with an explicit reason
    // and the capture kept for review. But when the overview figure is
    // absent and the complete monthly series measures the total exactly,
    // that measured total persists (it is not fabricated). A genuine 0 (new
    // profile, no tips) also persists.
    const absent = mustMap(tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, overview: { ...TLE_SNAPSHOT.overview, tips: null } },
      { id: -2, slug: 'x', isPaid: true }
    ))
    expect(absent.picks).toBe(1974) // suma exacta de la serie, no fabricado
    expect(absent.yield).toBeNull() // overview all-time ausente: sin yield verificado
    const absentNoSeries = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, monthState: [], overview: { ...TLE_SNAPSHOT.overview, tips: null } },
      { id: -4, slug: 'x2', isPaid: true }
    )
    expect(absentNoSeries.ok).toBe(false)
    if (!absentNoSeries.ok) expect(absentNoSeries.reason).toContain('picks')
    const realZero = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, monthState: [], overview: { ...TLE_SNAPSHOT.overview, tips: 0 } },
      { id: -3, slug: 'y', isPaid: true }
    )
    expect(realZero.ok).toBe(true)
    if (realZero.ok) expect(realZero.insert.picks).toBe(0)
  })

  it('absence stays null, never 0', () => {
    expect(tle.followers).toBeNull()
    expect(tle.verifiedPct).toBeNull()
    expect(tle.sinceYear).toBeNull()
    expect(tle.lastPickAt).toBeNull()
    expect(tle.picksFree3mAvg).toBeNull()
    expect(tle.yieldFree3m).toBeNull()
  })

  it('keeps provenance: signup date and capture instant', () => {
    expect(tle.signupAt?.toISOString().slice(0, 10)).toBe('2025-03-11')
    expect(tle.capturedAt?.toISOString()).toBe('2026-11-15T13:49:00.000Z')
    expect(tle.statsUpdatedAt?.toISOString()).toBe('2026-11-15T13:49:00.000Z')
  })
})

// Puerta por niveles (hallazgo 2026-11-15 sobre 209 capturas reales): el
// overview de /stats viene acotado al periodo seleccionado; 3/4/5 son
// ventanas rodantes no reproducibles desde buckets mensuales y 6 es
// all-time. El total histórico y el yield se resuelven por verificación,
// no por fe en el overview.
describe('puerta por niveles: overview rodante vs all-time', () => {
  const mk = (over: Partial<FichaSnapshot>): FichaSnapshot => ({
    capturedAt: '2026-11-15',
    capturedAtDate: '2026-11-15T16:00:00Z',
    monthState: [
      { year: 2026, month: 10, tips: 100, staked: 100, profit: 10 },
      { year: 2026, month: 9, tips: 100, staked: 100, profit: -5 },
    ],
    sourceUrl: 'https://tipstrr.com/tipster/x/stats',
    name: 'X',
    platformLabel: 'Free',
    signupDate: '2026-09-10',
    avatarUrl: null,
    activeTipsNow: null,
    lastResultVisibleLabel: null,
    overview: {
      tips: 50, // ventana rodante: NO es el total histórico
      winRatePct: null,
      avgOdds: null,
      stakeLabel: null,
      profitDisplay: null,
      roiPct: 3,
      roiPeriodLabel: 'period=3',
    },
    months: [],
    consistency: [{ name: 'misma ventana', passed: true }],
    overviewPeriod: 3,
    yieldEquivalenceNote: '',
    notAvailable: [],
    ...over,
  })
  const OPTS = { id: -700001, slug: 'x', isPaid: false }

  it('overview rodante + serie desde el alta: picks = suma exacta de la serie, yield calculado de cifras exactas', () => {
    const r = mustMap(tipstrrSnapshotToInsert(mk({}), OPTS))
    expect(r.picks).toBe(200) // 100+100 de la serie, no los 50 del overview rodante
    expect(parseFloat(r.yield!)).toBeCloseTo((5 / 200) * 100, 2) // 2.50
  })

  it('overview all-time contradictorio con la serie: picks de la serie, yield null', () => {
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({ overviewPeriod: 6, overview: { ...mk({}).overview, tips: 999 }, consistency: [{ name: 'suma mensual = overview', passed: false }] }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBeNull()
  })

  it('overview all-time verificado (period=6 y tips == suma y todo en verde): yield del overview', () => {
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({ overviewPeriod: 6, overview: { ...ok.overview, tips: 200, roiPct: 2.5 } }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBe('2.50')
  })

  it('serie que empieza después del mes de alta (silencio ambiguo): rechazo con motivo', () => {
    const r = tipstrrSnapshotToInsert(mk({ signupDate: '2026-08-01' }), OPTS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('no llega al mes de alta')
  })

  it('overview.tips ausente con serie completa: el total sale de la serie (no se fabrica, se mide)', () => {
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({ overview: { ...mk({}).overview, tips: null, roiPct: null } }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).not.toBeNull() // calculado de la serie exacta
  })

  it('sin serie y total ausente: rechazo', () => {
    const r = tipstrrSnapshotToInsert(
      mk({ monthState: [], overview: { ...mk({}).overview, tips: null } }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('no llega al mes de alta')
  })
})

describe('stake variable vs contradicción numérica', () => {
  const mk = (over: Partial<FichaSnapshot>): FichaSnapshot => ({
    capturedAt: '2026-11-15',
    capturedAtDate: '2026-11-15T16:00:00Z',
    monthState: [
      { year: 2026, month: 10, tips: 100, staked: 100, profit: 10 },
      { year: 2026, month: 9, tips: 100, staked: 100, profit: -5 },
    ],
    sourceUrl: 'https://tipstrr.com/tipster/x/stats',
    name: 'X', platformLabel: 'Free', signupDate: '2026-09-10', avatarUrl: null,
    activeTipsNow: null, lastResultVisibleLabel: null,
    overview: { tips: 50, winRatePct: null, avgOdds: null, stakeLabel: null, profitDisplay: null, profitUnits: 3, roiPct: 3, roiPeriodLabel: 'period=3' },
    months: [], consistency: [{ name: 'misma ventana', passed: true }],
    overviewPeriod: 3, yieldEquivalenceNote: '', notAvailable: [], ...over,
  })
  const OPTS = { id: -700002, slug: 'x', isPaid: false }

  it('stake variable (advised != level) con cierres numéricos en verde NO es contradicción: yield calculado de la serie', () => {
    // 2026-11-15: 51 perfiles all-time reales fallaban solo el chequeo
    // advised == level (estructural en stake variable) y la puerta anterior
    // les anulaba el yield pese a cerrar tips/roi/profit contra la serie.
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 6,
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5 },
        consistency: [{ name: 'profit advised = level stake', passed: false }],
      }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBe('2.50') // Σprofit/Σstaked = 5/200, base level-stake
  })

  it('contradicción numérica real (roi del overview no cierra contra la serie): yield null', () => {
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 6,
        overview: { ...ok.overview, tips: 200, roiPct: 9.99, profitUnits: 5 },
        consistency: [{ name: 'roi = profit / total apostado cierra', passed: false }],
      }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBeNull()
  })
})
