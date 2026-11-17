import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMonthsResponse, monthsCloseWithTotals, extractProfileIds, monthsUrl, windowYield, isCurrentMonth } from '@/crawler/platforms/bet2invest/api-months'
import { auditPacing } from '@/crawler/platforms/bet2invest/pacing-audit'

// REAL responses captured 2026-11-17 (anonymous GET, plain curl, 200): kopf (Free), NumeroX (PRO).
const f = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', 'bet2invest', n), 'utf8')
const json = (n: string) => JSON.parse(f(n))

describe('Bet2Invest months API (real fixtures)', () => {
  it('Free kopf: 21 meses, cierra con cabecera 3475 / +181.88, roi = profit/stake', () => {
    const m = parseMonthsResponse(json('api-months-kopf.json'))!
    expect(m).toHaveLength(21)
    expect(monthsCloseWithTotals(m, 3475, 181.88, 'rounded2')).toBe(true)
    for (const r of m) expect(Math.abs(r.yieldPct! - r.roiPct!)).toBeLessThan(1e-9)
    expect(m[0]).toMatchObject({ year: 2026, month: 11, bets: 11, stakeUnits: 67 })
  })
  it('PRO NumeroX: 35 meses con huecos de meses sin apuestas, cierra 750 / +211.72', () => {
    const m = parseMonthsResponse(json('api-months-numerox.json'))!
    expect(m).toHaveLength(35)
    expect(monthsCloseWithTotals(m, 750, 211.72, 'rounded2')).toBe(true)
    for (const r of m) expect(Math.abs(r.yieldPct! - r.roiPct!)).toBeLessThan(1e-9)
    expect(m.some((r) => r.year === 2026 && r.month === 6)).toBe(false)
  })
  it('rechaza series mal formadas o duplicadas y trata stake 0 como yield null', () => {
    expect(parseMonthsResponse({})).toBeNull()
    expect(parseMonthsResponse([{ key: '2026-11-03', value: { betsNumber: 1, profit: 1 } }])).toBeNull()
    const row = { key: '2026-11-03', value: { betsNumber: 1, profit: 1, averageUnits: 1 } }
    expect(parseMonthsResponse([row, row])).toBeNull()
    const z = parseMonthsResponse([{ key: '2026-11-03', value: { betsNumber: 0, profit: 0, averageUnits: 0 } }])!
    expect(z[0].yieldPct).toBeNull()
    expect(z[0].roiPct).toBeNull()
  })
  it('extrae ids del payload Nuxt del HTML de servidor (curl) sin adivinar', () => {
    expect(extractProfileIds(f('ssr-payload-kopf.html'))).toMatchObject({ userId: 12962, publicBankrollId: 2355, username: 'kopf', lastBetAt: '2026-11-08T08:47:41.521Z' })
    expect(extractProfileIds(f('ssr-payload-numerox.html'))).toMatchObject({ userId: 372, publicBankrollId: 24147, username: 'NumeroX' })
    expect(extractProfileIds('<html></html>')).toBeNull()
  })
  it('construye la URL observada', () => {
    expect(monthsUrl({ userId: 12962, publicBankrollId: 2355 })).toBe('https://api.bet2invest.com/v1/statistics/12962/summary/months/guest?bankrollId=2355&onlyImportedBets=false')
    expect(() => monthsUrl({ userId: 0, publicBankrollId: 1 })).toThrow()
  })

  it('puerta de totales: rounded2 acepta redondeo de cabecera, full solo ruido de coma flotante', () => {
    const m = parseMonthsResponse(json('api-months-kopf.json'))!
    expect(monthsCloseWithTotals(m, 3475, 181.88, 'rounded2')).toBe(true)
    expect(monthsCloseWithTotals(m, 3475, 181.88, 'full')).toBe(false) // 181.881 vs 181.88 no es precision completa
    expect(monthsCloseWithTotals(m, 3475, m.reduce((a, r) => a + r.profitUnits, 0), 'full')).toBe(true)
    expect(monthsCloseWithTotals(m, 3475, 181.9, 'rounded2')).toBe(false) // 0.019 de desajuste
    expect(monthsCloseWithTotals(m, 3475, 181.887, 'rounded2')).toBe(false) // 0.006 > 0.005
    expect(monthsCloseWithTotals(m, 3474, 181.88, 'rounded2')).toBe(false) // apuestas exactas
  })
  it('yield por ventana = suma(profit)/suma(stake), no media de yields mensuales; mes en curso excluido', () => {
    const m = parseMonthsResponse(json('api-months-kopf.json'))!
    const now = new Date('2026-11-17T10:00:00Z')
    expect(isCurrentMonth(m[0], now)).toBe(true)
    const w = windowYield(m, now)
    expect(w.excludedPartialMonth).toBe(true)
    expect(w.months).toBe(20)
    const sp = m.slice(1).reduce((a, r) => a + r.profitUnits, 0)
    const ss = m.slice(1).reduce((a, r) => a + r.stakeUnits, 0)
    expect(w.yieldPct).toBeCloseTo((100 * sp) / ss, 9)
    const meanOfMonthly = m.slice(1).reduce((a, r) => a + r.yieldPct!, 0) / 20
    expect(Math.abs(w.yieldPct! - meanOfMonthly)).toBeGreaterThan(0.01) // son cosas distintas en estos datos
    expect(windowYield(m, now, true).months).toBe(21)
    expect(windowYield([], now).yieldPct).toBeNull()
  })
  it('auditoria de ritmo sobre logs reales: el lote de 30 tiene un primer intervalo de 8 s; el resto prueba >=10 s con marcas de 1 s', () => {
    const rows = f('curl-30-log.tsv').trim().split('\n').map((l) => l.split('\t')[0])
    const a = auditPacing(rows, 10) // con marcas de 1 s solo se puede probar >=10 s; los >=10,6 s son por construccion (sleep), no por log
    expect(rows).toHaveLength(30)
    expect(a.ok).toBe(false)
    expect(a.violations).toEqual([{ index: 1, gapSeconds: 8 }])
    expect(auditPacing(rows.slice(1), 10).ok).toBe(true)
    expect(auditPacing(rows.slice(1), 10.6).ok).toBe(false) // el log no prueba 10,6 s
    const api = f('api-months-capture-log.tsv').trim().split('\n').map((l) => l.split('\t')[0])
    expect(auditPacing(api, 11).ok).toBe(true)
    expect(() => auditPacing(['x'], 1)).toThrow()
    expect(() => auditPacing(['2026-11-17T09:00:10Z', '2026-11-17T09:00:00Z'], 1)).toThrow()
  })
})
