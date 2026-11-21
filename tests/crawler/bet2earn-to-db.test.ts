import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bet2earnRowToInsert,
  publishedYieldTolerance,
  publishedYieldMatches,
  completeMonthWindow,
  mergeBet2earnUpdate,
  assertBet2earnImportProvenance,
} from '@/crawler/platforms/bet2earn/to-db'
import { consolidateBet2earnCapture } from '@/crawler/platforms/bet2earn/parse'
import type { Bet2earnCaptureRow } from '@/crawler/platforms/bet2earn/types'

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/bet2earn', n), 'utf8'))
const OPTS = { id: 0, idSource: 'internal-transactional' as const, slug: 'x' }

function realRow(slug: string, listSource: 'premium' | 'free'): Bet2earnCaptureRow {
  const base = slug === 'fabian rivero' ? 'fabian' : 'andreaskloft'
  const row = consolidateBet2earnCapture({
    slug,
    capturedAt: '2026-11-21T05:00:00Z',
    listSource,
    profileBody: fx(`profile-${base}.json`),
    historyBody: fx(`history-${base}.json`),
  })
  row.sourceUrl = `https://bet2earn.com/api/user/${slug}`
  return row
}

describe('published yield tolerance derives from its own precision', () => {
  it('integer-published admits the uniform rounding interval +-0.5', () => {
    expect(publishedYieldTolerance(15)).toBe(0.5)
    expect(publishedYieldMatches(-76, '-76.14')).toBe(true) // real fabian case
    expect(publishedYieldMatches(15, '15.50')).toBe(true)
    expect(publishedYieldMatches(15, '15.51')).toBe(false)
  })
  it('decimal-published admits only +-half its last decimal', () => {
    expect(publishedYieldTolerance(2.2)).toBeCloseTo(0.05)
    expect(publishedYieldTolerance(10.74)).toBeCloseTo(0.005)
    expect(publishedYieldMatches(10.74, '6.16')).toBe(false) // real testweb case
  })
  it('no published yield means no cross-check, not a pass mark', () => {
    expect(publishedYieldMatches(null, '-76.14')).toBe(true)
  })
})

describe('completeMonthWindow', () => {
  it('a 2026-11-21 capture covers 2025-11..2026-10 for 12m', () => {
    const w = completeMonthWindow('2026-11-21T05:00:00Z', 12)
    expect(w.from).toBe('2025-11')
    expect(w.through).toBe('2026-10')
    expect(w.keys).toHaveLength(12)
    expect(w.keys).not.toContain('2026-11') // current month excluded
  })
  it('3m covers 2026-08..2026-10', () => {
    expect(completeMonthWindow('2026-11-21T05:00:00Z', 3).keys).toEqual(['2026-08', '2026-09', '2026-10'])
  })
})

describe('bet2earnRowToInsert real cases', () => {
  it('maps a real free profile with exact computed yield and NULL windows without picks', () => {
    const m = bet2earnRowToInsert(realRow('fabian rivero', 'free'), { ...OPTS, slug: 'fabian rivero' })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.insert.platform).toBe('bet2earn')
    expect(m.insert.picks).toBe(7)
    expect(m.insert.profit).toBe('-5.330')
    expect(m.insert.yield).toBe((-5.33 / 7 * 100).toFixed(2)) // -76.14, published -76 inside +-0.5
    expect(m.insert.isPaid).toBe(false)
    expect(m.insert.avatarUrl).toBeNull() // default avatar is not a real photo
    expect(m.insert.lastPickAt!.toISOString()).toBe('2025-03-16T01:03:00.000Z')
    expect(m.insert.yield3m).toBeNull() // no picks in the windows: true empty, never 0
    expect(m.insert.yield6m).toBeNull()
    expect(m.insert.yield12m).toBeNull()
    expect(m.insert.picks6mAvg).toBeNull()
    expect(m.insert.sinceYear).toBe(2023)
  })
  it('maps a real premium profile with a real 3m window from created_at months', () => {
    const m = bet2earnRowToInsert(realRow('andreaskloft winamax', 'premium'), { ...OPTS, slug: 'andreaskloft winamax' })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.insert.isPaid).toBe(true)
    expect(m.insert.picks).toBe(10)
    expect(m.insert.yield).toBe('2.20')
    expect(m.insert.avatarUrl).toBe('https://bet2earn.com/storage/user/avatar/6abf92e2424dc.png')
    // capture 2026-11-21: 3m = 2026-08..2026-10 -> only the 2026-10 picks
    expect(m.insert.yield3m).toBe((0.58 / 6 * 100).toFixed(2))
    expect(m.insert.yield6m).toBe(m.insert.yield3m)
    expect(m.insert.yield12m).toBe(m.insert.yield3m)
    expect(m.insert.picks6mAvg).toBe('1.00') // 6 picks / 6 months
    expect(m.insert.sourcePortfolioId).toBeNull() // UUID does not fit the integer column
  })
})

describe('bet2earnRowToInsert holds', () => {
  const held = (row: Bet2earnCaptureRow) => {
    const m = bet2earnRowToInsert(row, OPTS)
    expect(m.ok).toBe(false)
    return m as { ok: false; klass: string; reason: string }
  }
  it('holds an empty history: never imported as a real zero', () => {
    const row = realRow('fabian rivero', 'free')
    row.expiredPicks = 0
    row.months = {}
    row.totals = { picks: 0, profit: 0, stakes: 0 }
    expect(held(row).klass).toBe('cuarentena[no-usable-content]')
  })
  it('holds a history shorter than the declared tipsExpiredCount', () => {
    const row = realRow('fabian rivero', 'free')
    row.profile!.tipsExpiredCount = 8
    expect(held(row).klass).toBe('cuarentena[history-incomplete]')
  })
  it('holds a published yield outside its own rounding interval', () => {
    const row = realRow('fabian rivero', 'free')
    row.profile!.yield = 6 // computed -76.14: real GALAICO_OUTBET1 shape
    expect(held(row).klass).toBe('cuarentena[yield-out-of-interval]')
  })
  it('holds picks with zero total stakes as inconsistency, never null yield', () => {
    const row = realRow('fabian rivero', 'free')
    row.totals = { picks: 7, profit: 1, stakes: 0 }
    expect(held(row).klass).toBe('cuarentena[capture-inconsistency]')
  })
  it('respects a capture-time quarantine', () => {
    const row = realRow('fabian rivero', 'free')
    row.quarantine = { reason: '404 at capture' }
    expect(held(row).klass).toBe('cuarentena[capture]')
  })
})

describe('provenance and merge contract', () => {
  it('rejects isolated-fixture ids for real imports', () => {
    expect(() => assertBet2earnImportProvenance('isolated-fixture', 'x')).toThrow()
    expect(() => assertBet2earnImportProvenance('internal-transactional', 'x')).not.toThrow()
  })
  it('merge overwrites managed columns and keeps identity immutable', () => {
    const a = bet2earnRowToInsert(realRow('fabian rivero', 'free'), { id: 5, idSource: 'internal-transactional', slug: 'fabian rivero' })
    const b = bet2earnRowToInsert(realRow('fabian rivero', 'free'), { id: 0, idSource: 'internal-transactional', slug: 'fabian rivero' })
    if (!a.ok || !b.ok) throw new Error('fixture rows must map')
    const merged = mergeBet2earnUpdate(a.insert, { ...b.insert, followers: 99 })
    expect(merged.id).toBe(5)
    expect(merged.followers).toBe(99)
    expect(merged.platform).toBe('bet2earn')
  })
})
