import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildOfflineRow, type OfflineRow } from '@/crawler/platforms/bet2invest/offline-import'
import { executeOfflineImport, type ImportDatabase } from '@/crawler/platforms/bet2invest/execute-offline-import'

const pg = new PGlite()
const at = new Date('2026-11-17T16:27:00Z')
const html = readFileSync(join(__dirname, 'fixtures/b2i-e2e-ssr.html'), 'utf8')
const monthsJson = JSON.parse(readFileSync(join(__dirname, 'fixtures/b2i-e2e-months.json'), 'utf8'))
const good = (slug: string, capturedAt = at) => buildOfflineRow({ slug, html, monthsJson, capturedAt, surrogateId: -1 })
const db: ImportDatabase = { transaction: (fn) => pg.transaction((tx) => fn(tx)) }
const run = (rows: OfflineRow[], capturedAt = at) => executeOfflineImport(db, { rows, capturedAt, runId: 'local-test' })
const get = async (slug: string) => (await pg.query<Record<string, unknown>>("SELECT * FROM tipsters WHERE platform = 'bet2invest' AND slug = $1", [slug])).rows[0]

beforeAll(async () => {
  for (const file of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql','0007_blogabet_access_signal.sql']) {
    for (const q of readFileSync(join(__dirname, '../../drizzle', file), 'utf8').split('--> statement-breakpoint')) {
      if (q.trim()) await pg.exec(q)
    }
  }
  await pg.exec("INSERT INTO tipsters(id, platform, slug, name, picks, yield_3m) VALUES (111, 'blogabet', 'same', 'BB', 888, 12.34), (112, 'tipstrr', 'same', 'TS', 777, 23.45), (113, 'golazobets', 'same', 'GB', 666, 34.56)")
})
afterAll(() => pg.close())

