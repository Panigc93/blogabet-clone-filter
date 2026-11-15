import { describe, expect, it } from 'vitest'
import { tipstrrSnapshotToInsert, mergeTipstrrUpdate, planTipstrrUpsert, assertRealImportProvenance, type TipstrrDbMapping } from '@/crawler/platforms/tipstrr/to-db'
import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import type { TipsterInsert } from '@/db/schema'

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
    idSource: 'source-captured',
    slug: 'the-least-expected',
    subscriptionPriceGbp: 39,
    isPaid: true,
  }))
  const statmind = mustMap(tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, {
    id: -999999, // provisional para el aislado; portfolioId de StatMind no capturado
    idSource: 'isolated-fixture',
    slug: 'statmind',
    subscriptionPriceGbp: null,
    isPaid: false,
  }))

  it('keeps platform identity and unit separation', () => {
    expect(tle.id).toBe(-221629)
    expect(tle.platform).toBe('tipstrr')
    expect(tle.slug).toBe('the-least-expected')
    expect(tle.profitUnit).toBe('units')
    expect(tle.price).toBe('39.00')
    expect(tle.priceCurrency).toBe('gbp')
    expect(tle.isPaid).toBe(true)
    expect(statmind.price).toBeNull()
    expect(statmind.isPaid).toBe(false)
  })

  it('maps the verified all-time totals', () => {
    expect(tle.picks).toBe(1974)
    expect(parseFloat(tle.profit!)).toBeCloseTo(361.815, 3)
    expect(statmind.picks).toBe(291)
    expect(parseFloat(statmind.profit!)).toBeCloseTo(-59.125, 3)
  })

  it('all-time yield comes from the overview (advised basis) once the three numeric closures pass', () => {
    expect(tle.yield).toBe('18.33')
    expect(statmind.yield).toBe('-20.32')
    // La puerta estricta NO exige la batería de consistencia: con tips/roi/
    // profit cerrando contra la serie, un fallo de batería (p.ej. advised !=
    // level, estructural en stake variable) no anula el dato.
    const broken = mustMap(tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, consistency: [{ name: 'x', passed: false }] },
      { id: -1, idSource: 'isolated-fixture', slug: 'x', isPaid: true }
    ))
    expect(broken.yield).toBe('18.33')
    expect(broken.picks).toBe(1974)
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

  it('total ausente en overview all-time: cuarentena con clase total-ausente (nunca fabricar)', () => {
    const absent = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, overview: { ...TLE_SNAPSHOT.overview, tips: null } },
      { id: -2, idSource: 'isolated-fixture', slug: 'x', isPaid: true }
    )
    expect(absent.ok).toBe(false)
    if (!absent.ok) expect(absent.reason).toContain('total-ausente')
    const absentNoSeries = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, monthState: [], overview: { ...TLE_SNAPSHOT.overview, tips: null } },
      { id: -4, idSource: 'isolated-fixture', slug: 'x2', isPaid: true }
    )
    expect(absentNoSeries.ok).toBe(false)
    if (!absentNoSeries.ok) expect(absentNoSeries.reason).toContain('total-ausente')
    const realZero = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, monthState: [], overview: { ...TLE_SNAPSHOT.overview, tips: 0 } },
      { id: -3, idSource: 'isolated-fixture', slug: 'y', isPaid: true }
    )
    expect(realZero.ok).toBe(true)
    if (realZero.ok) {
      expect(realZero.insert.picks).toBe(0) // 0 real: perfil nuevo sin tips
      expect(realZero.insert.yield).toBeNull()
    }
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

