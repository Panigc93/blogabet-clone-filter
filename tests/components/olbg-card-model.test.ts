import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseOlbgPerformance } from '../../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../../crawler/platforms/olbg/prepare'
import { normalizeOlbg } from '../../crawler/platforms/olbg/normalize'
import { fromOlbgPrepared } from '../../components/olbg-card-model'
const profile = (id: number) => {
  const load = (mode: string) => {
    const f = JSON.parse(readFileSync(new URL(`../fixtures/olbg/profile-${id}-${mode}.json`, import.meta.url), 'utf8'))
    return parseOlbgPerformance(f.node, f.originalReceipt, id, '2026-11')
  }
  return prepareOlbgProfile(load('month'), load('table-1'), load('table-2'))
}
describe('OLBG local shared-contract adaptation', () => {
  it('retains source monthly ROI separately from derived closed windows', () => {
    const n = normalizeOlbg(profile(565069))
    expect(n.platform).toBe('olbg')
    expect(n.samples.find(x => x.scopeKey === '2026-05')).toMatchObject({ yieldPct: 40, yieldBasis: 'unknown' })
    const six = n.samples.find(x => x.scopeKey === '6m')!
    expect(six.yieldPct).toBeNull()
    expect(six.derivedYield).toMatchObject({ approximate: true, denominatorUnits: 1337, fromMonth: '2026-05', throughMonth: '2026-10', missingMonths: [] })
    expect(six.derivedYield!.valuePct).toBeCloseTo(33.03739715781601)
    expect(n.samples.some(x => x.scope === 'all_time')).toBe(false)
  })
  it('uses existing card periods without turning a window into all-time stats', () => {
    const p = profile(565069); const card = fromOlbgPrepared(p)
    expect(card).toMatchObject({ platform: 'olbg', picks: null, profitDisplay: null, yieldPct: null, followers: null, verifiedPct: null })
    expect(card.yield6m).toMatchObject({ valuePct: p.summaries[1].derivedLevelStakesYieldPct, complete: true, note: undefined })
    expect(card.picks6mAvg).toBeCloseTo(1337 / 6)

  })
  it('preserves missing periods and their explanation in existing period cells', () => {
    const p = profile(342919); const n = normalizeOlbg(p); const card = fromOlbgPrepared(p)
    expect(n.samples.find(x => x.scopeKey === '6m')!.derivedYield).toMatchObject({ valuePct: null, denominatorUnits: null, missingMonths: ['2026-06'] })
    expect(card.yield6m).toMatchObject({ valuePct: null, complete: false })
    expect(card.yield6m.trace).toContain('2026-06')
    expect(card.picks6mAvg).toBeNull()
    expect(card.yield3m.valuePct).toBe(6)
  })
})
