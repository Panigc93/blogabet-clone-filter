// LOCAL ONLY. In-memory PostgreSQL. No env, URLs, remote connections or credentials.
// npx tsx scripts/bet2invest-local-transaction.ts <captureDir> <capturedAtISO> <reportPath>
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { simulateImport } from '../crawler/platforms/bet2invest/offline-import'
import { executeDatabaseAuditedImport, reconcileRun, MANIFEST_CLASS } from '../crawler/platforms/bet2invest/database-manifest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { executeOfflineImport, type ImportDatabase } from '../crawler/platforms/bet2invest/execute-offline-import'

async function main() {
  const [dir, at, out] = process.argv.slice(2)
  const capturedAt = new Date(at)
  if (!dir || !out || !Number.isFinite(capturedAt.getTime())) throw new Error('usage: <captureDir> <capturedAtISO> <reportPath>')
  const pg = new PGlite()
  try {
    for (const f of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql']) {
      for (const sql of readFileSync(resolve(__dirname, '../drizzle', f), 'utf8').split('--> statement-breakpoint')) {
        if (sql.trim()) await pg.exec(sql)
      }
    }
    // Other-platform sentinels with the SAME slug as an imported profile.
    const { report, rows } = simulateImport(dir, capturedAt)
    const slug = rows.find((r) => r.status === 'row')?.slug ?? 'sentinel'
    for (const [id, platform] of [[1, 'blogabet'], [2, 'tipstrr'], [3, 'golazobets']] as const) {
      await pg.query('INSERT INTO tipsters (id, platform, slug, name, picks) VALUES ($1,$2,$3,$4,$5)', [id, platform, slug, 'sentinel', 123])
    }
    const before = (await pg.query("SELECT * FROM tipsters WHERE platform != 'bet2invest' ORDER BY id")).rows
    const db: ImportDatabase = { transaction: (fn) => pg.transaction((tx) => fn(tx)) }
    const provenance = { codeRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(__dirname, '..'), encoding: 'utf8' }).trim(), inputSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), calculatedAt: new Date() }
    const firstStart = performance.now()
    const firstResult = await executeDatabaseAuditedImport(db, { rows, capturedAt, runId: 'local-first' }, provenance)
    if (!firstResult.committed || !firstResult.plan) throw new Error('local first import not committed')
    const first = firstResult.plan
    const firstTransactionMs = Math.round(performance.now() - firstStart)
    // Compare every persisted field against the transaction's plan.
    for (const item of first.plans) {
      if (item.plan.action !== 'insert') continue
      const row = (await pg.query<Record<string, unknown>>("SELECT * FROM tipsters WHERE platform='bet2invest' AND slug=$1", [item.slug])).rows[0]
      const p = item.plan.insert
      for (const [col, value] of Object.entries({ picks: p.picks, yield: p.yield, yield_3m: p.yield3m, yield_6m: p.yield6m, yield_12m: p.yield12m, profit: p.profit, price: p.price })) {
        if (value == null ? row[col] !== null : Number(row[col]) !== Number(value)) throw new Error(`persistence mismatch: ${item.slug}/${col}`)
      }
      if (new Date(row.captured_at as string).getTime() !== capturedAt.getTime()) throw new Error('capture time changed')
    }
    const replayStart = performance.now()
    const secondResult = await executeDatabaseAuditedImport(db, { rows, capturedAt, runId: 'local-replay' }, provenance)
    if (!secondResult.committed || !secondResult.plan) throw new Error('local replay not committed')
    const second = secondResult.plan
    const replayTransactionMs = Math.round(performance.now() - replayStart)
    const after = (await pg.query("SELECT * FROM tipsters WHERE platform != 'bet2invest' ORDER BY id")).rows
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('other platform changed')
    const persisted = (await pg.query("SELECT count(*)::int AS rows, count(yield_3m)::int AS yield3m, count(yield_6m)::int AS yield6m, count(yield_12m)::int AS yield12m FROM tipsters WHERE platform='bet2invest'")).rows
    const logs = (await pg.query('SELECT run_id, class, count(*)::int AS count FROM import_validation_log GROUP BY run_id, class ORDER BY run_id, class')).rows
    const manifestReceipt = await reconcileRun(pg, 'local-first')
    if (!manifestReceipt || manifestReceipt.sha256 !== firstResult.receipt?.sha256) throw new Error('manifest receipt mismatch')
    const manifestCount = (await pg.query('SELECT count(*)::int AS n FROM import_validation_log WHERE platform=$1 AND class=$2', ['bet2invest', MANIFEST_CLASS])).rows
    const result = { mode: 'local-memory-only', manifestReceipt, manifestCount, firstTransactionMs, replayTransactionMs, sourceReport: report, first: first.counts, replay: second.counts, persisted, logs, otherPlatformsUnchanged: true, allPersistedValuesVerified: true, executedAt: new Date().toISOString(), capturedAt: capturedAt.toISOString(), caveat: 'Windows remain anchored to capturedAt, not executedAt. This does not refresh a stale capture.', windowAudit: rows.filter((r) => r.status === 'row').map((r) => ({ slug: r.slug, windows: r.windows })) }
    writeFileSync(out, JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ ...result, windowAudit: `${result.windowAudit.length} records in report` }, null, 2))
  } finally {
    await pg.close()
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
