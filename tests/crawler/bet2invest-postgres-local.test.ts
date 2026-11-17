// Opt-in real PostgreSQL test. Only a Unix socket directory with the explicit
// test database is accepted. No DATABASE_URL, TCP host or production adapter.
import { executeDatabaseAuditedImport, reconcileRun } from '@/crawler/platforms/bet2invest/database-manifest'
import { transactionAdapter } from '@/crawler/platforms/bet2invest/transaction-adapter'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userInfo } from 'node:os'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { executeOfflineImport, type ImportDatabase, type ImportTransaction } from '@/crawler/platforms/bet2invest/execute-offline-import'
import { buildOfflineRow, simulateImport } from '@/crawler/platforms/bet2invest/offline-import'

const socket = process.env.B2I_LOCAL_PG_SOCKET
const enabled = !!socket
if (socket && !/^\/tmp\/b2i-local-pg-[a-zA-Z0-9-]+$/.test(socket)) throw new Error('only an explicit local test socket allowed')
const at = new Date('2026-11-17T16:27:00Z')
const html = readFileSync(join(__dirname, 'fixtures/b2i-e2e-ssr.html'), 'utf8')
const monthsJson = JSON.parse(readFileSync(join(__dirname, 'fixtures/b2i-e2e-months.json'), 'utf8'))
const row = (slug: string) => buildOfflineRow({ slug, html, monthsJson, capturedAt: at, surrogateId: -1 })
const client = () => new Client({ host: socket, port: 55439, database: 'b2i_executor_test', user: userInfo().username, connectionTimeoutMillis: 1000 })
const sessions: Client[] = []
const open = async () => { const c = client(); await c.connect(); sessions.push(c); return c }
const events: Record<string, unknown>[] = []

// LOCAL TEST ADAPTER, not wired to the application. PG14 has no native total
// transaction_timeout. Deadline checks + statement_timeout bound individual
// SQL and cooperative whole-batch work. Idle-in-tx timeout is a final guard.
function adapter(c: Client, opts: { statementMs?: number; budgetMs?: number; intercept?: (text: string, c: Client) => Promise<void> } = {}): ImportDatabase {
  return { transaction: async (work) => {
    const start = performance.now()
    const check = () => { if (performance.now() - start > (opts.budgetMs ?? 2000)) throw new Error('local transaction budget exceeded') }
    await c.query('BEGIN')
    try {
      await c.query("SELECT set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true)", [String(opts.statementMs ?? 1000), '2000'])
      const tx: ImportTransaction = { query: async (text, params) => {
        check()
        if (opts.intercept) await opts.intercept(text, c)
        const result = await c.query(text, params)
        check()
        return { rows: result.rows }
      } }
      const result = await work(tx)
      check()
      await c.query('COMMIT')
      return result
    } catch (error) {
      try { await c.query('ROLLBACK') } catch { /* preserve original error */ }
      throw error
    }
  } }
}
const input = (slug: string) => ({ rows: [row(slug)], capturedAt: at, runId: 'independent-sessions' })

