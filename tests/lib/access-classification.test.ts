import { describe, it, expect, afterEach } from 'vitest'
import { SQL, StringChunk } from 'drizzle-orm'
import {
  classifyAccess,
  verifiedAccessReviewEnabled,
  effectiveAccessSql,
  effectivePriceSql,
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
  it('Blogabet (regla Juan 2026-11-20): pago exige evidencia afirmativa; el resto es Free', () => {
    // Unread rows: the parsed listing price is affirmative paid evidence;
    // stored false stays Free (no longer excluded as unknown).
    expect(classifyAccess({ platform: 'blogabet', isPaid: true })).toBe('paid')
    expect(classifyAccess({ platform: 'blogabet', isPaid: false })).toBe('free')
  })

  it('Blogabet: an observed profile signal wins over the listing boolean', () => {
    const at = new Date('2026-11-20T17:00:00Z')
    // Affirmative free banner on a live non-verified blog.
    expect(classifyAccess({ platform: 'blogabet', isPaid: false, accessClass: 'free', accessObservedAt: at })).toBe('free')
    // SERVICE FULL: stored is_paid=false, but the profile shows a paid service.
    expect(classifyAccess({ platform: 'blogabet', isPaid: false, accessClass: 'paid', accessObservedAt: at })).toBe('paid')
    // Fresh profile read overrides a stale listing price both ways.
    expect(classifyAccess({ platform: 'blogabet', isPaid: true, accessClass: 'free', accessObservedAt: at })).toBe('free')
    // Observed profile with NO paid signal: Free by the product rule,
    // even if the stored boolean says paid (stale).
    expect(classifyAccess({ platform: 'blogabet', isPaid: true, accessClass: null, accessEvidence: 'no-signal', accessObservedAt: at })).toBe('free')
    // Dead blog: neither paid nor a live free service; unclassified
    // (internal evidence kept) pending the dead-cleanup decision.
    expect(classifyAccess({ platform: 'blogabet', isPaid: true, accessClass: null, accessEvidence: 'blog-not-found', accessObservedAt: at })).toBeNull()
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

  it('flag ON: effective CASE comparison against the requested class', () => {
    const env = { VERIFIED_ACCESS_REVIEW: '1' }
    const free = textLeaves(tipoCondition('free', tipsters.isPaid, env))
    expect(free).toContain('CASE')
    expect(free).toContain('blogabet')
    const paramValues = (s: SQL) => leaves(s).map(v => (v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v))
    expect(paramValues(tipoCondition('free', tipsters.isPaid, env))).toContain('free')
    expect(paramValues(tipoCondition('paid', tipsters.isPaid, env))).toContain('paid')
  })

  it('effectiveAccessSql maps Blogabet false to free and OLBG/BE false to free; only blog-not-found is NULL', () => {
    const t = textLeaves(effectiveAccessSql())
    expect(t).toContain("WHEN")
    expect(t).toContain('blogabet')
    expect(t).toContain('olbg')
    expect(t).toContain('bettingexpert')
    expect(t).toContain('NULL')
  })

  it('effectiveAccessSql consumes the stored profile signal before the listing fallback', () => {
    const columnNames = (s: SQL) => leaves(s).map(v => (v && typeof v === 'object' && 'name' in v ? (v as { name: unknown }).name : v))
    const names = columnNames(effectiveAccessSql())
    expect(names).toContain('access_class')
    expect(names).toContain('access_observed_at')
    const t = textLeaves(effectiveAccessSql())
    // Profile-signal WHENs come before the legacy is_paid fallback WHEN.
    expect(t.indexOf("'free'")).toBeLessThan(t.indexOf('IS NOT NULL'))
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

describe('effectivePriceSql (precio efectivo bajo la señal)', () => {
  it('observed rows use access_price; unread rows and other platforms keep stored price', () => {
    const text = textLeaves(effectivePriceSql())
    expect(text).toContain('CASE')
    expect(text).toContain('IS NOT NULL')
    const cols = leaves(effectivePriceSql()).filter((v): v is { name: string } => typeof v === 'object' && v !== null && 'name' in (v as object)).map(c => c.name)
    expect(cols).toContain('access_price')
    expect(cols).toContain('price')
    expect(cols).toContain('access_observed_at')
    expect(cols).toContain('platform')
  })

  it('price filter flag ON: paid by effective signal, range over effective price (no stale is_paid/price)', () => {
    process.env.VERIFIED_ACCESS_REVIEW = '1'
    const conds = buildFilters({ platform: 'blogabet', tipo: 'all', priceMin: 50 })
    const text = textLeaves(conds[0]!) + ' ' + conds.slice(1).map(c => textLeaves(c!)).join(' ')
    const allCols = conds.flatMap(c => leaves(c!)).filter((v): v is { name: string } => typeof v === 'object' && v !== null && 'name' in (v as object)).map(c => c.name)
    expect(allCols).toContain('access_price')
    expect(allCols).toContain('access_class')
    expect(allCols).toContain('price_currency')
  })

  it('price filter flag OFF: legacy is_paid=true + stored price', () => {
    const conds = buildFilters({ platform: 'blogabet', tipo: 'all', priceMin: 50 })
    const allCols = conds.flatMap(c => leaves(c!)).filter((v): v is { name: string } => typeof v === 'object' && v !== null && 'name' in (v as object)).map(c => c.name)
    expect(allCols).toContain('is_paid')
    expect(allCols).toContain('price')
    expect(allCols).not.toContain('access_price')
  })
})
