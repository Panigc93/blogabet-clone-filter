import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseBet2earnProfile,
  parseBet2earnHistory,
  aggregateMonths,
  consolidateBet2earnCapture,
} from '@/crawler/platforms/bet2earn/parse'

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/bet2earn', n), 'utf8'))

describe('parseBet2earnProfile', () => {
  it('parses a real premium profile payload', () => {
    const p = parseBet2earnProfile(fx('profile-andreaskloft.json'))!
    expect(p.name).toBe('ANDREASKLOFT WINAMAX')
    expect(p.tipsExpiredCount).toBe(10)
    expect(p.yield).toBe(2.2)
    expect(p.avatar).toBe('/storage/user/avatar/6abf92e2424dc.png')
    expect(p.created_at).toBe('2026-10-02 11:11:01')
  })
  it('keeps the default-avatar marker (not a real photo) and null yield', () => {
    const p = parseBet2earnProfile(fx('profile-fabian.json'))!
    expect(p.avatar).toBe('/images/avatar-default.jpg')
    expect(p.tipsExpiredCount).toBe(7)
  })
  it('rejects payloads without users.id/name', () => {
    expect(parseBet2earnProfile({})).toBeNull()
    expect(parseBet2earnProfile({ users: { id: 'x' } })).toBeNull()
    expect(parseBet2earnProfile('nope')).toBeNull()
  })
})

describe('parseBet2earnHistory', () => {
  it('parses a real history and keeps per-pick figures', () => {
    const picks = parseBet2earnHistory(fx('history-fabian.json'))!
    expect(picks).toHaveLength(7)
    expect(picks[0].created_at).toBe('2025-03-16 01:03:00')
    expect(picks[0].profit).toBe(-1)
    expect(picks[0].stake).toBe(1)
  })
  it('an empty tipsFullExpired array parses as empty, not null', () => {
    expect(parseBet2earnHistory({ tipsFullExpired: [] })).toEqual([])
  })
  it('rejects a poisoned payload (one pick without id)', () => {
    expect(parseBet2earnHistory({ tipsFullExpired: [{ id: 'a' }, { profit: 1 }] })).toBeNull()
    expect(parseBet2earnHistory({})).toBeNull()
  })
})

describe('aggregateMonths', () => {
  it('buckets by created_at month (publication date), the site criterion', () => {
    const picks = parseBet2earnHistory(fx('history-andreaskloft.json'))!
    const agg = aggregateMonths(picks)!
    expect(agg.months['2026-10'].picks).toBe(6)
    expect(agg.months['2026-10'].profit).toBeCloseTo(0.58, 10)
    expect(agg.months['2026-10'].stakes).toBe(6)
    expect(agg.months['2026-11'].picks).toBe(4)
    expect(agg.lastPickAt).toBe('2026-11-14 22:30:23')
  })
  it('refuses aggregation when any pick lacks created_at', () => {
    const picks = parseBet2earnHistory(fx('history-fabian.json'))!
    picks[3].created_at = null
    expect(aggregateMonths(picks)).toBeNull()
  })
})

describe('consolidateBet2earnCapture', () => {
  it('builds a complete row for a real profile', () => {
    const row = consolidateBet2earnCapture({
      slug: 'fabian rivero',
      capturedAt: '2026-11-21T05:00:00Z',
      listSource: 'free',
      profileBody: fx('profile-fabian.json'),
      historyBody: fx('history-fabian.json'),
    })
    expect(row.quarantine).toBeNull()
    expect(row.expiredPicks).toBe(7)
    expect(row.totals!.stakes).toBe(7)
    expect(row.months['2025-03'].picks).toBe(7)
    expect(row.lastPickAt).toBe('2025-03-16 01:03:00')
  })
  it('quarantines a slug/profile name mismatch instead of correcting it', () => {
    const row = consolidateBet2earnCapture({
      slug: 'otro nombre',
      capturedAt: '2026-11-21T05:00:00Z',
      listSource: 'free',
      profileBody: fx('profile-fabian.json'),
      historyBody: fx('history-fabian.json'),
    })
    expect(row.quarantine).not.toBeNull()
  })
  it('quarantines an unparseable payload', () => {
    const row = consolidateBet2earnCapture({
      slug: 'fabian rivero',
      capturedAt: '2026-11-21T05:00:00Z',
      listSource: 'free',
      profileBody: { status: 'Forbidden' },
      historyBody: fx('history-fabian.json'),
    })
    expect(row.quarantine).not.toBeNull()
    expect(row.totals).toBeNull()
  })
})
