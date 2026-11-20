import { observedPublicationBounds } from '@/lib/activity'
import { activityCondition } from '@/lib/activity-query'
import { periodReadContext } from '@/lib/bet2invest-period-read'
import { windowBounds, type PeriodAudit } from '@/lib/bet2invest-period-contract'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { and, sql, inArray } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder, priceFilterIgnored } from '@/lib/query'
import { tipstrrSnapshotToInsert, type TipstrrDbMapping } from '@/crawler/platforms/tipstrr/to-db'
import { golazobetsCaptureToInsert, type GzbProfileCapture } from '@/crawler/platforms/golazobets/to-db'
const mustMap = (m: TipstrrDbMapping) => {
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'

// Real end-to-end regression on an isolated in-memory Postgres (PGlite):
// migrations 0000-0003 applied in order, BB row + two Tipstrr rows inserted,
// and the REAL query layer (filters, sort, pagination) exercised against it.
// No shared database is touched.

// Cadena COMPLETA del journal real (0000→0004): la brecha preexistente de
// las 7 columnas de stats quedó cerrada por el baseline de PR1
// (0003_naive_dormammu, ya registrado en producción) y nuestro delta es
// 0004 generado por drizzle-kit con snapshot/journal reales.
const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql',
]

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
  await db.insert(tipsters).values(BB_ROW)
  await db.insert(tipsters).values([
    mustMap(tipstrrSnapshotToInsert(TLE_SNAPSHOT, { id: -221629, idSource: 'source-captured', slug: 'the-least-expected', subscriptionPriceGbp: 39, isPaid: true })),
    mustMap(tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, { id: -999999, idSource: 'isolated-fixture', slug: 'statmind', subscriptionPriceGbp: null, isPaid: false })),
  ])
  // Fila Golazobets desde captura REAL (FutbolEnCasa, 2026-11-15): yield de
  // cabecera 10,83 (la UI redondea a '+11%') y unidad propia. Sirve para
  // probar que el filtro numerico NO se deja llevar por el redondeo de
  // pantalla y que la ordenacion por beneficio agrupa por unidad.
  const gzbCap = JSON.parse(
    readFileSync(join(__dirname, '../../crawler/platforms/golazobets/captures/2026-11-15-profiles/FutbolEnCasa.json'), 'utf8'),
  ) as GzbProfileCapture
  const gzbMap = golazobetsCaptureToInsert('FutbolEnCasa', gzbCap, { capturedAt: '2026-11-15T00:00:00.000Z' })
  if (!gzbMap.ok) throw new Error(gzbMap.reason)
  await db.insert(tipsters).values({ ...gzbMap.insert, id: -700001 })
})

afterAll(async () => {
  await pg.close()
})

async function runQuery(filters: Parameters<typeof buildFilters>[0], page = 0, pageSize = 50, sort: Parameters<typeof sortOrder>[0] = 'yield') {
  const where = buildFilters(filters)
  return db
    .select()
    .from(tipsters)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...sortOrder(sort))
    .limit(pageSize)
    .offset(page * pageSize)
}

