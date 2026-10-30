import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { parseListParams } from '@/lib/parseFilters'
import { buildFilters, sortOrder } from '@/lib/query'
import { toCsv, TIPSTER_CSV_COLUMNS } from '@/lib/csv'
import { parseCompareSlugs, COMPARE_MAX } from '@/lib/compare'
import { Tipster } from '@/db/schema'

const dialect = new PgDialect()

function sqlOf(chunk: unknown): string {
  return dialect.sqlToQuery(chunk as Parameters<PgDialect['sqlToQuery']>[0]).sql
}

describe('parseListParams - dir', () => {
  it('defaults to desc when missing or invalid', () => {
    expect(parseListParams({}).dir).toBe('desc')
    expect(parseListParams({ dir: 'down' }).dir).toBe('desc')
    expect(parseListParams({ dir: '' }).dir).toBe('desc')
    expect(parseListParams({ dir: 'DESC' }).dir).toBe('desc')
  })

  it('accepts asc', () => {
    expect(parseListParams({ dir: 'asc' }).dir).toBe('asc')
  })
})

describe('parseListParams - verified', () => {
  it('is true only for verified=1', () => {
    expect(parseListParams({ verified: '1' }).filters.verified).toBe(true)
    expect(parseListParams({ verified: 'true' }).filters.verified).toBe(false)
    expect(parseListParams({}).filters.verified).toBe(false)
  })
})

describe('buildFilters - verified', () => {
  it('adds an is_verified condition only when enabled', () => {
    expect(buildFilters({ verified: true })).toHaveLength(1)
    expect(buildFilters({ verified: false })).toHaveLength(0)
    expect(buildFilters({})).toHaveLength(0)
    const [cond] = buildFilters({ verified: true })
    expect(sqlOf(cond)).toContain('is_verified')
  })
})

describe('sortOrder - direction', () => {
  it('keeps the exact legacy SQL by default (desc)', () => {
    const [main, tie] = sortOrder('yield')
    expect(sqlOf(main)).toBe('"tipsters"."yield" DESC NULLS LAST')
    expect(sqlOf(tie)).toBe('"tipsters"."id" DESC')
  })

  it('supports ascending order with a matching tiebreaker', () => {
    const [main, tie] = sortOrder('price', 'asc')
    expect(sqlOf(main)).toBe('"tipsters"."price" ASC NULLS LAST')
    expect(sqlOf(tie)).toBe('"tipsters"."id" ASC')
  })
})

describe('toCsv', () => {
  const base: Tipster = {
    id: 1, slug: 'alpha', name: 'Alpha', avatarUrl: null, flagUrl: null, countryCode: null,
    isPaid: false, price: null, sinceYear: 2019, picks: 250, profit: '1234.50', yield: '11.00',
    verifiedPct: '98.00', isVerified: true, followers: 42, lastPickAt: null,
    resetCount: 0, lastResetAt: null, updatedAt: new Date('2026-01-01T00:00:00Z'),
    picks6mAvg: '20.00', yield3m: '5.50', yield6m: null, yield12m: null,
    picksFree3mAvg: null, yieldFree3m: null, statsUpdatedAt: new Date('2026-10-01T00:00:00Z'),
  }

  it('writes headers and one line per row, nulls as empty cells', () => {
    const csv = toCsv([base])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(TIPSTER_CSV_COLUMNS.map(c => c.header).join(','))
    expect(lines).toHaveLength(2)
    const cells = lines[1].split(',')
    expect(cells[0]).toBe('Alpha')
    expect(cells[1]).toBe('alpha')
    expect(cells[2]).toBe('https://alpha.blogabet.com')
    // yield_6m is null -> empty cell
    const idx6m = TIPSTER_CSV_COLUMNS.findIndex(c => c.header === 'yield_6m')
    expect(cells[idx6m]).toBe('')
  })

  it('escapes commas, quotes and newlines', () => {
    const tricky = { ...base, name: 'López, "El" \nMejor' }
    const csv = toCsv([tricky])
    expect(csv).toContain('"López, ""El"" \nMejor"')
  })

  it('does not include columns not visible in the UI data model', () => {
    const headers = TIPSTER_CSV_COLUMNS.map(c => c.header)
    expect(headers).not.toContain('id')
    expect(headers).not.toContain('avatar_url')
    expect(headers).not.toContain('last_pick_at')
  })
})

describe('parseCompareSlugs', () => {
  it('parses valid slugs and lowercases them', () => {
    const { slugs, rejected } = parseCompareSlugs('Alpha, beta-1 ,gamma')
    expect(slugs).toEqual(['alpha', 'beta-1', 'gamma'])
    expect(rejected).toEqual([])
  })

  it('returns empty for missing param', () => {
    expect(parseCompareSlugs(undefined)).toEqual({ slugs: [], rejected: [] })
    expect(parseCompareSlugs('')).toEqual({ slugs: [], rejected: [] })
  })

  it('rejects invalid values, duplicates and overflow beyond the max', () => {
    const many = Array.from({ length: COMPARE_MAX + 2 }, (_, i) => `t${i}`).join(',')
    const res = parseCompareSlugs(`ok, bad slug!, ok, drop';--, ${many}`)
    expect(res.slugs[0]).toBe('ok')
    expect(res.slugs).toHaveLength(COMPARE_MAX)
    expect(res.rejected).toContain('bad slug!')
    expect(res.rejected).toContain("drop';--")
    expect(res.rejected).toContain('ok') // duplicate
  })
})
