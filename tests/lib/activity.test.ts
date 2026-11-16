import { describe, expect, it } from 'vitest'
import { golazobetsPublicationBounds, monthsBefore, parseActivity, provesRecent, validEvidence, ActivityEvidence } from '@/lib/activity'
import { activityCondition, activityWarning } from '@/lib/activity-query'
import { PgDialect } from 'drizzle-orm/pg-core'

const sample: ActivityEvidence = {
  platform: 'tipstrr', slug: 'example', sourceUrl: 'https://tipstrr.com/tipster/example/results',
  capturedAt: '2026-11-15T14:05:00Z', publishedLower: '2026-11-13T07:05:04Z',
  publishedUpper: '2026-11-13T07:05:04Z', precision: 'utc', coverage: 'sample'
}
const now = new Date('2026-11-16T12:00:00Z')
const cutoff = new Date('2026-10-16T12:00:00Z')

describe('activity evidence, not invented last publication', () => {
  it('accepts partial history as positive proof, not as proof of inactivity', () => {
    expect(provesRecent(sample, cutoff, now)).toBe(true)
    expect(provesRecent({ ...sample, publishedLower: '2026-09-01T00:00:00Z', publishedUpper: '2026-09-01T00:00:00Z' }, cutoff, now)).toBe(false)
    expect(activityWarning(undefined, true)).toContain('NO significa inactivo')
  })
  it('never takes event date, resolution, snapshot, or monthly bucket as publication', () => {
    expect(golazobetsPublicationBounds(undefined)).toBeNull()
    expect(validEvidence({ ...sample, publishedLower: '' })).toBe(false)
    expect(validEvidence({ ...sample, publishedUpper: 'bad' })).toBe(false)
  })
  it('does not invent the timezone of naive Golazobets dates', () => {
    expect(golazobetsPublicationBounds('2026-11-15 19:42:09')).toEqual({
      lower: '2026-11-15T05:42:09.000Z', upper: '2026-11-16T07:42:09.000Z'
    })
    expect(golazobetsPublicationBounds('2026-02-30 10:00:00')).toBeNull()
  })
  it('requires the whole timestamp interval to lie in the past recent window', () => {
    expect(provesRecent({ ...sample, publishedLower: '2026-10-16T11:00:00Z', publishedUpper: '2026-10-17T13:00:00Z' }, cutoff, now)).toBe(false)
    expect(provesRecent({ ...sample, publishedUpper: '2026-11-17T00:00:00Z' }, cutoff, now)).toBe(false)
    expect(provesRecent({ ...sample, capturedAt: '2026-11-17T00:00:00Z' }, cutoff, now)).toBe(false)
  })
  it('rejects private-looking slugs and unrelated source hosts', () => {
    expect(validEvidence({ ...sample, slug: 'private@example.com' })).toBe(false)
    expect(validEvidence({ ...sample, sourceUrl: 'https://example.com/tipster/example' })).toBe(false)
  })
  it('validates URL input for SSR/API identically', () => {
    expect(['1','3','6','12'].map(parseActivity)).toEqual([1,3,6,12])
    expect(parseActivity('unknown')).toBe('unknown')
    expect(parseActivity('2')).toBe(2)
    for (const bad of ['', null, undefined, 'NaN', '-1', '0', 'Infinity']) expect(parseActivity(bad)).toBeUndefined()
  })
  it('clamps calendar month boundaries rather than subtracting 30 days', () => {
    expect(monthsBefore(new Date('2026-03-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z')
  })
  it('keeps BB proxy independent from non-BB evidence and null-safe unknowns', () => {
    const dialect = new PgDialect()
    const q = dialect.sqlToQuery(activityCondition(1, false, [sample]))
    expect(q.sql).toContain('last_pick_at')
    expect(q.params).toContain('blogabet')
    expect(q.params).toContain('tipstrr')
    expect(q.params).toContain(sample.publishedLower)
    expect(q.sql).not.toContain('updated_at')
    expect(q.sql).not.toContain('since_year')
    expect(dialect.sqlToQuery(activityCondition(1, true, [])).sql).toContain('NOT COALESCE')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
it('SSR and paginated API both wire the same validated activity contract', () => {
  for (const file of ['app/page.tsx', 'app/api/tipsters/route.ts']) {
    const text = readFileSync(join(process.cwd(), file), 'utf8')
    expect(text).toContain('parseActivity(')
    expect(text).toContain("activityUnknown: activity === 'unknown'")
    expect(text).toContain("activityMonths: typeof activity === 'number' ? activity : undefined")
    expect(text).toContain(file === 'app/page.tsx' ? '<ActivityNotice months={filters.activityMonths} unknown={filters.activityUnknown}' : 'activityWarning(filters.activityMonths, filters.activityUnknown)')
    expect(text).toContain('buildFilters(filters)')
  }
})

it('284-profile evidence remains parameterized within PostgreSQL limits', () => {
  const rows = Array.from({ length: 284 }, (_, i) => ({ ...sample, slug: `profile-${i}` }))
  const query = new PgDialect().sqlToQuery(activityCondition(1, false, rows))
  expect(query.params.length).toBeLessThan(65535)
  expect(query.sql).not.toContain('profile-283')
  expect(query.params).toContain('profile-283')
})

import capturedEvidence from '@/data/activity/evidence.json'
import { readdirSync } from 'node:fs'
it('final evidence matches all 284 original Golazobets identities without private identifiers', () => {
  const allowed = readdirSync(join(process.cwd(), 'crawler/platforms/golazobets/captures/2026-11-15-profiles')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort()
  const rows = (capturedEvidence as ActivityEvidence[]).filter(e => e.platform === 'golazobets')
  expect(rows.map(e => e.slug).sort()).toEqual(allowed)
  expect(new Set(rows.map(e => e.slug)).size).toBe(284)
  for (const e of rows) {
    expect(validEvidence(e)).toBe(true)
    expect(decodeURIComponent(new URL(e.sourceUrl).pathname)).toBe('/tipster/' + e.slug)
    expect(Date.parse(e.publishedUpper)).toBeLessThanOrEqual(Date.parse(e.capturedAt))
    expect(e.coverage).toBe('first-page')
  }
  expect(rows.filter(e => e.visiblePaginationComplete)).toHaveLength(142)
  expect(rows.every(e => e.globalCoverageProven === false)).toBe(true)
  expect(rows.every(e => e.sourcePagination?.currentPage === 1)).toBe(true)
  const referenceNow = new Date('2026-11-16T12:33:00Z')
  expect(rows.filter(e => provesRecent(e, monthsBefore(referenceNow, 1), referenceNow))).toHaveLength(93)
})
