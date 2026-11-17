import { ACTIVE_CLASS } from '@/crawler/platforms/bet2invest/active-period-index'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { executeDatabaseAuditedImport, reconcileRun, databaseAudits, MANIFEST_CLASS } from '@/crawler/platforms/bet2invest/database-manifest'
import { TransactionOutcomeUnknown } from '@/crawler/platforms/bet2invest/transaction-adapter'
import { buildOfflineRow } from '@/crawler/platforms/bet2invest/offline-import'
import type { ImportDatabase } from '@/crawler/platforms/bet2invest/execute-offline-import'
const pg = new PGlite()
const db: ImportDatabase = { transaction: (fn) => pg.transaction((tx) => fn(tx)) }
const at = new Date('2026-11-17T16:27:00Z')
const html = readFileSync(join(__dirname, 'fixtures/b2i-e2e-ssr.html'), 'utf8')
const monthsJson = JSON.parse(readFileSync(join(__dirname, 'fixtures/b2i-e2e-months.json'), 'utf8'))
const input = (runId: string, slug = runId) => ({ rows: [buildOfflineRow({ slug, html, monthsJson, capturedAt: at, surrogateId: -1 })], capturedAt: at, runId })
const provenance = { codeRevision: '8b27552', inputSha256: 'a'.repeat(64), calculatedAt: at }
const manifests = async () => (await pg.query<{ reason: string; run_id: string }>('SELECT reason, run_id FROM import_validation_log WHERE platform=$1 AND class=$2', ['bet2invest', MANIFEST_CLASS])).rows
beforeAll(async () => {
  for (const f of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql']) {
    for (const q of readFileSync(join(__dirname, '../../drizzle', f), 'utf8').split('--> statement-breakpoint')) if (q.trim()) await pg.exec(q)
  }
})
afterAll(() => pg.close())
describe('one atomic database manifest per Bet2Invest run', () => {
  it('writes one manifest, verifies receipt, same-run replay returns existing receipt without new writes', async () => {
    const result = await executeDatabaseAuditedImport(db, input('first', 'real-profile'), provenance)
    expect(result.committed).toBe(true); expect(result.plan?.counts.insert).toBe(1)
    expect(result.receipt?.received).toBe(true)
    const before = await manifests()
    expect(before).toHaveLength(1)
    const replay = await executeDatabaseAuditedImport(db, input('first', 'real-profile'), provenance)
    expect(replay.alreadyCommitted).toBe(true); expect(replay.receipt).toEqual(result.receipt)
    expect(await manifests()).toEqual(before)
    expect(await reconcileRun(pg, 'first')).toEqual(result.receipt)
    const decoded = databaseAudits(before.map((r) => ({ reason: r.reason, runId: r.run_id })))
    expect(decoded[0].slug).toBe('real-profile')
    expect(JSON.stringify(decoded)).not.toContain('inputSha256')
    expect(JSON.stringify(decoded)).not.toContain('codeRevision')
  })
  it('retains separate private SSR/API source dates, hashes and basis, rejects mismatched source replay', async () => {
    const batch = input('sourced-private')
    const ssr = { at: at.toISOString(), basis: 'http-date' as const, sha256: 'c'.repeat(64) }
    const api = { at: '2026-11-17T17:44:19.000Z', basis: 'local-download-completed' as const, sha256: 'd'.repeat(64) }
    const p = {...provenance,sourceCaptures:[{slug:'sourced-private',ssr,api}]}
    const result = await executeDatabaseAuditedImport(db,batch,p)
    expect(result.committed).toBe(true)
    const record = (await manifests()).find(r=>r.run_id==='sourced-private')!
    expect(JSON.parse(record.reason).manifest.sourceCaptures).toEqual(p.sourceCaptures)
    expect(JSON.stringify(databaseAudits([{reason:record.reason,runId:record.run_id}]))).not.toContain('sourceCaptures')
    await expect(executeDatabaseAuditedImport(db,batch,{...p,sourceCaptures:[{slug:'sourced-private',ssr,api:{...api,sha256:'e'.repeat(64)}}]})).rejects.toThrow('conflicts')
    await expect(executeDatabaseAuditedImport(db,input('sourced-invalid'),{...p,sourceCaptures:[]})).rejects.toThrow('coverage')
    await expect(executeDatabaseAuditedImport(db,batch,{...p,sourceCaptures:[{slug:'sourced-private',ssr:{...ssr,at:api.at},api}]})).rejects.toThrow('anchor')
  })
  it('rejects run id provenance conflict, reserved log slug does not collide with actual tipster identity', async () => {
    await expect(executeDatabaseAuditedImport(db, input('first', 'real-profile'), { ...provenance, inputSha256: 'b'.repeat(64) })).rejects.toThrow('conflicts')
    await expect(executeDatabaseAuditedImport(db, input('first', 'different-payload'), provenance)).rejects.toThrow('conflicts')
    await expect(executeDatabaseAuditedImport(db, input('../escape'), provenance)).rejects.toThrow('run id')
    expect((await executeDatabaseAuditedImport(db, input('reserved', '__b2i_run__:first'), provenance)).committed).toBe(true)
    const actual = await pg.query("SELECT * FROM tipsters WHERE slug='__b2i_run__:first'")
    expect(actual.rows).toHaveLength(1)
  })
  it('manifest write failure rolls back tipsters and logs atomically, including no success receipt', async () => {
    await pg.exec("ALTER TABLE import_validation_log ADD CONSTRAINT reject_manifest CHECK (run_id != 'fail-manifest')")
    await expect(executeDatabaseAuditedImport(db, input('fail-manifest'), provenance)).rejects.toThrow()
    expect((await pg.query("SELECT * FROM tipsters WHERE slug='fail-manifest'")).rows).toHaveLength(0)
    expect(await reconcileRun(pg, 'fail-manifest')).toBeNull()
    await pg.exec('ALTER TABLE import_validation_log DROP CONSTRAINT reject_manifest')
  })
  it('COMMIT acknowledgement loss is unknown; fresh read reconciles committed manifest without replay', async () => {
    let writes = 0
    const lost: ImportDatabase = { transaction: async (work) => { const result = await db.transaction(work); writes++; throw new TransactionOutcomeUnknown('synthetic dropped acknowledgement') } }
    const result = await executeDatabaseAuditedImport(lost, input('unknown-commit'), provenance)
    expect(result.state).toBe('unknown'); expect(result.committed).toBeNull()
    expect((await reconcileRun(pg, 'unknown-commit'))?.received).toBe(true)
    expect((await executeDatabaseAuditedImport(db, input('unknown-commit'), provenance)).alreadyCommitted).toBe(true)
    expect(writes).toBe(1)
    expect(await reconcileRun(pg, 'never-started')).toBeNull()
  })
  it('oversize manifest aborts whole batch without partial rows or log receipt', async () => {
    const batch = input('too-big')
    const rows = [...batch.rows, { slug: 'huge-quarantine', status: 'quarantine' as const, reason: 'x'.repeat(2 * 1024 * 1024) }]
    await expect(executeDatabaseAuditedImport(db, { ...batch, rows }, provenance)).rejects.toThrow('exceeds 2 MiB')
    expect((await pg.query("SELECT * FROM tipsters WHERE slug='too-big'")).rows).toHaveLength(0)
    expect(await reconcileRun(pg, 'too-big')).toBeNull()
  })
  it('active index failure rolls back rows and historical manifest together', async () => {
    const before=(await pg.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE class=$1',[ACTIVE_CLASS])).rows
    await pg.exec("ALTER TABLE import_validation_log ADD CONSTRAINT reject_active CHECK (class <> 'b2i-active-period-index-v1' OR position('fail-active' in reason)=0)")
    await expect(executeDatabaseAuditedImport(db,input('fail-active'),provenance)).rejects.toThrow()
    expect((await pg.query("SELECT slug FROM tipsters WHERE slug='fail-active'")).rows).toHaveLength(0)
    expect(await reconcileRun(pg,'fail-active')).toBeNull()
    expect((await pg.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE class=$1',[ACTIVE_CLASS])).rows).toEqual(before)
    await pg.exec('ALTER TABLE import_validation_log DROP CONSTRAINT reject_active')
  })
  it('tamper and duplicate run identity fail closed; manifest class is separate from errors', async () => {
    const rows = await manifests()
    const body = JSON.parse(rows[0].reason); body.manifest.rows[0].windows[3].bets++
    expect(() => databaseAudits([{ reason: JSON.stringify(body), runId: rows[0].run_id }])).toThrow('integrity')
    await pg.query('INSERT INTO import_validation_log (platform,slug,class,reason,run_id) SELECT platform,slug,class,reason,run_id FROM import_validation_log WHERE run_id=$1', ['first'])
    await expect(reconcileRun(pg, 'first')).rejects.toThrow('duplicate')
    const errors = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM import_validation_log WHERE platform=$1 AND class NOT IN ($2,$3)', ['bet2invest', MANIFEST_CLASS, ACTIVE_CLASS])
    expect(errors.rows[0].n).toBe(0)
  })
})
