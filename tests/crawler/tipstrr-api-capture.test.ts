import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { apiCaptureToSnapshot, type TipstrrApiCapture } from '@/crawler/platforms/tipstrr/api-capture'
import { tipstrrSnapshotToInsert } from '@/crawler/platforms/tipstrr/to-db'

// Captura real 0nlybtt (2026-11-15, job jsjob-4): premium (type=2), alta
// 2025-04-25, 20 meses de serie, cierre exacto month/6 vs sport/6
// (3210 tips, 699.9 staked, 14.348 profit en ambas agregaciones).
const CAP = join(__dirname, '../../crawler/platforms/tipstrr/captures/2026-11-15-api/0nlybtt.json')
const cap = JSON.parse(readFileSync(CAP, 'utf8')) as TipstrrApiCapture
const snap = apiCaptureToSnapshot(cap)

describe('apiCaptureToSnapshot (captura compacta real)', () => {
  it('identidad y fechas fuente preservadas (sin sustituir por la de captura)', () => {
    expect(snap.name).toBe('0NLYBTT$')
    expect(snap.signupDate).toBe('2025-04-25') // dateCreated de la fuente
    expect(snap.overviewPeriod).toBe(6)
    expect(snap.overview.periodStartDate).toBeNull() // sport/6 no emite ventana: ausente, no fabricado
    expect(snap.platformLabel).toContain('Premium')
  })

  it('serie month/6 intacta y ordenable; overview = totales sport/6 con procedencia', () => {
    expect(snap.monthState).toHaveLength(20)
    expect(snap.overview.tips).toBe(3210)
    expect(snap.overview.profitUnits).toBeCloseTo(14.348, 3)
    expect(snap.overview.roiPct).toBe(2.05)
    expect(snap.overview.roiPeriodLabel).toContain('stats/sport/6')
  })

  it('la puerta estricta acepta el cierre: picks/yield del cierre, profit de la serie', () => {
    const m = tipstrrSnapshotToInsert(snap, { id: -1, idSource: 'internal-transactional', slug: '0nlybtt', subscriptionPriceGbp: null, isPaid: true })
    if (!m.ok) throw new Error(m.reason)
    expect(m.insert.picks).toBe(3210)
    expect(m.insert.yield).toBe('2.05')
    expect(parseFloat(m.insert.profit!)).toBeCloseTo(14.348, 3)
    expect(m.insert.isPaid).toBe(true)
    expect(m.insert.signupAt).toEqual(new Date('2025-04-25T00:00:00Z'))
  })

  it('una discrepancia fabricada en sport/6 cae en cuarentena (la puerta manda)', () => {
    const tampered: TipstrrApiCapture = {
      ...cap,
      sport6: cap.sport6.map((s) => ({ ...s, tips: s.tips + 1 })),
    }
    const m = tipstrrSnapshotToInsert(apiCaptureToSnapshot(tampered), { id: -1, idSource: 'internal-transactional', slug: 'x', subscriptionPriceGbp: null, isPaid: false })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('contradiccion-numerica')
  })

  it('winRate con cierre win/lose month/6 vs sport/6 se conserva; si se rompe el cierre, null (no fabricado)', () => {
    expect(snap.overview.winRatePct).toBe(46) // 1488/(1488+1722), cuentas enteras idénticas en ambas agregaciones
    const tampered: TipstrrApiCapture = {
      ...cap,
      month6: cap.month6.map((r, i) => (i === 0 ? { ...r, win: (r.win ?? 0) + 1 } : r)),
    }
    const s2 = apiCaptureToSnapshot(tampered)
    expect(s2.overview.winRatePct).toBeNull()
    expect(s2.notAvailable.some((n) => n.field === 'winRatePct')).toBe(true)
  })

  it('fidelidad de formato: month/6 replica la serie de la captura embebida (evidencia sonda 1086)', () => {
    // La sonda alltime-selector-probe-1086 verificó que month/6 es IDÉNTICA a
    // la serie embebida #tipstrr-state. Aquí se fija la forma esperada por
    // load-capture: mismas claves de fila mensual.
    for (const r of cap.month6) {
      expect(r).toHaveProperty('date')
      expect(r).toHaveProperty('tips')
      expect(r).toHaveProperty('staked')
      expect(r).toHaveProperty('profit')
    }
  })
})
