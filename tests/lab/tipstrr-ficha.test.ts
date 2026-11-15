import { describe, it, expect } from 'vitest'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'
import { computeExactPeriodStats } from '@/crawler/platforms/tipstrr/periods'
import { parseMoneyLabel } from '@/crawler/platforms/tipstrr/stats-state'

// Concordance proof for the lab ficha: the exact monthly figures the period
// computation uses must reconcile with (a) the display month rows the user
// sees in the table, and (b) the all-time overview figures — so what the UI
// shows is what the math sums, with no constants simulating the calc.

describe('lab ficha concordance (TLE real capture)', () => {
  const s = TLE_SNAPSHOT
  const cutoff = new Date(s.capturedAtDate)

  it('monthState reconciles with the displayed month rows (tips and profit)', () => {
    const MES: Record<string, number> = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12 }
    expect(s.monthState).toHaveLength(s.months.length)
    for (const m of s.months) {
      const [mes, anio] = m.label.split(' ')
      const st = s.monthState.find((r) => r.year === Number(anio) && r.month === MES[mes])
      expect(st, `monthState row for ${m.label}`).toBeDefined()
      expect(st!.tips).toBe(m.tips)
      // display profit is in € at 10/10=10 € (unit normalization); monthState profit is in units
      expect(st!.profit * 10).toBeCloseTo(parseMoneyLabel(m.profitLabel)!, 1)
    }
  })

  it('monthState sums close exactly with the all-time overview', () => {
    const tips = s.monthState.reduce((a, r) => a + r.tips, 0)
    const profit = s.monthState.reduce((a, r) => a + r.profit, 0)
    expect(tips).toBe(s.overview.tips)
    expect(profit * 10).toBeCloseTo(parseMoneyLabel(s.overview.profitDisplay!)!, 1)
  })

  it('computed periods match the verified figures with explicit coverage', () => {
    const p = computeExactPeriodStats(s.monthState, cutoff)
    expect(p.yield3m!.yieldPct).toBeCloseTo(25.5, 1)
    expect(p.yield3m!.complete).toBe(true)
    expect(p.yield3m!.from).toBe('2026-08')
    expect(p.yield3m!.to).toBe('2026-10')
    expect(p.yield6m!.yieldPct).toBeCloseTo(21.0, 1)
    expect(p.yield6m!.from).toBe('2026-05')
    expect(p.yield12m!.yieldPct).toBeCloseTo(21.7, 1)
    expect(p.yield12m!.from).toBe('2025-11')
    expect(p.yield12m!.months).toBe(12)
    expect(p.picks6mAvg).toBeCloseTo(703 / 6, 2)
  })
})

describe('lab ficha concordance (StatMind real capture)', () => {
  it('one closed month only: windows flagged incomplete, never zero-filled', () => {
    const p = computeExactPeriodStats(STATMIND_SNAPSHOT.monthState, new Date(STATMIND_SNAPSHOT.capturedAtDate))
    expect(p.yield3m!.months).toBe(1)
    expect(p.yield3m!.complete).toBe(false)
    expect(p.yield3m!.yieldPct).toBeCloseTo((-17.92 / 98) * 100, 2)
    expect(p.yield12m!.complete).toBe(false)
  })
})
