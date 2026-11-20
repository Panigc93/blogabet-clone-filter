import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { blogabetOnly, staleRecordWhere, activeCohortWhere, inactiveWhere } from '@/crawler/bb-scope'

// Regresión de alcance del crawler Blogabet sobre la tabla multifuente:
// el borrado de registros obsoletos (mismo slug, distinto id), la cohorte de
// stats y la limpieza de inactivos NO deben tocar filas Tipstrr, aunque
// compartan slug y tengan last_pick_at null. Antes de bb-scope.ts las tres
// operaciones carecían de filtro platform.

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql','0007_blogabet_access_signal.sql',
]

const pg = new PGlite()
const db = drizzle(pg, { schema: { tipsters } })

const BB_OLD = { id: 7, platform: 'blogabet', slug: 'shared-slug', name: 'BB viejo', isPaid: true, price: '20.00', sinceYear: 2019, picks: 300, profit: '100.00', yield: '5.00', lastPickAt: new Date(Date.UTC(2026, 10, 10)) }
const BB_NEW = { ...BB_OLD, id: 77, name: 'BB nuevo (mismo slug, reset de cuenta)' }
const TIPSTRR = { id: -221629, platform: 'tipstrr', slug: 'shared-slug', name: 'Tipstrr mismo slug', isPaid: true, price: '39.00', profitUnit: 'units', priceCurrency: 'gbp', picks: 1974, profit: '361.815', yield: '18.33', lastPickAt: null, picks6mAvg: '117.17', yield6m: '21.00', statsUpdatedAt: new Date(Date.UTC(2026, 10, 15)) }

beforeAll(async () => {
  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../../drizzle', file), 'utf8')
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const s = stmt.trim()
      if (s) await pg.exec(s)
    }
  }
  // Orden real del crawl: primero existe la fila vieja junto a la Tipstrr;
  // el insert de la fila nueva llega DESPUÉS del borrado de obsoletos (si
  // no, el unique (platform,slug) rechazaría la coexistencia, correctamente).
  await db.insert(tipsters).values([BB_OLD, TIPSTRR])
})

afterAll(async () => { await pg.close() })

const tipstrrRow = () => db.select().from(tipsters).where(eq(tipsters.id, -221629))

describe('crawler Blogabet no toca filas Tipstrr', () => {
  it('el borrado de obsoletos por slug solo elimina la fila BB vieja', async () => {
    // crawl.ts: llega el tipster con id nuevo (77); el viejo (7) es obsoleto
    await db.delete(tipsters).where(staleRecordWhere(['shared-slug'], [77]))
    await db.insert(tipsters).values(BB_NEW)
    const rest = await db.select({ id: tipsters.id, platform: tipsters.platform }).from(tipsters)
    expect(rest.map(r => r.id).sort((a, b) => a - b)).toEqual([-221629, 77])
    const t = await tipstrrRow()
    expect(t).toHaveLength(1)
    expect(t[0].profit).toBe('361.815')
  })

  it('la cohorte de stats solo selecciona Blogabet activos', async () => {
    const oneMonthAgo = new Date(Date.UTC(2026, 9, 15))
    const cohort = await db.select({ id: tipsters.id, slug: tipsters.slug }).from(tipsters)
      .where(activeCohortWhere(oneMonthAgo, 0))
    // La fila Tipstrr tiene last_pick_at null y nunca debe entrar en la
    // cohorte de scraping BB aunque estuviera activa.
    expect(cohort.map(r => r.id)).toEqual([77])
  })

  it('la limpieza de inactivos no limpia columnas Tipstrr', async () => {
    const oneMonthAgo = new Date(Date.UTC(2026, 9, 15))
    await db.update(tipsters)
      .set({ yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null, picksFree3mAvg: null, yieldFree3m: null, statsUpdatedAt: null })
      .where(inactiveWhere(oneMonthAgo))
    const t = await tipstrrRow()
    expect(t[0].picks6mAvg).toBe('117.17')
    expect(t[0].yield6m).toBe('21.00')
    expect(t[0].statsUpdatedAt).not.toBeNull()
  })

  it('el recuento de filas con stats (decisión de limpieza) es solo BB', async () => {
    const { sql } = await import('drizzle-orm')
    const [{ withStats }] = await db.select({
      withStats: sql<number>`count(*) filter (where ${tipsters.statsUpdatedAt} is not null)`.mapWith(Number),
    }).from(tipsters).where(blogabetOnly)
    // Tras la limpieza anterior la fila BB quedó sin stats; la Tipstrr las
    // conserva pero no debe contar para decisiones del crawler BB.
    expect(withStats).toBe(0)
  })
})
