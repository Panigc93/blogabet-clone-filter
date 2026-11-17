import { beforeAll, afterAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { and } from 'drizzle-orm'
import { tipsters, type Tipster } from '@/db/schema'
import { buildFilters, sortOrder, bettingexpertApiProjection, profitSortWarning, ignoredWarning } from '@/lib/query'
import { bettingexpertToInsert } from '@/crawler/platforms/bettingexpert/to-db'
import { parseProfileTotalsBatch } from '@/crawler/platforms/bettingexpert/batch'
import { fromDbTipster } from '@/components/tipster-card-model'
const fixtures = new URL('./fixtures/bettingexpert/', import.meta.url)
const ids = JSON.parse(readFileSync(new URL('batch-identities.json', fixtures), 'utf8'))
const raw = JSON.parse(readFileSync(new URL('batch-real.json', fixtures), 'utf8'))
const records = parseProfileTotalsBatch(raw, ids, '2026-11-17T17:43:00Z')
const pg = new PGlite(); const db = drizzle(pg, { schema: { tipsters } })
beforeAll(async () => {
  for (const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql']) {
    for (const s of readFileSync(new URL(`../drizzle/${f}`, import.meta.url), 'utf8').split('--> statement-breakpoint')) if (s.trim()) await pg.exec(s)
  }
  await db.insert(tipsters).values(records.map((r, i) => bettingexpertToInsert(r, 1000 + i)))
  // Synthetic contamination tests: positive period must not rank BE as valid.
  await pg.exec("UPDATE tipsters SET yield_6m=999, yield_12m=999, picks_6m_avg=999 WHERE platform='bettingexpert'")
  await db.insert(tipsters).values([
    { id: 1, platform: 'blogabet', slug: 'Black_Panther', name: 'BB sentinel', picks: 100, yield: '4', profit: '20', yield6m: '3', profitUnit: 'eur' },
    { id: 2, platform: 'tipstrr', slug: 'tt', name: 'TT sentinel', picks: 100, yield: '5', profit: '30', yield6m: '4', profitUnit: 'units' },
    { id: 3, platform: 'golazobets', slug: 'gzb', name: 'GZB sentinel', picks: 100, yield: '6', profit: '40', yield6m: '5', profitUnit: 'golazobets-units' },
  ])
})
afterAll(async () => { await pg.close() })
async function query(platform?: 'blogabet' | 'bettingexpert', offset = 0, size = 50, sort: 'profit' | 'yield6m' | 'yield' = 'yield') {
  return db.select().from(tipsters).where(and(...buildFilters({ platform }))).orderBy(...sortOrder(sort)).limit(size).offset(offset)
}
it('real captures map only to own source and source units', async () => {
  const rows = await query('bettingexpert')
  expect(rows).toHaveLength(6)
  expect(rows.every(x => x.profitUnit === 'bettingexpert-points')).toBe(true)
  const r = rows.find(x => x.slug === 'Black_Panther')!
  expect(r.picks).toBe(5635); expect(r.profit).toBe('-139.270'); expect(r.yield).toBe('-0.28')
  expect(r.lastPickAt).toBeNull(); expect(r.sinceYear).toBeNull(); expect(r.followers).toBeNull()
})
it('shared SQL excludes BE periods before pagination in combined view', async () => {
  const first = await query(undefined, 0, 2, 'yield6m'); const second = await query(undefined, 2, 2, 'yield6m')
  expect(first.map(x => x.platform)).toEqual(['golazobets','tipstrr'])
  expect(second[0].platform).toBe('blogabet'); expect(second[1].platform).toBe('bettingexpert')
})
it('API projection and mapper also hide contaminated BE periods', async () => {
  const row = (await query('bettingexpert'))[0]
  expect(bettingexpertApiProjection(row)).toMatchObject({ yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null })
  const c = fromDbTipster(row)
  expect(c).toMatchObject({ platform: 'bettingexpert', showPeriodRow: false, sinceYear: null, isVerified: null })
  expect(c.yield6m.valuePct).toBeNull(); expect(c.profitDisplay).toContain('pt BE'); expect(c.sourceUrl).toContain('www.bettingexpert.com/user/profile/')
})
it('BB default remains isolated with same-slug row preserved', async () => {
  const rows = await query('blogabet'); expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ id: 1, slug: 'Black_Panther', yield6m: '3.00', profit: '20.000' })
  expect(bettingexpertApiProjection(rows[0])).toBe(rows[0])
  expect(fromDbTipster(rows[0]).platform).toBe('blogabet')
})
it('profit ordering groups source units, never money versus BE points as one ranking', async () => {
  const rows = await query(undefined, 0, 50, 'profit')
  const units = rows.map(x => x.profitUnit)
  expect(units).toEqual([...units].sort())
  expect(profitSortWarning('profit', undefined)).toContain('pt BE')
  expect(ignoredWarning({ platform: 'bettingexpert', priceMin: 1 })).toContain('vista Bettingexpert')
})
it('mapper rejects rejected records and numeric overflow', () => {
  expect(() => bettingexpertToInsert({ ...ids[0], ok: false, reason: 'test' }, 1)).toThrow()
  const row = records[0]; if (!row.ok) throw new Error('fixture rejected')
  expect(() => bettingexpertToInsert({ ...row, yieldPct: 10000 }, 1)).toThrow()
  expect(() => bettingexpertToInsert(row, 0)).toThrow()
})