// PUERTA ESTRICTA (2026-11-15): el histórico solo se persiste con cierre
// all-time independiente (period 6, o tips == Σtips de la serie cuando la
// ventana cubre toda la vida del perfil) Y tres cierres numéricos
// (tips/roi/profit contra la serie). Lo que dependa de completitud inferida
// va a cuarentena: no se persiste, captura y motivo conservados.
describe('puerta estricta: cierre all-time independiente o cuarentena', () => {
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
      profitUnits: 3,
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
  const OPTS = { id: -700001, idSource: 'isolated-fixture' as const, slug: 'x', isPaid: false }

  it('overview rodante aunque la serie llegue al alta: cuarentena[cobertura-sin-cierre], nada persiste', () => {
    // Los 96 perfiles COBERTURA de la clasificación anterior dependían de
    // completitud INFERIDA de la serie: la puerta estricta los cuarentena.
    const r = tipstrrSnapshotToInsert(mk({}), OPTS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('cobertura-sin-cierre')
  })

  it('overview all-time contradictorio con la serie: cuarentena[contradiccion-numerica]', () => {
    const r = tipstrrSnapshotToInsert(
      mk({ overviewPeriod: 6, overview: { ...mk({}).overview, tips: 999, profitUnits: 5 } }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('contradiccion-numerica')
  })

  it('overview all-time verificado (period=6, 3 cierres): persiste con yield del overview (base aconsejada)', () => {
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({ overviewPeriod: 6, overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5 } }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBe('2.50')
  })

  it('serie que empieza después del mes de alta: misma clase cobertura-sin-cierre', () => {
    const r = tipstrrSnapshotToInsert(mk({ signupDate: '2026-08-01' }), OPTS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('cobertura-sin-cierre')
  })

  it('overview.tips ausente: cuarentena[total-ausente] aunque la serie esté completa', () => {
    const r = tipstrrSnapshotToInsert(
      mk({ overviewPeriod: 6, overview: { ...mk({}).overview, tips: null, roiPct: null, profitUnits: null } }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('total-ausente')
  })

  it('sin serie y total ausente: cuarentena[total-ausente]', () => {
    const r = tipstrrSnapshotToInsert(
      mk({ monthState: [], overview: { ...mk({}).overview, tips: null, roiPct: null, profitUnits: null } }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('total-ausente')
  })

  it('huecos de meses sin actividad NO excluyen cuando el cierre all-time es independiente', () => {
    // Verificado sobre las capturas: 20 de 43 perfiles con cierre period=6
    // tienen huecos mensuales; el cierre independiente confirma el total
    // igualmente, así que el hueco no es motivo de exclusión.
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 6,
        monthState: [{ year: 2026, month: 10, tips: 200, staked: 200, profit: 5 }], // hueco: falta sep
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5 },
      }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBe('2.50')
  })

  it('ventana rodante con tips == suma pero periodStartDate posterior al alta: cuarentena[ventana-posterior-alta]', () => {
    // Regla exacta, sin tolerancia: la ventana debe empezar en o antes de la
    // fecha de alta. Caso real: ventana 2026-05-08 con alta 2025-06-06 — la
    // igualdad tips == suma no confirma el histórico.
    const ok = mk({})
    const r = tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 4,
        signupDate: '2025-06-06',
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5, periodStartDate: '2026-05-08T00:00:00Z' },
      }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('ventana-posterior-alta')
  })

  it('un día de desfase basta: ventana que empieza el día después del alta también cuarentena', () => {
    // Caso real: ventana 2026-08-15 con alta 2026-08-14.
    const ok = mk({})
    const r = tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 3,
        signupDate: '2026-08-14',
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5, periodStartDate: '2026-08-15T00:00:00Z' },
      }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('ventana-posterior-alta')
  })

  it('ventana rodante con periodStartDate == fecha de alta (exacto) y cierres: persiste', () => {
    const ok = mk({})
    const r = mustMap(tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 4,
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5, periodStartDate: '2026-09-10T00:00:00Z' },
      }),
      OPTS
    ))
    expect(r.picks).toBe(200)
    expect(r.yield).toBe('2.50')
  })

  it('ventana rodante con tips == suma pero periodStartDate ausente: cuarentena[ventana-posterior-alta]', () => {
    const ok = mk({})
    const r = tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 4,
        overview: { ...ok.overview, tips: 200, roiPct: 2.5, profitUnits: 5 },
      }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('ventana-posterior-alta')
  })
})

