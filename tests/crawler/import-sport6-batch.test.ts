import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { buildInsert } from '../../scripts/import-tipstrr-prod'
import { tipstrrSnapshotToInsert, planSport6Batch } from '@/crawler/platforms/tipstrr/to-db'
import { sport6Totals, applySport6AllTime, type Sport6Capture } from '@/crawler/platforms/tipstrr/sport6'
import { loadTipstrrCapture } from '@/crawler/platforms/tipstrr/load-capture'
import type { TipsterInsert } from '@/db/schema'

// Garantías del lote sport/6 (revisión 2026-11-15): SOLO ALTAS, fila+log de
// procedencia atómicos, y reintento seguro tras fallo. Contra PGlite; no
// toca Neon.

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql',
]

const pg = new PGlite()
beforeAll(async () => {
  for (const m of MIGRATIONS) await pg.exec(readFileSync(join('drizzle', m), 'utf8'))
})

const CAP = join(__dirname, '../../crawler/platforms/tipstrr/captures')

const sport6Snapshot = (slug: string) => {
  const raw = JSON.parse(readFileSync(join(CAP, '2026-11-15-stats', `${slug}.json`), 'utf8'))
  const snap = loadTipstrrCapture(raw, {
    sourceUrl: raw._meta.source.split(' ')[0],
    capturedAt: raw._meta.captured,
    capturedAtDate: raw._meta.captured,
    editorial: {
      platformLabel: 'x', stakeLabel: null, roiPeriodLabel: 'x',
      lastResultVisibleLabel: null, yieldEquivalenceNote: 'x', notAvailable: [],
    },
  })
  const sp6 = JSON.parse(readFileSync(join(CAP, '2026-11-15-sport6', `${slug}.json`), 'utf8')) as Sport6Capture
  return applySport6AllTime(snap, sport6Totals(sp6), 'captura 2026-11-15')
}

const mappingOf = (slug: string) =>
  tipstrrSnapshotToInsert(sport6Snapshot(slug), {
    id: -1, idSource: 'internal-transactional', slug, subscriptionPriceGbp: null, isPaid: false,
  })

const PROVENANCE = 'overview all-time sustituido por totales advised de /api/portfolio/<slug>/stats/sport/6 (captura 2026-11-15)'
const insertLog = (slug: string, platform: string | null = 'tipstrr') => ({
  text: `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
  params: [platform, slug, '2026-11-15T17:00:00Z', 'importado[sport6-override]', PROVENANCE, 'test-run'],
})

describe('planSport6Batch: lote solo-altas', () => {
  it('fila existente se salta SIEMPRE, aunque la captura sea más reciente', () => {
    const m = mappingOf('-25')
    if (!m.ok) throw new Error(m.reason)
    const newer = { ...m.insert, capturedAt: new Date('2999-01-01T00:00:00Z') }
    const plan = planSport6Batch({ id: -5, capturedAt: new Date('2020-01-01') } as unknown as TipsterInsert, { ok: true, insert: newer })
    expect(plan.action).toBe('skip-existing')
  })

  it('sin fila existente: insert; con mapping en cuarentena: skip', () => {
    const m = mappingOf('-25')
    if (!m.ok) throw new Error(m.reason)
    expect(planSport6Batch(null, m).action).toBe('insert')
    const bad = mappingOf('chicken-dinner')
    expect(bad.ok).toBe(false)
    const plan = planSport6Batch(null, bad)
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason).toContain('cuarentena')
  })
})

describe('lote sport/6: atomicidad y reintento', () => {
  it('insert + log de procedencia comprometen juntos', async () => {
    const m = mappingOf('-25')
    if (!m.ok) throw new Error(m.reason)
    const q = buildInsert(m.insert, true)
    await pg.transaction(async (tx) => {
      await tx.query(q.text, q.params as never[])
      const l = insertLog('-25')
      await tx.query(l.text, l.params as never[])
    })
    const t = await pg.query<{ slug: string; picks: number }>(`SELECT slug, picks FROM tipsters WHERE slug = '-25'`)
    const l = await pg.query<{ class: string }>(`SELECT class FROM import_validation_log WHERE slug = '-25'`)
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0].picks).toBe(500)
    expect(l.rows).toHaveLength(1)
    expect(l.rows[0].class).toBe('importado[sport6-override]')
  })

  it('si el log falla, la fila NO queda escrita (rollback total)', async () => {
    const m = mappingOf('10-streak')
    if (!m.ok) throw new Error(m.reason)
    const q = buildInsert(m.insert, true)
    const badLog = insertLog('10-streak', null) // platform NOT NULL -> falla
    await expect(
      pg.transaction(async (tx) => {
        await tx.query(q.text, q.params as never[])
        await tx.query(badLog.text, badLog.params as never[])
      })
    ).rejects.toThrow()
    const t = await pg.query(`SELECT slug FROM tipsters WHERE slug = '10-streak'`)
    const l = await pg.query(`SELECT slug FROM import_validation_log WHERE slug = '10-streak'`)
    expect(t.rows).toHaveLength(0)
    expect(l.rows).toHaveLength(0)
  })

  it('reintento tras éxito: la fila existente se salta y conserva sus valores', async () => {
    const cur = await pg.query('SELECT * FROM tipsters WHERE slug = $1', ['-25'])
    expect(cur.rows).toHaveLength(1)
    const camel: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cur.rows[0] as Record<string, unknown>)) {
      camel[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v
    }
    const before = camel.picks
    const retry = planSport6Batch(camel as unknown as TipsterInsert, mappingOf('-25'))
    expect(retry.action).toBe('skip-existing')
    const after = await pg.query<{ picks: number }>(`SELECT picks FROM tipsters WHERE slug = '-25'`)
    expect(after.rows[0].picks).toBe(before)
  })
})
