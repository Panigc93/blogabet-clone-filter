import { TransactionOutcomeUnknown, transactionAdapter } from '@/crawler/platforms/bet2invest/transaction-adapter'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, mkdtempSync, rmSync, chmodSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tipsters, type Tipster } from '@/db/schema'
import { periodReadContext } from '@/lib/bet2invest-period-read'
import { periodEligible, windowBounds, type PeriodAudit } from '@/lib/bet2invest-period-contract'
import { fromDbTipster } from '@/components/tipster-card-model'
import { executeAuditedOfflineImport, loadCommittedAudits, redeliverAudit } from '@/crawler/platforms/bet2invest/audit-manifest'
import { buildOfflineRow } from '@/crawler/platforms/bet2invest/offline-import'
import type { ImportDatabase } from '@/crawler/platforms/bet2invest/execute-offline-import'

const at = new Date('2026-11-17T16:27:00Z')
const now = new Date('2026-11-18T16:27:00Z')
const pg = new PGlite()
const db = drizzle(pg)
const dir = mkdtempSync('/tmp/b2i-audit-test-'); chmodSync(dir, 0o700)
const audit = (slug: string, capturedAt = at, val = '10.00'): PeriodAudit => ({ slug, capturedAt: capturedAt.toISOString(), windows: Object.fromEntries(([3, 6, 12] as const).map((n) => [n, { value: val, reason: null, bets: 1, months: 1, caveats: ['lastReset-null-no-prueba-ausencia-de-reinicio'], ...windowBounds(capturedAt, n) }])) as PeriodAudit['windows'] })
const txdb: ImportDatabase = { transaction: (fn) => pg.transaction((tx) => fn(tx)) }
const fixture = () => buildOfflineRow({ slug: 'audit-import', html: readFileSync(join(__dirname, 'fixtures/b2i-e2e-ssr.html'), 'utf8'), monthsJson: JSON.parse(readFileSync(join(__dirname, 'fixtures/b2i-e2e-months.json'), 'utf8')), capturedAt: at, surrogateId: -1 })
beforeAll(async () => {
  for (const f of ['0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql', '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql']) {
    for (const q of readFileSync(join(__dirname, '../../drizzle', f), 'utf8').split('--> statement-breakpoint')) if (q.trim()) await pg.exec(q)
  }
  const rows = [
    { id: 1, platform: 'blogabet', slug: 'bb', capturedAt: null, yield6m: '50' },
    { id: 2, platform: 'tipstrr', slug: 'ts', capturedAt: null, yield6m: '40' },
    { id: 3, platform: 'golazobets', slug: 'gb', capturedAt: null, yield6m: '30' },
    { id: 4, platform: 'bet2invest', slug: 'current', capturedAt: at, yield6m: '10' },
    { id: 5, platform: 'bet2invest', slug: 'old', capturedAt: new Date('2026-10-17T00:00:00Z'), yield6m: '999' },
    { id: 6, platform: 'bet2invest', slug: 'missing', capturedAt: at, yield6m: '888' },
    { id: 7, platform: 'bet2invest', slug: 'future', capturedAt: new Date('2026-11-30T00:00:00Z'), yield6m: '777' },
  ]
  await db.insert(tipsters).values(rows.map((r) => ({ ...r, name: r.slug })))
})
afterAll(async () => { await pg.close(); rmSync(dir, { recursive: true, force: true }) })
const audits = [audit('current'), audit('old', new Date('2026-10-17T00:00:00Z'), '999'), audit('future', new Date('2026-11-30T00:00:00Z'), '777')]

