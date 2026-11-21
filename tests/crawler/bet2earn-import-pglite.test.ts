import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as schema from '@/db/schema'
import { consolidateBet2earnCapture } from '@/crawler/platforms/bet2earn/parse'
import { bet2earnSourceUrl } from '@/crawler/platforms/bet2earn/types'
import { planBet2earnImport, executeBet2earnImport } from '@/crawler/platforms/bet2earn/import'

// Transactional import against isolated PostgreSQL (PGlite) with the REAL
// migrations: proves the runner's path persists exact values, keeps the API
// source_url as provenance, logs holds, assigns sequence ids, leaves other
// platforms untouched and is idempotent on re-run. No remote DB.

const pg = new PGlite()
const db = drizzle(pg, { schema })
const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/bet2earn', n), 'utf8'))

function captureRow(slug: string, listSource: 'premium' | 'free', profileBody: unknown, historyBody: unknown) {
  const row = consolidateBet2earnCapture({
    slug, capturedAt: '2026-11-21T05:00:00Z', listSource, profileBody, historyBody,
  })
  row.sourceUrl = bet2earnSourceUrl(slug)
  return row
}

const JSONL = join(mkdtempSync(join(tmpdir(), 'b2e-pglite-')), 'rows.jsonl')

beforeAll(async () => {
  for (const file of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql', '0006_apuestes_source_url.sql', '0007_blogabet_access_signal.sql']) {
    for (const q of readFileSync(join(__dirname, '../../drizzle', file), 'utf8').split('--> statement-breakpoint')) {
      if (q.trim()) await pg.exec(q)
    }
  }
  await pg.exec("INSERT INTO tipsters(id, platform, slug, name, picks) VALUES (111, 'blogabet', 'fabian rivero', 'BB', 888), (112, 'protipster', 'fabian rivero', 'PT', 777)")
  const rows = [
    captureRow('andreaskloft winamax', 'premium', fx('profile-andreaskloft.json'), fx('history-andreaskloft.json')),
    captureRow('fabian rivero', 'free', fx('profile-fabian.json'), fx('history-fabian.json')),
    { ...captureRow('fabian rivero', 'free', fx('profile-fabian.json'), fx('history-fabian.json')), slug: 'held row', quarantine: { reason: 'test hold' } },
  ]
  writeFileSync(JSONL, rows.map((r) => JSON.stringify(r)).join('\n'))
})
afterAll(() => pg.close())

describe('Bet2Earn transactional import on isolated PostgreSQL', () => {
  it('plan: 3 rows -> 2 inserts + 1 hold', () => {
    const plan = planBet2earnImport(JSONL)
    expect(plan.rows).toBe(3)
    expect(plan.inserts).toHaveLength(2)
    expect(plan.holds).toHaveLength(1)
  })

  it('execute: persists exact values, API source_url as provenance, hold logged, other platforms untouched', async () => {
    const plan = planBet2earnImport(JSONL)
    const result = await executeBet2earnImport(db, plan, 'local-test-1')
    expect(result).toEqual({ upserted: 2, holdsLogged: 1 })

    const fabian = (await pg.query<Record<string, unknown>>("SELECT * FROM tipsters WHERE platform='bet2earn' AND slug='fabian rivero'")).rows[0]
    expect(fabian).toBeTruthy()
    expect(Number(fabian.id)).toBeLessThanOrEqual(-2000000000)
    expect(Number(fabian.picks)).toBe(7)
    expect(fabian.source_url).toBe('https://bet2earn.com/api/user/fabian%20rivero')
    expect(fabian.is_paid).toBe(false)

    const andreas = (await pg.query<Record<string, unknown>>("SELECT * FROM tipsters WHERE platform='bet2earn' AND slug='andreaskloft winamax'")).rows[0]
    expect(andreas.is_paid).toBe(true)
    expect(andreas.source_url).toBe('https://bet2earn.com/api/user/andreaskloft%20winamax')

    const logs = await pg.query<Record<string, unknown>>("SELECT * FROM import_validation_log WHERE platform='bet2earn'")
    expect(logs.rows).toHaveLength(1)
    expect(logs.rows[0].reason).toBe('quarantined at capture: test hold')
    expect(logs.rows[0].run_id).toBe('local-test-1')

    const others = await pg.query<Record<string, unknown>>("SELECT platform, picks FROM tipsters WHERE platform != 'bet2earn' ORDER BY id")
    expect(others.rows.map((r) => r.picks)).toEqual([888, 777])
  })

  it('re-run is idempotent: upsert keeps id and row count, never duplicates', async () => {
    const before = await pg.query<Record<string, unknown>>("SELECT id FROM tipsters WHERE platform='bet2earn' ORDER BY slug")
    const plan = planBet2earnImport(JSONL)
    const result = await executeBet2earnImport(db, plan, 'local-test-2')
    expect(result.upserted).toBe(2)
    const after = await pg.query<Record<string, unknown>>("SELECT id FROM tipsters WHERE platform='bet2earn' ORDER BY slug")
    expect(after.rows).toEqual(before.rows)
    const total = await pg.query<Record<string, unknown>>("SELECT count(*)::int AS n FROM tipsters WHERE platform='bet2earn'")
    expect(total.rows[0].n).toBe(2)
    const logs = await pg.query<Record<string, unknown>>("SELECT run_id FROM import_validation_log WHERE platform='bet2earn' ORDER BY id")
    expect(logs.rows.map((r) => r.run_id)).toEqual(['local-test-1', 'local-test-2'])
  })
})
