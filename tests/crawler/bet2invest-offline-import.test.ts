import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { windowYieldOrNull, buildOfflineRow } from '@/crawler/platforms/bet2invest/offline-import'
import { parseMonthsResponse } from '@/crawler/platforms/bet2invest/api-months'

const NOW = new Date('2026-11-17T16:27:00Z')
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const mrow = (key: string, bets: number, profit: number, units = 1) => ({ key, value: { betsNumber: bets, profit, averageUnits: units } })
const ms = (rows: ReturnType<typeof mrow>[]) => parseMonthsResponse(rows)!

describe('windowYieldOrNull', () => {
  // 10 bets x 1u per month; profit +1 in Oct, -1 in Sep, +2 in Jul. All-time: 20 bets... header ROI must match.
  const rows = ms([mrow('2026-07-03', 10, 2), mrow('2026-09-03', 10, -1), mrow('2026-10-03', 10, 1), mrow('2026-11-03', 10, 5)])
  const roi = (100 * (2 - 1 + 1 + 5)) / 40
  const ctx = { headerRoiPct: roi, lastReset: null, selected: true }
  it('ventana de meses completos, mes en curso excluido, suma/suma', () => {
    expect(windowYieldOrNull(rows, 3, NOW, ctx)).toMatchObject({ value: '0.00', months: 2, bets: 20 })
    expect(windowYieldOrNull(rows, 6, NOW, ctx)).toMatchObject({ value: '6.67', months: 3, bets: 30 })
  })
  it('sin actividad en ventana: null con motivo, no 0', () => {
    expect(windowYieldOrNull(ms([mrow('2026-01-03', 10, 1)]), 3, NOW, { ...ctx, headerRoiPct: 10 })).toMatchObject({ value: null, reason: 'sin-actividad-en-ventana' })
  })
  it('serie que no reproduce el ROI de cabecera: null', () => {
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, headerRoiPct: roi + 0.2 })).toMatchObject({ value: null, reason: 'meses-no-reproducen-roi-de-cabecera' })
  })
  it('puerta de ROI con tolerancia 0.005: entra en 0.005, sale en 0.006', () => {
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, headerRoiPct: roi + 0.005 }).value).not.toBeNull()
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, headerRoiPct: roi + 0.006 }).value).toBeNull()
  })
  it('reinicio: solo ventanas que empiezan despues del mes del reinicio; sin reconstruir', () => {
    // reset in Aug 2026: 3m window starts 2026-08 (inclusive) => overlaps; with reset in Jul, 3m window (Aug-Oct) is safe, 6m (May-Oct) is not
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, lastReset: '2026-08-10T00:00:00Z' })).toMatchObject({ value: null, reason: 'ventana-solapa-reinicio-semantica-no-verificada' })
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, lastReset: '2026-07-10T00:00:00Z' }).value).toBe('0.00')
    expect(windowYieldOrNull(rows, 6, NOW, { ...ctx, lastReset: '2026-07-10T00:00:00Z' }).reason).toBe('ventana-solapa-reinicio-semantica-no-verificada')
  })
  it('vacio, ausente y no vinculado nunca dan numero', () => {
    expect(windowYieldOrNull([], 3, NOW, ctx).reason).toBe('serie-mensual-vacia')
    expect(windowYieldOrNull(null, 3, NOW, ctx).reason).toBe('sin-serie-mensual')
    expect(windowYieldOrNull(rows, 3, NOW, { ...ctx, selected: false }).reason).toBe('bankroll-no-vinculado')
  })
})

describe('buildOfflineRow end to end (pagina real reducida + meses reales descargados, perfil Apocalypse_55)', () => {
  const html = fx('b2i-e2e-ssr.html')
  const months = JSON.parse(fx('b2i-e2e-months.json'))
  it('pagina -> seleccion -> fila con yields de ventana respaldados por meses', () => {
    const r = buildOfflineRow({ slug: 'Apocalypse_55', html, monthsJson: months, capturedAt: NOW, surrogateId: -1 })
    expect(r.status).toBe('row')
    if (r.status !== 'row') return
    expect(r.insert).toMatchObject({ platform: 'bet2invest', slug: 'Apocalypse_55', profitUnit: 'bet2invest-units', picks: 12, yield: '-38.60', isPaid: false, yield3m: '-38.60', yield6m: '-38.60', yield12m: '-38.60' })
    expect(r.windows[3]).toMatchObject({ months: 1, bets: 12, reason: null })
  })
  it('sin serie mensual: la fila existe con yields de periodo null y motivo', () => {
    const r = buildOfflineRow({ slug: 'Apocalypse_55', html, monthsJson: null, capturedAt: NOW, surrogateId: -1 })
    expect(r.status).toBe('row')
    if (r.status !== 'row') return
    expect(r.insert.yield3m).toBeNull()
    expect(r.windows[3].reason).toBe('sin-serie-mensual')
  })
  it('captura en otro mes: la ventana se mueve y el mes ya no cae dentro (null con motivo, no 0)', () => {
    const r = buildOfflineRow({ slug: 'Apocalypse_55', html, monthsJson: months, capturedAt: new Date('2027-06-15T00:00:00Z'), surrogateId: -1 })
    if (r.status !== 'row') throw new Error('row expected')
    expect(r.windows[3]).toMatchObject({ value: null, reason: 'sin-actividad-en-ventana' })
  })
  it('candidato multi-bankroll: no se mapea', () => {
    const r = buildOfflineRow({ slug: 'Gerganaana', html: fx('b2i-select-multi-candidate.html'), monthsJson: null, capturedAt: NOW, surrogateId: -2 })
    expect(r.status).toBe('not-selected')
  })
  it('tipo de cuenta desconocido queda en cuarentena, no se asume gratis', () => {
    const r = buildOfflineRow({ slug: 'x', html: html.replace(/(Free|PRO) Tipster/gi, 'Tipster'), monthsJson: months, capturedAt: NOW, surrogateId: -3 })
    expect(r.status).toBe('quarantine')
    expect((r as { reason: string }).reason).toContain('tipo-cuenta-desconocido')
  })
})