describe('Bet2Invest executor against isolated PostgreSQL (PGlite), real migrations', () => {
  it('assigns sequence id, persists exact values and does not touch same slug on other platforms', async () => {
    expect((await run([good('same')])).counts.insert).toBe(1)
    const row = await get('same')
    expect(Number(row.id)).toBeLessThanOrEqual(-2000000000)
    expect(row.picks).toBe(12)
    expect(Number(row.yield_3m)).toBe(-38.60)
    expect(new Date(row.captured_at as string).getTime()).toBe(at.getTime())
    const other = await pg.query<Record<string, unknown>>("SELECT platform, picks, yield_3m FROM tipsters WHERE platform != 'bet2invest' ORDER BY id")
    expect(other.rows.map((r) => r.picks)).toEqual([888, 777, 666])
    expect(other.rows.map((r) => Number(r.yield_3m))).toEqual([12.34, 23.45, 34.56])
  })
  it('replay and older capture skip without consuming ids; logs capture time, not import time', async () => {
    const before = await pg.query('SELECT last_value FROM tipsters_internal_id_seq')
    const original = await get('same')
    expect((await run([good('same')])).counts.skip).toBe(1)
    const older = new Date('2026-10-17T16:27:00Z')
    expect((await run([good('same', older)], older)).counts.skip).toBe(1)
    expect(await get('same')).toEqual(original)
    expect((await pg.query('SELECT last_value FROM tipsters_internal_id_seq')).rows).toEqual(before.rows)
    const logs = await pg.query<Record<string, unknown>>("SELECT class, captured_at FROM import_validation_log WHERE slug = 'same' ORDER BY id")
    expect(logs.rows).toHaveLength(2)
    expect(logs.rows.every((r) => r.class === 'frescura')).toBe(true)
  })
  it('later capture clears null derived windows, preserves absent fields and id', async () => {
    await pg.exec("UPDATE tipsters SET followers = 17 WHERE platform = 'bet2invest' AND slug = 'same'")
    const original = await get('same')
    const later = new Date('2027-06-15T00:00:00Z')
    expect((await run([good('same', later)], later)).counts.update).toBe(1)
    const row = await get('same')
    expect(row.id).toBe(original.id)
    expect(row.followers).toBe(17)
    expect(row.yield_3m).toBeNull()
    expect(Number(row.yield_12m)).toBe(-38.60)
  })
  it('preserves digit-bearing columns on update when the new field is absent', async () => {
    const row = good('digits')
    if (row.status !== 'row') throw new Error('fixture')
    row.insert.picksFree3mAvg = '12.34'
    row.insert.yieldFree3m = '56.78'
    await run([row])
    const later = new Date('2026-11-18T16:27:00Z')
    await run([good('digits', later)], later)
    const stored = await get('digits')
    expect(Number(stored.picks_free_3m_avg)).toBe(12.34)
    expect(Number(stored.yield_free_3m)).toBe(56.78)
  })
  it('quarantine, unselected and parse errors only log; no id allocation or tipster change', async () => {
    const before = await pg.query('SELECT last_value FROM tipsters_internal_id_seq')
    const original = await get('same')
    const result = await run([
      { slug: 'same', status: 'quarantine', reason: 'cuarentena[fixture]: invalid' },
      { slug: 'unselected', status: 'not-selected', reason: 'fixture' },
      { slug: 'parse', status: 'parse-error', reason: 'fixture' },
    ])
    expect(result.counts).toMatchObject({ insert: 0, skip: 1, notSelected: 1, parseError: 1 })
    expect(await get('same')).toEqual(original)
    expect(await get('unselected')).toBeUndefined()
    expect((await pg.query('SELECT last_value FROM tipsters_internal_id_seq')).rows).toEqual(before.rows)
    expect(result.log).toHaveLength(3)
  })
  it('failure after a tipster write but during logging rolls back both tables', async () => {
    await pg.exec("ALTER TABLE import_validation_log ADD CONSTRAINT reject_test CHECK (run_id != 'reject-test')")
    const before = await pg.query('SELECT count(*) AS n FROM import_validation_log')
    await expect(executeOfflineImport(db, {
      rows: [good('rollback'), { slug: 'failure', status: 'parse-error', reason: 'test' }], capturedAt: at, runId: 'reject-test',
    })).rejects.toThrow()
    expect(await get('rollback')).toBeUndefined()
    expect((await pg.query('SELECT count(*) AS n FROM import_validation_log')).rows).toEqual(before.rows)
    await pg.exec('ALTER TABLE import_validation_log DROP CONSTRAINT reject_test')
    expect((await run([good('rollback')])).counts.insert).toBe(1)
  })
  it('failure on a later tipster rolls back earlier writes in the same batch', async () => {
    const invalid = good('too-large')
    if (invalid.status !== 'row') throw new Error('fixture')
    invalid.insert.yield = '1000000.00'
    await expect(run([good('before-failure'), invalid])).rejects.toThrow()
    expect(await get('before-failure')).toBeUndefined()
    expect(await get('too-large')).toBeUndefined()
  })
  it('concurrent batches for a new identity create once, then skip', async () => {
    const results = await Promise.all([run([good('concurrent')]), run([good('concurrent')])])
    expect(results.map((r) => r.counts.insert).sort()).toEqual([0, 1])
    expect(results.map((r) => r.counts.skip).sort()).toEqual([0, 1])
  })
  it('treats hostile slug and log content only as bound SQL data', async () => {
    const slug = "quoted'; DROP TABLE tipsters; --"
    expect((await run([good(slug)])).counts.insert).toBe(1)
    expect((await get(slug)).slug).toBe(slug)
    const reason = "'); DROP TABLE import_validation_log; --"
    await run([{ slug: 'quoted-log', status: 'parse-error', reason }])
    const logged = await pg.query<{ reason: string }>('SELECT reason FROM import_validation_log WHERE slug=$1', ['quoted-log'])
    expect(logged.rows[0].reason).toBe(reason)
  })
  it('rejects duplicate slugs, wrong platform and re-dated inputs before beginning transaction', async () => {
    const failDb: ImportDatabase = { transaction: async () => { throw new Error('transaction should not start') } }
    const input = { rows: [good('duplicate'), good('duplicate')], capturedAt: at, runId: 'test' }
    await expect(executeOfflineImport(failDb, { ...input, rows: Array.from({ length: 1001 }, (_, i) => ({ slug: `cap-${i}`, status: 'parse-error' as const, reason: 'test' })) })).rejects.toThrow('exceeds 1000')
    await expect(executeOfflineImport(failDb, input)).rejects.toThrow('duplicate slug')
    const bad = good('bad')
    if (bad.status !== 'row') throw new Error('fixture')
    bad.insert.platform = 'blogabet'
    await expect(executeOfflineImport(failDb, { ...input, rows: [bad] })).rejects.toThrow('identity')
    await expect(executeOfflineImport(failDb, { ...input, rows: [good('old')], capturedAt: new Date('2027-01-01') })).rejects.toThrow('date mismatch')
  })
})
