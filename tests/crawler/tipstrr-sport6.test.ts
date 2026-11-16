import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { loadTipstrrCapture } from '@/crawler/platforms/tipstrr/load-capture'
import { tipstrrSnapshotToInsert, type TipstrrDbMapping } from '@/crawler/platforms/tipstrr/to-db'
import { sport6Totals, applySport6AllTime, type Sport6Capture } from '@/crawler/platforms/tipstrr/sport6'

// Capturas reales 2026-11-15: la recuperación de los 111 en cuarentena por
// falta de overview all-time. '-25' cierra contra su serie; chicken-dinner
// es una de las 10 discrepancias mantenidas (sport/6 suma 1307 tips, la
// serie embebida 1291).
const CAP = join(__dirname, '../../crawler/platforms/tipstrr/captures')

const readCap = (dir: string, slug: string) =>
  JSON.parse(readFileSync(join(CAP, dir, `${slug}.json`), 'utf8'))

const snapFromStats = (slug: string) => {
  const raw = readCap('2026-11-15-stats', slug)
  return loadTipstrrCapture(raw, {
    sourceUrl: raw._meta.source.split(' ')[0],
    capturedAt: raw._meta.captured,
    capturedAtDate: raw._meta.captured,
    editorial: {
      platformLabel: 'Tipstrr',
      stakeLabel: null,
      roiPeriodLabel: 'x',
      lastResultVisibleLabel: null,
      yieldEquivalenceNote: 'x',
      notAvailable: [],
    },
  })
}

const mapWith = (snap: ReturnType<typeof snapFromStats>, slug: string): TipstrrDbMapping =>
  tipstrrSnapshotToInsert(snap, { id: -1, idSource: 'isolated-fixture', slug, subscriptionPriceGbp: null, isPaid: false })

describe('sport6Totals', () => {
  const totals = sport6Totals(readCap('2026-11-15-sport6', '-25') as Sport6Capture)

  it('suma los totales advised por deporte', () => {
    expect(totals.tips).toBe(500)
    expect(totals.staked).toBeCloseTo(500.5, 3)
    expect(totals.profit).toBeCloseTo(12.604, 3)
  })

  it('roi en base advised (profit/staked), nunca derivado del ROI redondeado', () => {
    expect(totals.roiPct).toBe(2.52)
  })

  it('winRate = win/(win+lose), mismo criterio que winPercentage de la fuente', () => {
    expect(totals.winRatePct).toBe(25)
  })

  it('sin deportes: ausencia es null, nunca 0', () => {
    const empty = sport6Totals({ slug: 'x', source: 'x', capturedAt: 'x', stats: [] })
    expect(empty.tips).toBe(0)
    expect(empty.roiPct).toBeNull()
    expect(empty.winRatePct).toBeNull()
  })
})

describe('applySport6AllTime', () => {
  const snap = snapFromStats('-25')
  const totals = sport6Totals(readCap('2026-11-15-sport6', '-25') as Sport6Capture)
  const overridden = applySport6AllTime(snap, totals, 'captura 2026-11-15')

  it('sustituye el overview por los totales all-time con overviewPeriod=6', () => {
    expect(overridden.overviewPeriod).toBe(6)
    expect(overridden.overview.tips).toBe(500)
    expect(overridden.overview.roiPct).toBe(2.52)
    expect(overridden.overview.profitUnits).toBeCloseTo(12.604, 3)
  })

  it('declara la procedencia sport/6 en roiPeriodLabel', () => {
    expect(overridden.overview.roiPeriodLabel).toContain('stats/sport/6')
    expect(overridden.overview.roiPeriodLabel).toContain('captura 2026-11-15')
  })

  it('no muta la snapshot original ni toca la serie mensual', () => {
    expect(snap.overview.tips).not.toBe(500)
    expect(overridden.monthState).toBe(snap.monthState)
  })

  it('la puerta estricta acepta un cierre real: picks/yield salen del cierre sport/6', () => {
    const mapped = mapWith(overridden, '-25')
    if (!mapped.ok) throw new Error(mapped.reason)
    expect(mapped.insert.picks).toBe(500)
    expect(mapped.insert.yield).toBe('2.52')
    expect(parseFloat(mapped.insert.profit!)).toBeCloseTo(12.604, 3)
  })

  it('la puerta estricta rechaza una discrepancia real (chicken-dinner 1307 vs 1291)', () => {
    const cd = snapFromStats('chicken-dinner')
    const cdTotals = sport6Totals(readCap('2026-11-15-sport6', 'chicken-dinner') as Sport6Capture)
    const mapped = mapWith(applySport6AllTime(cd, cdTotals, 'captura 2026-11-15'), 'chicken-dinner')
    expect(mapped.ok).toBe(false)
    if (mapped.ok) return
    expect(mapped.reason).toContain('contradiccion-numerica')
  })
})
