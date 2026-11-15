import { describe, it, expect } from 'vitest'
import { fromDbTipster, fromTipstrrSnapshot } from '@/components/tipster-card-model'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'
import type { Tipster } from '@/db/schema'

// FABRICATED Blogabet DB row: only the shape matters, figures invented.
const BB_ROW: Tipster = {
  id: 7,
  slug: 'demo-bb',
  name: 'Demo BB',
  avatarUrl: null,
  flagUrl: null,
  countryCode: null,
  isPaid: true,
  price: '40.00',
  sinceYear: 2019,
  picks: 1234,
  profit: '567.80',
  yield: '12.34',
  verifiedPct: '95.50',
  isVerified: true,
  followers: 88,
  lastPickAt: null,
  resetCount: 2,
  lastResetAt: new Date('2025-01-15T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  picks6mAvg: '100.50',
  yield3m: '10.10',
  yield6m: '9.90',
  yield12m: '8.80',
  picksFree3mAvg: '12.00',
  yieldFree3m: '3.30',
  statsUpdatedAt: null,
}

describe('fromDbTipster (Blogabet parity)', () => {
  const c = fromDbTipster(BB_ROW)
  it('maps every field the row renders, preserving values', () => {
    expect(c.platform).toBe('blogabet')
    expect(c.sourceLabel).toBe('demo-bb.blogabet.com')
    expect(c.picks).toBe(1234)
    expect(c.profitDisplay).toBe('+568')
    expect(c.yieldPct).toBeCloseTo(12.34)
    expect(c.verifiedPct).toBeCloseTo(95.5)
    expect(c.followers).toBe(88)
    expect(c.isVerified).toBe(true)
    expect(c.isPaid).toBe(true)
    expect(c.priceLabel).toBe('40')
    expect(c.priceCurrencySuffix).toBe('€')
    expect(c.resetCount).toBe(2)
    expect(c.resetTitle).toContain('2 veces')
    expect(c.resetTitle).toContain('15/01/2025')
    expect(c.yield3m.valuePct).toBeCloseTo(10.1)
    expect(c.picks6mAvg).toBeCloseTo(100.5)
    expect(c.picksFree3mAvg).toBeCloseTo(12)
    expect(c.yieldFree3m).toBeCloseTo(3.3)
    expect(c.showPeriodRow).toBe(true)
    expect(c.capturedAt).toBeNull()
  })
  it('null verifiedPct stays null at model level (row shows 0% only on the BB path)', () => {
    const c2 = fromDbTipster({ ...BB_ROW, verifiedPct: null })
    expect(c2.verifiedPct).toBeNull()
    expect(c2.platform).toBe('blogabet')
  })
})

describe('fromTipstrrSnapshot (real captures)', () => {
  const t = fromTipstrrSnapshot(TLE_SNAPSHOT)
  it('computes periods from exact monthly figures with visible traces', () => {
    expect(t.platform).toBe('tipstrr')
    expect(t.yield3m.valuePct).toBeCloseTo(25.5, 1)
    expect(t.yield3m.complete).toBe(true)
    expect(t.yield3m.trace).toContain('+£816.00')
    expect(t.yield3m.trace).toContain('£3,200.00')
    expect(t.yield3m.trace).toContain('ago 2026 – oct 2026')
    expect(t.yield3m.trace).toContain('3/3 meses')
    expect(t.yield12m.trace).toContain('12/12 meses')
    // same unit in numerator and denominator: the division is checkable
    expect(t.yield3m.trace).toMatch(/\+£816\.00 beneficio \/ £3,200\.00 apostadas/)
    expect(t.yield3m.trace).not.toMatch(/\d+u apostadas/)
    expect(t.picks6mAvg).toBeCloseTo(703 / 6, 2)
    expect(t.picks6mTrace).toBe('703 tips / 6 meses')
  })
  it('marks provenance and never invents unavailable BB fields', () => {
    expect(t.capturedAt).toBe(TLE_SNAPSHOT.capturedAt)
    expect(t.verifiedPct).toBeNull()
    expect(t.followers).toBeNull()
    expect(t.isVerified).toBeNull()
    expect(t.picksFree3mAvg).toBeNull()
    expect(t.yieldFree3m).toBeNull()
    expect(t.isPaid).toBe(true)
    expect(t.priceLabel).toBe('£39')
    expect(t.sinceYear).toBe(2025)
    expect(t.sinceTitle).toContain('Alta de la cuenta')
  })
  it('StatMind: free, single closed month — indicators —, partial only in labeled trace', () => {
    const sm = fromTipstrrSnapshot(STATMIND_SNAPSHOT)
    expect(sm.isPaid).toBe(false)
    expect(sm.priceLabel).toBeNull()
    // an incomplete window never asserts the period in the indicator
    expect(sm.yield3m.complete).toBe(false)
    expect(sm.yield3m.valuePct).toBeNull()
    expect(sm.yield6m.valuePct).toBeNull()
    expect(sm.yield12m.valuePct).toBeNull()
    expect(sm.picks6mAvg).toBeNull()
    // the partial result stays visible, labeled as not-the-period
    expect(sm.yield3m.trace).toContain('ventana incompleta')
    expect(sm.yield3m.trace).toContain('-£179.20 beneficio / £980.00 apostadas')
    expect(sm.yield3m.trace).toContain('1/3 meses')
    expect(sm.picks6mTrace).toContain('ventana incompleta')
    expect(sm.profitDisplay).toBe('-£591.25')
  })
})
