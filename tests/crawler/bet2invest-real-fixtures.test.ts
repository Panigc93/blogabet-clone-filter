import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseProfilePage, monthlyClosesWithTotals } from '@/crawler/platforms/bet2invest/parse'

// REAL pages captured 2026-11-17 (anonymous), sanitized: no scripts, styles, images or classes.
// free-hydrated-kopf: DOM after client hydration (browser). pro-ssr-numerox: server HTML as plain curl
// receives it (monthly chart still the empty placeholder). No hydrated PRO fixture exists yet (pending gap).
const load = (n: string) => readFileSync(join(__dirname, '..', 'fixtures', 'bet2invest', n), 'utf8')

describe('Bet2Invest real fixtures', () => {
  it('Free hidratado (kopf): totales, 21 meses y cierre con la cabecera', () => {
    const p = parseProfilePage(load('free-hydrated-kopf.html'))
    expect(p.accountType).toBe('free')
    expect(p.statsScope).toBe('all_time')
    expect(p.settledBets).toBe(3475)
    expect(p.profitUnits).toBe(181.88)
    expect(p.monthlyAvailable).toBe(true)
    expect(p.monthly).toHaveLength(21)
    expect(p.monthly![0]).toEqual({ year: 2025, month: 3, bets: 70, profitUnits: -2.56 })
    expect(p.monthly![20]).toEqual({ year: 2026, month: 11, bets: 11, profitUnits: 8.96 })
    expect(monthlyClosesWithTotals(p)).toBe(true)
    expect(p.subscribePrice ?? null).toBeNull()
  })
  it('PRO en HTML de servidor (numerox): mensual y precio ausentes por la via, subscribers separados', () => {
    const p = parseProfilePage(load('pro-ssr-numerox.html'))
    expect(p.accountType).toBe('pro')
    expect(p.monthlyAvailable).toBe(false)
    expect(p.monthly ?? null).toBeNull()
    expect(monthlyClosesWithTotals(p)).toBe(false)
    expect(p.subscribePrice ?? null).toBeNull()
    expect(p.audience.subscribers).toBe(21)
    expect(p.audience.followers).toBe(1140)
  })
})
