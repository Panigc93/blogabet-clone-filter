import { describe, it, expect, afterEach } from 'vitest'
import { SQL, StringChunk } from 'drizzle-orm'
import {
  classifyAccess,
  verifiedAccessReviewEnabled,
  effectiveAccessSql,
  tipoCondition,
} from '@/lib/access-classification'
import { buildFilters } from '@/lib/query'
import { tipsters } from '@/db/schema'

// Walk a drizzle SQL tree into flat leaves (strings from StringChunks,
// raw params, column objects) for structural assertions without a DB.
function leaves(s: SQL): unknown[] {
  const out: unknown[] = []
  const walk = (c: unknown) => {
    if (c instanceof StringChunk) out.push(...c.value)
    else if (c instanceof SQL) c.queryChunks.forEach(walk)
    else if (Array.isArray(c)) c.forEach(walk)
    else out.push(c)
  }
  s.queryChunks.forEach(walk)
  return out
}
const textLeaves = (s: SQL) => leaves(s).filter((v): v is string => typeof v === 'string').join(' ')

afterEach(() => { delete process.env.VERIFIED_ACCESS_REVIEW })

describe('classifyAccess', () => {
  it('Blogabet: is_paid=true is Paid; is_paid=false is unclassified, never Free', () => {
    expect(classifyAccess({ platform: 'blogabet', isPaid: true })).toBe('paid')
    expect(classifyAccess({ platform: 'blogabet', isPaid: false })).toBeNull()
  })

  it('OLBG and Bettingexpert: Free by affirmative source policy; a stored paid flag stays unclassified', () => {
    expect(classifyAccess({ platform: 'olbg', isPaid: false })).toBe('free')
    expect(classifyAccess({ platform: 'bettingexpert', isPaid: false })).toBe('free')
    expect(classifyAccess({ platform: 'olbg', isPaid: true })).toBeNull()
    expect(classifyAccess({ platform: 'bettingexpert', isPaid: true })).toBeNull()
  })

  it('Tipstrr, Golazobets, Bet2Invest and Apuestes keep their stored boolean', () => {
    for (const platform of ['tipstrr', 'golazobets', 'bet2invest', 'apuestes']) {
      expect(classifyAccess({ platform, isPaid: true })).toBe('paid')
      expect(classifyAccess({ platform, isPaid: false })).toBe('free')
    }
  })

  it('a NULL stored flag (no captured evidence) is unclassified on source-labelled platforms', () => {
    for (const platform of ['tipstrr', 'golazobets', 'bet2invest', 'apuestes']) {
      expect(classifyAccess({ platform, isPaid: null })).toBeNull()
    }
  })
})

describe('verifiedAccessReviewEnabled', () => {
  it('is off unless VERIFIED_ACCESS_REVIEW=1', () => {
    expect(verifiedAccessReviewEnabled({})).toBe(false)
    expect(verifiedAccessReviewEnabled({ VERIFIED_ACCESS_REVIEW: '0' })).toBe(false)
    expect(verifiedAccessReviewEnabled({ VERIFIED_ACCESS_REVIEW: '1' })).toBe(true)
  })
})

describe('tipoCondition', () => {
  it('flag OFF: legacy boolean comparison (false for free, true for paid), no CASE', () => {
    // drizzle binds the comparison value as a Param-like leaf ({value})
    const paramValues = (s: SQL) => leaves(s).map(v => (v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v))
    const free = tipoCondition('free', tipsters.isPaid, {})
    expect(textLeaves(free)).not.toContain('CASE')
    expect(paramValues(free)).toContain(false)
    const paid = tipoCondition('paid', tipsters.isPaid, {})
    expect(paramValues(paid)).toContain(true)
  })

  it('flag ON: tri-state CASE comparison against the requested class', () => {
    const env = { VERIFIED_ACCESS_REVIEW: '1' }
    const free = textLeaves(tipoCondition('free', tipsters.isPaid, env))
    expect(free).toContain('CASE')
    expect(free).toContain('blogabet')
    const paramValues = (s: SQL) => leaves(s).map(v => (v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v))
    expect(paramValues(tipoCondition('free', tipsters.isPaid, env))).toContain('free')
    expect(paramValues(tipoCondition('paid', tipsters.isPaid, env))).toContain('paid')
  })

  it('effectiveAccessSql maps Blogabet false to NULL and OLBG/BE false to free', () => {
    const t = textLeaves(effectiveAccessSql())
    expect(t).toContain("WHEN")
    expect(t).toContain('blogabet')
    expect(t).toContain('olbg')
    expect(t).toContain('bettingexpert')
    expect(t).toContain('NULL')
  })
})

describe('buildFilters with the flag', () => {
  it('flag OFF keeps one legacy condition per tipo', () => {
    expect(buildFilters({ tipo: 'free' })).toHaveLength(1)
    expect(textLeaves(buildFilters({ tipo: 'free' })[0])).not.toContain('CASE')
  })

  it('flag ON keeps one condition per tipo, now tri-state', () => {
    process.env.VERIFIED_ACCESS_REVIEW = '1'
    const conds = buildFilters({ tipo: 'free' })
    expect(conds).toHaveLength(1)
    expect(textLeaves(conds[0])).toContain('CASE')
  })

  it('flag ON leaves tipo=all untouched (no access condition)', () => {
    process.env.VERIFIED_ACCESS_REVIEW = '1'
    expect(buildFilters({ tipo: 'all' })).toHaveLength(0)
  })
})
