import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { apiCaptureToSnapshot, type TipstrrApiCapture } from '@/crawler/platforms/tipstrr/api-capture'
import { tipstrrSnapshotToInsert, type TipstrrDbMapping } from '@/crawler/platforms/tipstrr/to-db'
import { buildInsert } from '@/crawler/platforms/tipstrr/insert-sql'

// El import de catálogo usa el buildInsert COMPARTIDO de insert-sql.ts. Este
// test lo ejecuta de verdad contra un Postgres en memoria (PGlite) con las
// migraciones reales 0000-0005: el INSERT con nextval('tipsters_internal_id_seq')
// debe funcionar tal cual y la fila leída debe conservar los valores del cierre.
const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql',
]
const CAP = join(__dirname, '../../crawler/platforms/tipstrr/captures/2026-11-15-api/0nlybtt.json')

const pg = new PGlite()
const mustMap = (m: TipstrrDbMapping) => {
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}

beforeAll(async () => {
  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../../drizzle', file), 'utf8')
    for (const s of sqlText.split('--> statement-breakpoint')) {
      if (s.trim()) await pg.exec(s)
    }
  }
})
afterAll(async () => {
  await pg.close()
})

describe('buildInsert compartido (el real del import de catálogo) contra PGlite', () => {
  it('INSERT con id por secuencia interna + lectura fiel de la fila', async () => {
    const cap = JSON.parse(readFileSync(CAP, 'utf8')) as TipstrrApiCapture
    const snap = apiCaptureToSnapshot(cap)
    const insert = mustMap(tipstrrSnapshotToInsert(snap, {
      id: -1, idSource: 'internal-transactional', slug: '0nlybtt',
      subscriptionPriceGbp: null, isPaid: true,
    }))
    const q = buildInsert(insert, true)
    await pg.query(q.text, q.params as never[])
    const { rows } = await pg.query<Record<string, unknown>>(
      `SELECT * FROM tipsters WHERE platform = 'tipstrr' AND slug = '0nlybtt'`
    )
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(Number(r.id)).toBeLessThanOrEqual(-2000000000) // id de la secuencia interna
    expect(r.name).toBe('0NLYBTT$')
    expect(r.picks).toBe(3210)
    expect(Number(r.yield)).toBeCloseTo(2.05, 2)
    expect(Number(r.profit)).toBeCloseTo(14.348, 3)
    expect(r.is_paid).toBe(true)
    expect(new Date(r.signup_at as string).toISOString().slice(0, 10)).toBe('2025-04-25')
  })

  it('reintento seguro: un segundo INSERT del mismo slug rompe por unicidad (platform, slug), no duplica', async () => {
    const cap = JSON.parse(readFileSync(CAP, 'utf8')) as TipstrrApiCapture
    const insert = mustMap(tipstrrSnapshotToInsert(apiCaptureToSnapshot(cap), {
      id: -1, idSource: 'internal-transactional', slug: '0nlybtt',
      subscriptionPriceGbp: null, isPaid: true,
    }))
    const q = buildInsert(insert, true)
    await expect(pg.query(q.text, q.params as never[])).rejects.toThrow()
    const n = await pg.query<{ n: string }>(`SELECT count(*)::text AS n FROM tipsters WHERE slug = '0nlybtt'`)
    expect(n.rows[0].n).toBe('1')
  })
})
