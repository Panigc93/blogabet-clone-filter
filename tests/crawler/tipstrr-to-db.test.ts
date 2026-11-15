import { describe, it, expect } from 'vitest'
import { tipstrrSnapshotToInsert } from '@/crawler/platforms/tipstrr/to-db'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'

describe('tipstrrSnapshotToInsert', () => {
  // TLE portfolioId 221629: real, from the captured per-tip object
  // (2026-11-15). Negative-space convention keeps BB and Tipstrr ids apart.
  const tle = tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id: -221629,
    slug: 'the-least-expected',
    subscriptionPriceGbp: 39,
    isPaid: true,
  })
  const statmind = tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, {
    id: -999999, // fabricated for the test only; StatMind's portfolioId not captured
    slug: 'statmind',
    subscriptionPriceGbp: null,
    isPaid: false,
  })

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

  it('stores all-time yield only when the record is fully consistent', () => {
    expect(tle.yield).toBe('18.33')
    expect(statmind.yield).toBe('-20.32')
    const broken = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, consistency: [{ name: 'x', passed: false }] },
      { id: -1, slug: 'x', isPaid: true }
    )
    expect(broken.yield).toBeNull()
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
