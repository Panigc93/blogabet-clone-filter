import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMonthsResponse, monthsCloseWithTotals, extractProfileIds, monthsUrl } from '@/crawler/platforms/bet2invest/api-months'

// REAL responses captured 2026-11-17 (anonymous GET, plain curl, 200): kopf (Free), NumeroX (PRO).
const f = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', 'bet2invest', n), 'utf8')
const json = (n: string) => JSON.parse(f(n))

describe('Bet2Invest months API (real fixtures)', () => {
  it('Free kopf: 21 meses, cierra con cabecera 3475 / +181.88, roi = profit/stake', () => {
    const m = parseMonthsResponse(json('api-months-kopf.json'))!
    expect(m).toHaveLength(21)
    expect(monthsCloseWithTotals(m, 3475, 181.88)).toBe(true)
    for (const r of m) expect(Math.abs(r.yieldPct! - r.roiPct!)).toBeLessThan(1e-9)
    expect(m[0]).toMatchObject({ year: 2026, month: 11, bets: 11, stakeUnits: 67 })
  })
  it('PRO NumeroX: 35 meses con huecos de meses sin apuestas, cierra 750 / +211.72', () => {
    const m = parseMonthsResponse(json('api-months-numerox.json'))!
    expect(m).toHaveLength(35)
    expect(monthsCloseWithTotals(m, 750, 211.72)).toBe(true)
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
})
