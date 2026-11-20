import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { buildInsert, buildUpdate } from '../../scripts/import-tipstrr-prod'
import { tipstrrSnapshotToInsert, planTipstrrUpsert } from '@/crawler/platforms/tipstrr/to-db'
import { TLE_SNAPSHOT } from '@/app/lab/tipstrr/ficha/fixtures'
import type { TipsterInsert } from '@/db/schema'

// Valida la composición SQL del import real contra un Postgres real
// (PGlite): placeholders, nextval interno en el propio INSERT y update que
// no toca identidad. No toca Neon.

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql','0007_blogabet_access_signal.sql',
]

const pg = new PGlite()
beforeAll(async () => {
  for (const m of MIGRATIONS) await pg.exec(readFileSync(join('drizzle', m), 'utf8'))
})

const mustInsert = (id: number, slug = 'the-least-expected'): TipsterInsert => {
  const m = tipstrrSnapshotToInsert(TLE_SNAPSHOT, {
    id, idSource: id === -221629 ? 'source-captured' : 'internal-transactional',
    slug, subscriptionPriceGbp: 39, isPaid: true,
  })
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}

describe('import prod: composición SQL contra PGlite', () => {
  it('insert con id interno: nextval en el propio INSERT asigna el surrogate de la secuencia', async () => {
    const q = buildInsert(mustInsert(-1), true)
    expect(q.text).toContain(`nextval('tipsters_internal_id_seq')`)
    const res = await pg.query(q.text, q.params as never[])
    expect(res.affectedRows).toBe(1)
    const rows = await pg.query<{ id: number; slug: string; platform: string; picks: number }>(
      `SELECT id, slug, platform, picks FROM tipsters WHERE slug = 'the-least-expected'`
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].id).toBe(-2000000000) // primer valor de la secuencia interna
    expect(rows.rows[0].platform).toBe('tipstrr')
    expect(rows.rows[0].picks).toBeGreaterThan(0)
  })

  it('update: aplica merge sin tocar id/platform/slug', async () => {
    const cur = await pg.query<{ id: number }>(`SELECT id FROM tipsters WHERE slug = 'the-least-expected'`)
    const existingId = cur.rows[0].id
    const existingRow = await pg.query('SELECT * FROM tipsters WHERE id = $1', [existingId])
    const camel: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(existingRow.rows[0] as Record<string, unknown>)) {
      camel[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v
    }
    const newer = tipstrrSnapshotToInsert(
      { ...TLE_SNAPSHOT, capturedAtDate: '2026-11-16T00:00:00Z' },
      { id: -1, idSource: 'internal-transactional', slug: 'the-least-expected', isPaid: true }
    )
    if (!newer.ok) throw new Error(newer.reason)
    const plan = planTipstrrUpsert(camel as TipsterInsert, newer)
    expect(plan.action).toBe('update')
    if (plan.action !== 'update') return
    const q = buildUpdate(existingId, plan.merged)
    expect(q.text).not.toMatch(/SET[^=]*\b(id|platform|slug)\s*=/i)
    await pg.query(q.text, q.params as never[])
    const after = await pg.query<{ id: number; platform: string; slug: string; captured_at: string }>(
      'SELECT id, platform, slug, captured_at FROM tipsters WHERE id = $1', [existingId]
    )
    expect(after.rows[0].id).toBe(existingId)
    expect(after.rows[0].platform).toBe('tipstrr')
    expect(new Date(after.rows[0].captured_at).toISOString()).toBe('2026-11-16T00:00:00.000Z')
  })

  it('insert con id capturado del origen: usa -portfolioId, no la secuencia', async () => {
    const q = buildInsert(mustInsert(-221629, 'source-captured-demo'), false)
    expect(q.text).not.toContain('nextval')
    expect(q.params[0]).toBe(-221629)
    await pg.query(q.text, q.params as never[])
    const rows = await pg.query<{ id: number }>('SELECT id FROM tipsters WHERE id = -221629')
    expect(rows.rows).toHaveLength(1)
  })
})