describe('stake variable vs contradicción numérica (clases separadas)', () => {
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
  const OPTS = { id: -700002, idSource: 'isolated-fixture' as const, slug: 'x', isPaid: false }

  it('stake variable (advised != level) con cierres numéricos en verde PERSISTE con yield aconsejado', () => {
    // advised != level es estructural en stake variable (150/208 con
    // Σstaked ≠ Σtips), no una contradicción de datos: no va a cuarentena.
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
    expect(r.yield).toBe('2.50') // roi del overview (base aconsejada)
  })

  it('contradicción numérica real (roi del overview no cierra): cuarentena[contradiccion-numerica]', () => {
    const ok = mk({})
    const r = tipstrrSnapshotToInsert(
      mk({
        overviewPeriod: 6,
        overview: { ...ok.overview, tips: 200, roiPct: 9.99, profitUnits: 5 },
        consistency: [{ name: 'roi = profit / total apostado cierra', passed: false }],
      }),
      OPTS
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('contradiccion-numerica')
  })
})

describe('mergeTipstrrUpdate: upsert que preserva ausentes', () => {
  const base = mustMap(tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id: -221629, idSource: 'source-captured', slug: 'the-least-expected',
    subscriptionPriceGbp: 39, isPaid: true,
  }))

  it('un ausente en la captura nueva nunca sobrescribe un valor guardado', () => {
    const next: TipsterInsert = {
      ...base,
      yield: null, // captura nueva sin yield verificado
      price: null,
      profit: null,
      capturedAt: new Date('2026-11-16T10:00:00Z'),
      statsUpdatedAt: new Date('2026-11-16T10:00:00Z'),
    }
    const merged = mergeTipstrrUpdate(base, next)
    expect(merged.yield).toBe('18.33') // preservado
    expect(merged.price).toBe('39.00') // preservado
    expect(merged.profit).toBe(base.profit) // preservado
  })

  it('los valores presentes sí actualizan y las marcas de tiempo avanzan', () => {
    const next: TipsterInsert = {
      ...base,
      yield: '19.01',
      picks: 2000,
      capturedAt: new Date('2026-11-16T10:00:00Z'),
      statsUpdatedAt: new Date('2026-11-16T10:00:00Z'),
    }
    const merged = mergeTipstrrUpdate(base, next)
    expect(merged.yield).toBe('19.01')
    expect(merged.picks).toBe(2000)
    expect(merged.capturedAt?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
    expect(merged.statsUpdatedAt?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
  })

  it('la identidad (id/platform/slug) es inmutable', () => {
    const next: TipsterInsert = {
      ...base,
      id: -1,
      platform: 'blogabet',
      slug: 'otro',
    }
    const merged = mergeTipstrrUpdate(base, next)
    expect(merged.id).toBe(-221629)
    expect(merged.platform).toBe('tipstrr')
    expect(merged.slug).toBe('the-least-expected')
  })
})

describe('planTipstrrUpsert: guardas de cuarentena y frescura', () => {
  const base = mustMap(tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id: -221629, idSource: 'source-captured', slug: 'the-least-expected',
    subscriptionPriceGbp: 39, isPaid: true,
  }))
  const okMapping = tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id: -221629, idSource: 'source-captured', slug: 'the-least-expected',
    subscriptionPriceGbp: 39, isPaid: true,
  })
  const quarantineMapping = tipstrrSnapshotToInsert(
    { ...TLE_SNAPSHOT, overview: { ...TLE_SNAPSHOT.overview, tips: null } },
    { id: -221629, idSource: 'source-captured', slug: 'the-least-expected', isPaid: true }
  )

  it('sin fila existente y mapeo verde: insert', () => {
    const plan = planTipstrrUpsert(null, okMapping)
    expect(plan.action).toBe('insert')
    if (plan.action === 'insert') expect(plan.insert.slug).toBe('the-least-expected')
  })

  it('cuarentena con fila existente: skip — el yield viejo NO se refresca con el capturedAt nuevo', () => {
    expect(quarantineMapping.ok).toBe(false)
    const plan = planTipstrrUpsert(base, quarantineMapping)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('cuarentena')
  })

  it('captura más antigua que la almacenada: skip — no retrocede valores ni marcas', () => {
    const olderMapping = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, capturedAtDate: '2026-11-01T00:00:00Z' },
      { id: -221629, idSource: 'source-captured', slug: 'the-least-expected', isPaid: true }
    )
    const plan = planTipstrrUpsert(base, olderMapping)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('no más reciente')
  })

  it('captura con la MISMA fecha que la almacenada: skip — no hay nada nuevo', () => {
    const plan = planTipstrrUpsert(base, okMapping)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('no más reciente')
  })

  it('captura nueva sin capturedAt: skip — política conservadora, no se escribe sin frescura verificable', () => {
    expect(okMapping.ok).toBe(true)
    if (!okMapping.ok) return
    const noDate: TipstrrDbMapping = { ok: true, insert: { ...okMapping.insert, capturedAt: null } }
    const plan = planTipstrrUpsert(base, noDate)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('sin capturedAt parseable')
  })

  it('captura nueva con capturedAt inválido: skip — un NaN no gana la comparación', () => {
    expect(okMapping.ok).toBe(true)
    if (!okMapping.ok) return
    const badDate: TipstrrDbMapping = {
      ok: true,
      insert: { ...okMapping.insert, capturedAt: 'no-es-una-fecha' as unknown as Date },
    }
    const plan = planTipstrrUpsert(base, badDate)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('sin capturedAt parseable')
  })

  it('fila existente sin capturedAt: skip — no se puede ordenar, política conservadora', () => {
    const plan = planTipstrrUpsert({ ...base, capturedAt: null }, okMapping)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('fila existente sin capturedAt')
  })

  it('captura más reciente: update con merge preserva-ausentes', () => {
    const newerMapping = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, capturedAtDate: '2026-11-16T00:00:00Z' },
      { id: -221629, idSource: 'source-captured', slug: 'the-least-expected', isPaid: true }
    )
    const plan = planTipstrrUpsert(base, newerMapping)
    expect(plan.action).toBe('update')
    if (plan.action === 'update') {
      expect(plan.merged.id).toBe(-221629)
      expect(plan.merged.capturedAt?.toISOString()).toBe('2026-11-16T00:00:00.000Z')
    }
  })
})

describe('assertRealImportProvenance: rechazo de fixtures antes del write', () => {
  it('un id provisional del aislado lanza antes de escribir', () => {
    expect(() => assertRealImportProvenance('isolated-fixture', 'statmind')).toThrow(/no son payload importable/)
  })
  it('un id capturado del origen pasa', () => {
    expect(() => assertRealImportProvenance('source-captured', 'the-least-expected')).not.toThrow()
  })
  it('un id interno generado transaccionalmente por la ruta real pasa', () => {
    expect(() => assertRealImportProvenance('internal-transactional', 'the-least-expected')).not.toThrow()
  })
})