describe.skipIf(!enabled)('real local PostgreSQL independent sessions and timeout', () => {
  let a: Client, b: Client, observer: Client
  beforeAll(async () => {
    a = await open(); b = await open(); observer = await open()
    for (const f of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql']) {
      for (const q of readFileSync(join(__dirname, '../../drizzle', f), 'utf8').split('--> statement-breakpoint')) if (q.trim()) await a.query(q)
    }
    await a.query("INSERT INTO tipsters (id, platform, slug, name, picks) VALUES (1, 'blogabet', 'sentinel', 'untouched', 123)")
  })
  afterAll(async () => {
    if (enabled) {
      console.log('B2I_REAL_PG_EVIDENCE', JSON.stringify(events))
      await Promise.all(sessions.map((c) => c.end()))
    }
  })
  it('has three independently pinned backends', async () => {
    const ids = await Promise.all([a, b, observer].map(async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid))
    expect(new Set(ids).size).toBe(3)
    events.push({ test: 'independent-backends', ids, version: (await a.query('SELECT version()')).rows[0].version })
  })
  it('NOWAIT refuses an existing Blogabet writer; nothing from failed import persists', async () => {
    await b.query('BEGIN')
    await b.query("UPDATE tipsters SET picks=124 WHERE id=1")
    const start = performance.now()
    let code = ''
    try { await executeOfflineImport(adapter(a), input('locked-out')) } catch (error) { code = (error as { code: string }).code }
    const ms = Math.round(performance.now() - start)
    await b.query('ROLLBACK')
    expect(code).toBe('55P03')
    expect((await observer.query("SELECT * FROM tipsters WHERE slug='locked-out'")).rows).toHaveLength(0)
    expect((await observer.query('SELECT picks FROM tipsters WHERE id=1')).rows[0].picks).toBe(123)
    events.push({ test: 'existing-writer-nowait', sqlstate: code, elapsedMs: ms })
  })
  it('reads remain possible, other-platform writes block while the import lock is held, then recover', async () => {
    let signal!: () => void, resume!: () => void
    const locked = new Promise<void>((resolve) => { signal = resolve })
    const gate = new Promise<void>((resolve) => { resume = resolve })
    const heldStart = performance.now()
    const importing = executeOfflineImport(adapter(a, { intercept: async (text) => {
      if (text.startsWith('SELECT * FROM tipsters')) { signal(); await gate }
    } }), input('held-import'))
    await locked
    try {
      expect((await observer.query('SELECT picks FROM tipsters WHERE id=1')).rows[0].picks).toBe(123)
      await b.query("SET statement_timeout='100ms'")
      const start = performance.now()
      await expect(b.query('UPDATE tipsters SET picks=999 WHERE id=1')).rejects.toMatchObject({ code: '57014' })
      events.push({ test: 'writer-blocked-read-available', writerTimeoutMs: Math.round(performance.now() - start) })
    } finally { resume() }
    expect((await importing).counts.insert).toBe(1)
    await b.query("SET statement_timeout='1000ms'")
    await b.query('BEGIN')
    await b.query('UPDATE tipsters SET picks=321 WHERE id=1')
    await b.query('ROLLBACK')
    expect((await observer.query('SELECT picks FROM tipsters WHERE id=1')).rows[0].picks).toBe(123)
    events.push({ test: 'lock-released-after-commit', heldTransactionMs: Math.round(performance.now() - heldStart) })
  })
  it('statement timeout after a tipster insert rolls back rows and logs, releases lock, permits retry', async () => {
    const before = (await observer.query('SELECT count(*) FROM import_validation_log')).rows[0].count
    const batch = { ...input('statement-timeout'), rows: [row('statement-timeout'), { slug: 'bad', status: 'parse-error' as const, reason: 'local test' }] }
    const start = performance.now()
    await expect(executeOfflineImport(adapter(a, { statementMs: 75, intercept: async (text, c) => {
      if (text.startsWith('INSERT INTO import_validation_log')) await c.query('SELECT pg_sleep(0.3)')
    } }), batch)).rejects.toMatchObject({ code: '57014' })
    const ms = Math.round(performance.now() - start)
    expect((await observer.query("SELECT * FROM tipsters WHERE slug='statement-timeout'")).rows).toHaveLength(0)
    expect((await observer.query('SELECT count(*) FROM import_validation_log')).rows[0].count).toBe(before)
    await b.query('BEGIN'); await b.query('UPDATE tipsters SET picks=321 WHERE id=1'); await b.query('ROLLBACK')
    expect((await executeOfflineImport(adapter(a), batch)).counts.insert).toBe(1)
    events.push({ test: 'statement-timeout-atomic-rollback-retry', sqlstate: '57014', elapsedMs: ms })
  })
  it.skipIf(!process.env.B2I_LOCAL_CAPTURE_DIR)('imports and replays the full local corpus with measured lock/transaction duration', async () => {
    const { rows, report } = simulateImport(process.env.B2I_LOCAL_CAPTURE_DIR!, at)
    const before = (await observer.query("SELECT * FROM tipsters WHERE platform != 'bet2invest' ORDER BY id")).rows
    let lockedAt = 0
    const start = performance.now()
    const first = await executeOfflineImport(adapter(a, { statementMs: 2000, budgetMs: 10000, intercept: async (text) => {
      if (text.startsWith('SELECT * FROM tipsters')) lockedAt = performance.now()
    } }), { rows, capturedAt: at, runId: 'full-first' })
    const firstMs = Math.round(performance.now() - start)
    const lockHeldMs = Math.round(performance.now() - lockedAt)
    const stored = (await observer.query("SELECT * FROM tipsters WHERE platform='bet2invest'")).rows
    const bySlug = new Map(stored.map((r) => [r.slug, r]))
    for (const r of rows) {
      if (r.status !== 'row') continue
      const s = bySlug.get(r.slug)
      expect(s).toBeDefined()
      for (const [col, val] of Object.entries({ picks: r.insert.picks, profit: r.insert.profit, yield: r.insert.yield, yield_3m: r.insert.yield3m, yield_6m: r.insert.yield6m, yield_12m: r.insert.yield12m, price: r.insert.price })) {
        if (val == null) expect(s![col]).toBeNull()
        else expect(Number(s![col]) === Number(val)).toBe(true) // PostgreSQL numeric normalizes -0 to 0
      }
      expect(new Date(s!.captured_at).getTime()).toBe(at.getTime())
    }
    const replayStart = performance.now()
    const replay = await executeOfflineImport(adapter(a, { statementMs: 2000, budgetMs: 10000 }), { rows, capturedAt: at, runId: 'full-replay' })
    const replayMs = Math.round(performance.now() - replayStart)
    expect(first.counts.insert).toBe(report.rows)
    expect(replay.counts.insert).toBe(0)
    expect(replay.counts.skip).toBe(report.rows)
    expect((await observer.query("SELECT * FROM tipsters WHERE platform != 'bet2invest' ORDER BY id")).rows).toEqual(before)
    events.push({ test: 'full-corpus-real-postgres', total: rows.length, first: first.counts, replay: replay.counts, firstTransactionMs: firstMs, firstLockHeldUpperBoundMs: lockHeldMs, replayTransactionMs: replayMs, otherPlatformsUnchanged: true, allNumericValuesAndCaptureDatesVerified: true })
  }, 120000)
  it('inert explicit adapter commits and rolls back against a real pinned connection', async () => {
    const pinned = { query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => ({ rows: (await a.query(text, params)).rows as T[] }), discard: async () => { await a.end() } }
    const ctrl = new AbortController()
    const explicit = transactionAdapter(pinned, { statementMs: 100, idleMs: 1000, budgetMs: 1000, signal: ctrl.signal })
    expect((await executeOfflineImport(explicit, input('explicit-adapter'))).counts.insert).toBe(1)
    await expect(explicit.transaction(async (tx) => { await tx.query('UPDATE tipsters SET picks=999 WHERE id=1'); ctrl.abort(); await tx.query('SELECT 1') })).rejects.toThrow('cancelled')
    expect((await observer.query('SELECT picks FROM tipsters WHERE id=1')).rows[0].picks).toBe(123)
    const timeoutDb = transactionAdapter(pinned, { statementMs: 50, idleMs: 1000, budgetMs: 1000 })
    await expect(timeoutDb.transaction(async (tx) => { await tx.query('SELECT pg_sleep(0.2)') })).rejects.toMatchObject({ code: '57014' })
    expect((await a.query('SELECT 1 AS ok')).rows[0].ok).toBe(1)
    events.push({ test: 'explicit-inert-adapter-real-pin', commit: true, cancelledTransactionRolledBack: true, statementTimeoutRolledBack: true })
  })
  it('single database manifest commits atomically and reconciles on an independent backend', async () => {
    const pinned = { query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => ({ rows: (await a.query(text, params)).rows as T[] }), discard: async () => { await a.end() } }
    const explicit = transactionAdapter(pinned, { statementMs: 1000, idleMs: 2000, budgetMs: 3000 })
    const provenance = { codeRevision: '8b27552', inputSha256: 'a'.repeat(64), calculatedAt: at }
    const batch = input('atomic-db-manifest')
    const result = await executeDatabaseAuditedImport(explicit, batch, provenance)
    expect(result.receipt?.received).toBe(true)
    const independent = { query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => ({ rows: (await observer.query(text, params)).rows as T[] }) }
    expect(await reconcileRun(independent, batch.runId)).toEqual(result.receipt)
    expect((await executeDatabaseAuditedImport(explicit, batch, provenance)).alreadyCommitted).toBe(true)
    events.push({ test: 'atomic-database-manifest-independent-readback', oneRunReceipt: true, replayNoNewWrites: true })
  })
  it('cooperative whole-transaction budget aborts many individually short queries', async () => {
    let n = 0
    const start = performance.now()
    await expect(executeOfflineImport(adapter(a, { statementMs: 200, budgetMs: 100, intercept: async (_, c) => {
      n++; await c.query('SELECT pg_sleep(0.06)')
    } }), input('budget-timeout'))).rejects.toThrow('budget exceeded')
    const failedMs = Math.round(performance.now() - start)
    expect((await observer.query("SELECT * FROM tipsters WHERE slug='budget-timeout'")).rows).toHaveLength(0)
    expect((await executeOfflineImport(adapter(a), input('budget-timeout'))).counts.insert).toBe(1)
    events.push({ test: 'cooperative-total-budget', queries: n, elapsedMs: failedMs, caveat: 'not native transaction_timeout; checks occur between operations' })
  })
})
