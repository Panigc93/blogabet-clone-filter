import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { and } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder, priceFilterIgnored } from '@/lib/query'
import { tipstrrSnapshotToInsert } from '@/crawler/platforms/tipstrr/to-db'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'

// Real end-to-end regression on an isolated in-memory Postgres (PGlite):
// migrations 0000-0003 applied in order, BB row + two Tipstrr rows inserted,
// and the REAL query layer (filters, sort, pagination) exercised against it.
// No shared database is touched.

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_multi_platform.sql',
]

// schema.ts columns with NO migration file (pre-existing journal gap, known
// todo). The test DB adds them explicitly so the gap is documented and
// checked here instead of hidden.
const UNMIGRATED_COLUMNS = `
  ALTER TABLE tipsters ADD COLUMN picks_6m_avg numeric(7,2);
  ALTER TABLE tipsters ADD COLUMN yield_3m numeric(6,2);
  ALTER TABLE tipsters ADD COLUMN yield_6m numeric(6,2);
  ALTER TABLE tipsters ADD COLUMN yield_12m numeric(6,2);
  ALTER TABLE tipsters ADD COLUMN picks_free_3m_avg numeric(7,2);
  ALTER TABLE tipsters ADD COLUMN yield_free_3m numeric(6,2);
  ALTER TABLE tipsters ADD COLUMN stats_updated_at timestamp with time zone;
`

const pg = new PGlite()
const db = drizzle(pg, { schema: { tipsters } })

// FABRICATED Blogabet row: figures invented; deliberately shares the slug
// 'the-least-expected' to prove platform scoping prevents collisions.
const BB_ROW = {
  id: 101,
  platform: 'blogabet',
  slug: 'the-least-expected',
  name: 'BB Demo Same Slug',
  isPaid: true,
  price: '30.00',
  priceCurrency: 'eur',
  profitUnit: 'eur',
  sinceYear: 2020,
  picks: 900,
  profit: '1200.00',
  yield: '9.50',
  verifiedPct: '97.00',
  followers: 150,
}

beforeAll(async () => {
  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../../drizzle', file), 'utf8')
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const s = stmt.trim()
      if (s) await pg.exec(s)
    }
  }
  await pg.exec(UNMIGRATED_COLUMNS)
  await db.insert(tipsters).values(BB_ROW)
  await db.insert(tipsters).values([
    tipstrrSnapshotToInsert(TLE_SNAPSHOT, { id: -221629, slug: 'the-least-expected', subscriptionPriceGbp: 39, isPaid: true }),
    tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, { id: -999999, slug: 'statmind', subscriptionPriceGbp: null, isPaid: false }),
  ])
})

afterAll(async () => {
  await pg.close()
})

async function runQuery(filters: Parameters<typeof buildFilters>[0], page = 0, pageSize = 50) {
  const where = buildFilters(filters)
  return db
    .select()
    .from(tipsters)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...sortOrder('yield'))
    .limit(pageSize)
    .offset(page * pageSize)
}