describe('shared Bet2Invest period eligibility before pagination', () => {
  it('sorts and projects only eligible audit-matched current-month values, preserves other platforms', async () => {
    const c = periodReadContext(audits, now)
    const first = await db.select(c.projection).from(tipsters).leftJoin(c.source, c.joinOn).orderBy(...c.order('yield6m')).limit(3)
    const second = await db.select(c.projection).from(tipsters).leftJoin(c.source, c.joinOn).orderBy(...c.order('yield6m')).limit(3).offset(3)
    expect(first.map((r) => r.slug)).toEqual(['bb', 'ts', 'gb'])
    expect(second[0].slug).toBe('current')
    expect(second[0].yield6m).toBe('10.00')
    expect(second.slice(1).every((r) => r.yield6m === null)).toBe(true)
    const card = fromDbTipster(second[0] as Tipster & { b2iAudit: PeriodAudit }, now)
    expect(card.yield6m.valuePct).toBe(10)
    expect(card.yield6m.note).toContain('1 apuestas')
    expect(card.yield6m.trace).toContain('may 2026 - oct 2026')
    expect(card.yield6m.trace).toContain('reinicio no confirmado')
  })
  it('month boundary masks old windows in SQL and card, but leaves historical yield and stored data alone', async () => {
    const c = periodReadContext(audits, new Date('2026-12-01T00:00:00Z'))
    const result = await db.select(c.projection).from(tipsters).leftJoin(c.source, c.joinOn).orderBy(...c.order('yield6m'))
    expect(result.filter((r) => r.platform === 'bet2invest').every((r) => r.yield6m === null)).toBe(true)
    const raw = (await pg.query<Record<string, unknown>>("SELECT yield_6m FROM tipsters WHERE slug='old'")).rows[0]
    expect(Number(raw.yield_6m)).toBe(999)
    expect(periodEligible(at, audit('current'), 6, '10', new Date('2026-12-01'))).toBe(false)
  })
  it('no configured index fails closed for B2I periods only; mismatched stored value does not rank', async () => {
    const c = periodReadContext([], now)
    const result = await db.select(c.projection).from(tipsters).leftJoin(c.source, c.joinOn)
    expect(result.filter((r) => r.platform === 'bet2invest').every((r) => r.yield6m === null)).toBe(true)
    expect(result.find((r) => r.slug === 'bb')!.yield6m).toBe('50.00')
    expect(periodEligible(at, audit('current'), 6, '11', now)).toBe(false)
  })
})

describe('private versioned audit manifest and readback receipt', () => {
  const p = { directory: dir, codeRevision: 'd5ac6ba', inputSha256: 'a'.repeat(64), calculatedAt: now }
  it('requires receipt before DB execution, records committed snapshot, loader checks content hash', async () => {
    const result = await executeAuditedOfflineImport(txdb, { rows: [fixture()], capturedAt: at, runId: 'success' }, p)
    expect(result.committed).toBe(true); expect(result.auditReceived).toBe(true)
    expect(result.receipt?.received).toBe(true)
    const loaded = loadCommittedAudits(dir)
    expect(loaded).toHaveLength(1); expect(loaded[0].capturedAt).toBe(at.toISOString())
    expect(readdirSync(dir)).toContain('success.committed.receipt.json')
  })
  it('delivery failure after commit returns explicit committed state; receipt-only redelivery never reruns DB', async () => {
    const localDir = mkdtempSync('/tmp/b2i-audit-delivery-'); chmodSync(localDir, 0o700)
    let calls = 0
    const receiving: ImportDatabase = { transaction: async (work) => {
      calls++
      const result = await txdb.transaction(work)
      // Synthetic lost receipt destination after actual DB commit.
      writeFileSync(join(localDir, 'delivery.committed.receipt.json'), 'conflict')
      return result
    } }
    const input = { rows: [fixture()], capturedAt: at, runId: 'delivery' }
    const result = await executeAuditedOfflineImport(receiving, input, { ...p, directory: localDir })
    expect(result.committed).toBe(true); expect(result.auditReceived).toBe(false)
    expect(result.recoveryManifest).toBeDefined()
    unlinkSync(join(localDir, 'delivery.committed.receipt.json'))
    expect(redeliverAudit(localDir, result.recoveryManifest!).received).toBe(true)
    expect(calls).toBe(1)
    await expect(executeAuditedOfflineImport(receiving, input, { ...p, directory: localDir })).rejects.toThrow('runId already used')
    rmSync(localDir, { recursive: true })
  })
  it('lost COMMIT acknowledgement is unknown, never labelled rolled back or eligible audit', async () => {
    const ambiguous: ImportDatabase = { transaction: async () => { throw new TransactionOutcomeUnknown('synthetic acknowledgement lost') } }
    const result = await executeAuditedOfflineImport(ambiguous, { rows: [fixture()], capturedAt: at, runId: 'unknown' }, p)
    expect(result.committed).toBeNull(); expect(result.failure).toBe('unknown')
    expect(readdirSync(dir)).toContain('unknown.unknown.receipt.json')
  })
  it('receipt tampering fails closed', () => {
    writeFileSync(join(dir, 'success.committed.receipt.json'), '{}')
    expect(() => loadCommittedAudits(dir)).toThrow('verification failed')
  })
  it('records a failed DB attempt without publishing it as committed audit', async () => {
    const fail: ImportDatabase = { transaction: async () => { throw new Error('local synthetic database failure') } }
    const result = await executeAuditedOfflineImport(fail, { rows: [fixture()], capturedAt: at, runId: 'failed' }, p)
    expect(result.committed).toBe(false); expect(result.failure).toBe('database')
    expect(readdirSync(dir)).toContain('failed.failed.receipt.json')
    expect(() => loadCommittedAudits(dir)).toThrow('verification failed')
  })
})