describe('multi-platform DB integration (isolated PGlite)', () => {
  it('pasted profile links find exact platform identities, never same-slug rows on another source', async () => {
    const rows = await runQuery({ search: 'https://tipstrr.com/tipster/the-least-expected/stats' })
    expect(rows.map(r => r.platform)).toEqual(['tipstrr'])
    expect(await runQuery({ platform: 'blogabet', search: 'https://tipstrr.com/tipster/the-least-expected/stats' })).toEqual([])
    expect((await runQuery({ search: 'https://the-least-expected.blogabet.com/' })).map(r => r.platform)).toEqual(['blogabet'])
  })
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

  it('pick-count filter uses the profile historical total on both platforms', async () => {
    // Requirement 2026-11-15 (user): Superblogabet filters by how many picks
    // a tipster has. Mapping: tipsters.picks = source profile historical
    // total (Tipstrr overview.tips: TLE 1974, StatMind 291; never the
    // ranking-period count). Shared column, so one threshold works across
    // platforms without per-source semantics.
    const tt300 = await runQuery({ platform: 'tipstrr', minPicks: 300 })
    expect(tt300.map((r) => r.slug)).toEqual(['the-least-expected']) // 1974 passes, 291 does not
    const tt291 = await runQuery({ platform: 'tipstrr', minPicks: 291 })
    expect(tt291.map((r) => r.slug).sort()).toEqual(['statmind', 'the-least-expected'].sort())
    const tt1975 = await runQuery({ platform: 'tipstrr', minPicks: 1975 })
    expect(tt1975).toHaveLength(0)
    // Cross-platform: same threshold applies to the BB row (900) identically
    const all500 = await runQuery({ minPicks: 500 })
    expect(all500.map((r) => `${r.platform}:${r.slug}`).sort()).toEqual(['blogabet:the-least-expected', 'tipstrr:the-least-expected'].sort())
  })

  it('price filter applies only in the Blogabet view; elsewhere it is ignored and signalled, never silently hiding rows', async () => {
    // Blogabet-only view: EUR range applies with currency scope
    const eur = await runQuery({ platform: 'blogabet', priceMin: 5, priceMax: 50 })
    expect(eur.map((r) => r.platform)).toEqual(['blogabet'])
    expect(priceFilterIgnored({ platform: 'blogabet', priceMin: 5 })).toBe(false)
    // Combined all-platforms view (platform undefined): a price range would
    // silently hide every GBP row as if no tipster existed, so it is NOT
    // applied and the caller must signal it
    expect(priceFilterIgnored({ priceMin: 5, priceMax: 50 })).toBe(true)
    const all = await runQuery({ priceMin: 5, priceMax: 50 })
    expect(all).toHaveLength(4) // BB + 2 Tipstrr + 1 Golazobets: nothing hidden
    // explicit Tipstrr scope: same rule
    const params = { platform: 'tipstrr' as const, priceMin: 5, priceMax: 50 }
    expect(priceFilterIgnored(params)).toBe(true)
    const tt = await runQuery(params)
    expect(tt).toHaveLength(2) // NOT silently zero
  })

  it('Blogabet-only filters (years, free picks, reset) never hide Tipstrr rows via direct URL params', async () => {
    // Tipstrr rows carry null lastPickAt/lastResetAt/picksFree3mAvg: applying
    // these filters would silently drop every Tipstrr row as if none existed.
    const bbOnly = { minYears: 1, conPicksFree: true, resetOlderThan: true }
    const tt = await runQuery({ ...bbOnly, platform: 'tipstrr' as const })
    expect(tt).toHaveLength(2) // both Tipstrr rows still listed
    const all = await runQuery(bbOnly) // combined view: nothing applied
    expect(all).toHaveLength(4) // BB + 2 Tipstrr + 1 Golazobets
  })

  it('activity is applied before pagination; unknown is null-safe and platform-scoped', async () => {
    const now = new Date().toISOString()
    const proof = [{ platform: 'tipstrr' as const, slug: 'the-least-expected',
      sourceUrl: 'https://tipstrr.com/tipster/the-least-expected/results', capturedAt: now,
      publishedLower: now, publishedUpper: now, precision: 'utc' as const, coverage: 'sample' as const }]
    const recent = await db.select().from(tipsters).where(activityCondition(1, false, proof)).limit(1)
    expect(recent).toHaveLength(1)
    expect(recent[0].platform).toBe('tipstrr') // BB shares its slug, but has no proof.
    const unknown = await db.select().from(tipsters).where(activityCondition(1, true, proof))
    expect(unknown).toHaveLength(3)
    expect(unknown.some(r => r.platform === 'blogabet')).toBe(true) // NULL last_pick_at
    expect(unknown.some(r => r.platform === 'tipstrr' && r.slug === 'statmind')).toBe(true)
    const noEvidence = await db.select().from(tipsters).where(activityCondition(1, false, []))
    expect(noEvidence).toHaveLength(0)
  })

  it('recent naive publication two hours ago is positive SQL evidence, bounded by capture', async () => {
    const capture = new Date(Date.now() - 1000).toISOString()
    const raw = new Date(Date.now() - 2 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
    const b = observedPublicationBounds(raw, capture)!
    expect(b.upper).toBe(capture)
    const proof = [{ platform: 'golazobets' as const, slug: 'FutbolEnCasa', sourceUrl: 'https://golazobets.com/tipster/FutbolEnCasa',
      capturedAt: capture, publishedLower: b.lower, publishedUpper: b.upper,
      precision: 'timezone-unknown' as const, coverage: 'first-page' as const }]
    const recent = await db.select().from(tipsters).where(activityCondition(1, false, proof))
    expect(recent.map(r => r.slug)).toEqual(['FutbolEnCasa'])
    const unknown = await db.select().from(tipsters).where(activityCondition(1, true, proof))
    expect(unknown.some(r => r.slug === 'FutbolEnCasa')).toBe(false)
  })

  it('captured-window activity (b2i/apuestes) selects real rows by expected data, zero yield included', async () => {
    // Expected-data semantics, not string pinning: a window with picks and
    // net profit 0 imports '0.00' (active), a window without picks imports
    // NULL (no evidence). Rows fabricated for this regression.
    const at = new Date('2026-11-17T12:00:00.000Z')
    const auditFor = (slug: string, capturedAt = at.toISOString()): PeriodAudit => ({
      slug, capturedAt, windows: Object.fromEntries(([3, 6, 12] as const).map(n => [n, {
        ...windowBounds(new Date(capturedAt), n), value: n === 6 ? '0.00' : null,
        bets: n === 6 ? 2 : 0, months: n === 6 ? 1 : 0, reason: n === 6 ? null : 'no_picks', caveats: []
      }])) as unknown as PeriodAudit['windows']
    })
    const audits = ['b2i-active-6m', 'b2i-mismatch', 'b2i-invalid', 'b2i-wrong-capture'].map(slug => auditFor(slug))
    audits.find(a => a.slug === 'b2i-invalid')!.windows[6].bets = 0
    audits.push(auditFor('b2i-stale', '2026-10-17T12:00:00.000Z'))
    const periods = periodReadContext(audits, new Date('2026-11-20T12:00:00.000Z'))
    await db.insert(tipsters).values([
      { id: -800001, platform: 'bet2invest', slug: 'b2i-active-6m', name: 'B2I Active 6m', picks: 100, yield6m: '0.00', capturedAt: at, profitUnit: 'bet2invest-units' },
      { id: -800002, platform: 'bet2invest', slug: 'b2i-no-windows', name: 'B2I No Windows', picks: 100, capturedAt: at, profitUnit: 'bet2invest-units' },
      { id: -800003, platform: 'apuestes', slug: 'ap-zero-yield-6m', name: 'AP Zero Yield 6m', picks: 50, yield6m: '0.00', profitUnit: 'apuestes-units' },
      { id: -800004, platform: 'bet2invest', slug: 'b2i-mismatch', name: 'B2I Mismatch', yield6m: '5.00', capturedAt: at },
      { id: -800005, platform: 'bet2invest', slug: 'b2i-invalid', name: 'B2I Invalid', yield6m: '0.00', capturedAt: at },
      { id: -800006, platform: 'bet2invest', slug: 'b2i-stale', name: 'B2I Stale', yield6m: '0.00', capturedAt: new Date('2026-10-17T12:00:00.000Z') },
      { id: -800007, platform: 'bet2invest', slug: 'b2i-wrong-capture', name: 'B2I Wrong Capture', yield6m: '0.00', capturedAt: new Date('2026-11-18T12:00:00.000Z') },
    ])
    // Use the real audited-period join, including validAudit, current-month
    // eligibility and exact capture identity. Other aliases are empty here.
    const q = () => db.select({ slug: tipsters.slug }).from(tipsters)
      .leftJoin(periods.source, periods.joinOn)
      .leftJoin(sql`jsonb_to_recordset('[]'::jsonb) AS be_research(guid text, slug text, public jsonb)`, sql`true`)
      .leftJoin(sql`(SELECT NULL::text slug, NULL::timestamptz captured_at, NULL::jsonb compact WHERE false) AS olbg_stats`, sql`true`)
    const slugsOf = (rows: any[]) => rows.map(r => r.slug)
    try {
      const slugs6 = slugsOf(await q().where(activityCondition(6, false, [])))
      expect(slugs6).toContain('b2i-active-6m')      // window with picks
      expect(slugs6).toContain('ap-zero-yield-6m')   // 0.00 yield IS activity
      expect(slugs6).not.toContain('b2i-no-windows') // NULL windows: no evidence
      for (const slug of ['b2i-mismatch', 'b2i-invalid', 'b2i-stale', 'b2i-wrong-capture']) expect(slugs6).not.toContain(slug)
      const slugs3 = slugsOf(await q().where(activityCondition(3, false, [])))
      expect(slugs3).not.toContain('b2i-active-6m') // exact window: 6m is not widened into 3m
      const unk = slugsOf(await q().where(activityCondition(6, true, [])))
      expect(unk).toContain('b2i-no-windows')
      expect(unk).not.toContain('ap-zero-yield-6m')
    } finally {
      await db.delete(tipsters).where(inArray(tipsters.id, [-800001, -800002, -800003, -800004, -800005, -800006, -800007]))
    }
  })

  it('joined BE and OLBG activity includes real zero-yield samples but excludes held or empty samples', async () => {
    const rows = [
      { id: -800011, platform: 'bettingexpert', slug: 'be-zero', name: 'BE Zero' },
      { id: -800012, platform: 'bettingexpert', slug: 'be-held', name: 'BE Held' },
      { id: -800013, platform: 'bettingexpert', slug: 'be-empty', name: 'BE Empty' },
      { id: -800014, platform: 'olbg', slug: 'olbg-sample', name: 'OLBG Sample' },
      { id: -800015, platform: 'olbg', slug: 'olbg-empty', name: 'OLBG Empty' },
    ]
    const beRows = [
      { slug: 'be-zero', public: { windows: { '6m': { value: '0.00', picks: 2 } } } },
      { slug: 'be-held', public: { windows: { '6m': { value: null, picks: null } } } },
      { slug: 'be-empty', public: { windows: { '6m': { value: '0.00', picks: 0 } } } },
    ]
    const olbgRows = [
      { slug: 'olbg-sample', compact: { windows: [{ tips: 0 }, { tips: 2 }, { tips: 2 }] } },
      { slug: 'olbg-empty', compact: { windows: [{ tips: 0 }, { tips: 0 }, { tips: 0 }] } },
    ]
    await db.insert(tipsters).values(rows)
    try {
      const result = await db.select({ slug: tipsters.slug }).from(tipsters)
        .leftJoin(sql`jsonb_to_recordset('[]'::jsonb) AS b2i_audit(slug text, windows jsonb)`, sql`true`)
        .leftJoin(sql`jsonb_to_recordset(${JSON.stringify(beRows)}::jsonb) AS be_research(slug text, public jsonb)`, sql`be_research.slug=${tipsters.slug}`)
        .leftJoin(sql`jsonb_to_recordset(${JSON.stringify(olbgRows)}::jsonb) AS olbg_stats(slug text, compact jsonb)`, sql`olbg_stats.slug=${tipsters.slug}`)
        .where(and(inArray(tipsters.id, rows.map(r => r.id)), activityCondition(6, false, [])))
      expect(result.map(r => r.slug).sort()).toEqual(['be-zero', 'olbg-sample'])
    } finally { await db.delete(tipsters).where(inArray(tipsters.id, rows.map(r => r.id))) }
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

  it('profit sort groups by unit (eur, golazobets-units, units), never a cross-unit ranking', async () => {
    const rows = await runQuery({ platform: undefined }, 0, 50, 'profit')
    expect(rows.map((r) => r.platform)).toEqual(['blogabet', 'golazobets', 'tipstrr', 'tipstrr'])
    expect(rows[0].profitUnit).toBe('eur')
    expect(rows[1].profitUnit).toBe('golazobets-units')
    expect(rows[2].profitUnit).toBe('units')
    // dentro de cada unidad, valor descendente
    expect(Number(rows[2].profit)).toBeGreaterThan(Number(rows[3].profit))
  })

  it('minYield uses the real numeric value: 10.83 does not pass a threshold of 11 even though the card shows +11%', async () => {
    const all = await runQuery({ platform: 'golazobets' })
    expect(all).toHaveLength(1)
    expect(all[0].yield).toBe('10.83')
    const filtered = await runQuery({ platform: 'golazobets', minYield: 11 })
    expect(filtered).toHaveLength(0)
    const passes = await runQuery({ platform: 'golazobets', minYield: 10 })
    expect(passes).toHaveLength(1)
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
      DELETE FROM tipsters WHERE platform IN ('tipstrr', 'golazobets');
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