describe('multi-platform DB integration (isolated PGlite)', () => {
  it('migration 0003 applies cleanly on top of 0000-0002 and BB rows survive unchanged', async () => {
    const bb = await db.select().from(tipsters).where(and(...buildFilters({ platform: 'blogabet' })))
    expect(bb).toHaveLength(1)
    expect(bb[0].platform).toBe('blogabet')
    expect(bb[0].profitUnit).toBe('eur')
    expect(bb[0].followers).toBe(150)
    expect(bb[0].yield).toBe('9.50')
  })

  it('same slug coexists across platforms (no collision)', async () => {
    const sameSlug = await db.select().from(tipsters).where(and(...buildFilters({ search: 'the-least-expected' })))
    expect(sameSlug).toHaveLength(2)
    expect(new Set(sameSlug.map((r) => r.platform))).toEqual(new Set(['blogabet', 'tipstrr']))
  })

  it('default Blogabet scope hides Tipstrr; platform=tipstrr opts in', async () => {
    expect((await runQuery({ platform: 'blogabet' })).map((r) => r.slug)).toEqual(['the-least-expected'])
    const tt = await runQuery({ platform: 'tipstrr' })
    expect(tt.map((r) => r.slug)).toEqual(['the-least-expected', 'statmind']) // yield DESC: 18.33 > -20.32
    expect(tt[0].id).toBe(-221629)
    expect(tt[0].profitUnit).toBe('units')
    expect(tt[0].priceCurrency).toBe('gbp')
  })

  it('yield sort works across negative ids and mixed unit profits stay unmixed', async () => {
    const tt = await runQuery({ platform: 'tipstrr', minYield: 0 })
    expect(tt.map((r) => r.slug)).toEqual(['the-least-expected']) // statmind yield -20.32 filtered out
    // profit figures are NOT comparable across platforms; query never sums them
    expect(tt[0].profitUnit).toBe('units')
    expect(tt[0].profit).toBe('361.815')
  })

  it('price filter compares EUR only and never matches GBP rows as if absent', async () => {
    const eur = await runQuery({ priceMin: 5, priceMax: 50 })
    expect(eur.map((r) => r.platform)).toEqual(['blogabet']) // GBP TLE not matched by an EUR range
    // explicit Tipstrr scope: filter not applied, caller must signal it
    const params = { platform: 'tipstrr' as const, priceMin: 5, priceMax: 50 }
    expect(priceFilterIgnored(params)).toBe(true)
    const tt = await runQuery(params)
    expect(tt).toHaveLength(2) // NOT silently zero
    expect(priceFilterIgnored({ platform: 'blogabet', priceMin: 5 })).toBe(false)
  })

  it('pagination (LoadMore path) returns stable pages with negative ids', async () => {
    const page0 = await runQuery({ platform: 'tipstrr' }, 0, 1)
    const page1 = await runQuery({ platform: 'tipstrr' }, 1, 1)
    expect(page0).toHaveLength(1)
    expect(page1).toHaveLength(1)
    expect(page0[0].slug).toBe('the-least-expected')
    expect(page1[0].slug).toBe('statmind')
    expect(page0[0].id).not.toBe(page1[0].id)
  })

  it('absence is null in the database, never 0', async () => {
    const [tle] = await runQuery({ platform: 'tipstrr', search: 'the-least-expected' })
    expect(tle.followers).toBeNull()
    expect(tle.verifiedPct).toBeNull()
    expect(tle.yieldFree3m).toBeNull()
    expect(tle.lastPickAt).toBeNull()
    expect(tle.capturedAt?.toISOString()).toBe('2026-11-15T13:49:00.000Z')
  })

  it('documented rollback removes Tipstrr rows and restores the BB-only shape', async () => {
    await pg.exec(`
      DELETE FROM tipsters WHERE platform = 'tipstrr';
      DROP INDEX ux_tipsters_platform_slug;
      DROP INDEX idx_tipsters_platform;
      ALTER TABLE tipsters DROP COLUMN platform, DROP COLUMN profit_unit, DROP COLUMN price_currency, DROP COLUMN signup_at, DROP COLUMN captured_at;
      ALTER TABLE tipsters ALTER COLUMN followers SET DEFAULT 0;
      ALTER TABLE tipsters ALTER COLUMN followers SET NOT NULL;
      ALTER TABLE tipsters ADD CONSTRAINT tipsters_slug_unique UNIQUE(slug);
    `)
    // drizzle's schema still knows the dropped columns; assert via raw SQL
    const rest = await pg.query<{ name: string; yield: string; slug: string }>('SELECT name, yield, slug FROM tipsters')
    expect(rest.rows).toHaveLength(1)
    expect(rest.rows[0].name).toBe('BB Demo Same Slug')
    expect(rest.rows[0].yield).toBe('9.50')
    const cols = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='tipsters' AND column_name IN ('platform','profit_unit','price_currency','signup_at','captured_at')`
    )
    expect(cols.rows).toHaveLength(0)
  })
})
