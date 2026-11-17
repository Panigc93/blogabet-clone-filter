// Server-side private artifacts only. Never import this module in client code.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { PERIODS, validAudit, windowBounds, type PeriodAudit } from '@/lib/bet2invest-period-contract'
import { executeOfflineImport, type ImportDatabase, type ExecuteOfflineImportInput } from './execute-offline-import'
import { TransactionOutcomeUnknown } from './transaction-adapter'
import type { ImportPlan } from './offline-import'

interface Manifest {
  schemaVersion: 1; platform: 'bet2invest'; runId: string
  codeRevision: string; inputSha256: string; capturedAt: string
  calculatedAt: string; executedAt: string; finalizedAt: string
  state: 'planned' | 'committed' | 'failed' | 'unknown'; counts: ImportPlan['counts'] | null
  rows: PeriodAudit[]
  outcomes: { slug: string; status: string; reason?: string }[]
}
export interface AuditReceipt { runId: string; state: Manifest['state']; sha256: string; bytes: number; received: true }
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
const safeRun = (s: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(s)
function checkDirectory(dir: string) {
  if (!isAbsolute(dir)) throw new Error('audit directory must be absolute and private')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if ((statSync(dir).mode & 0o077) !== 0) throw new Error('audit directory must have mode 0700')
}
function deliver(dir: string, manifest: Manifest): AuditReceipt {
  checkDirectory(dir)
  if (!safeRun(manifest.runId)) throw new Error('invalid audit run id')
  const base = `${manifest.runId}.${manifest.state}`
  const body = JSON.stringify(manifest)
  const path = join(dir, `${base}.json`)
  // Immutable per run/state, exclusive create. Never overwrite a receipt.
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== body) throw new Error('immutable manifest conflict')
  } else writeFileSync(path, body, { flag: 'wx', mode: 0o600 })
  if (readFileSync(path, 'utf8') !== body) throw new Error('audit readback mismatch')
  const receipt: AuditReceipt = { runId: manifest.runId, state: manifest.state, sha256: digest(body), bytes: Buffer.byteLength(body), received: true }
  const receiptPath = join(dir, `${base}.receipt.json`)
  if (existsSync(receiptPath)) {
    if (readFileSync(receiptPath, 'utf8') !== JSON.stringify(receipt)) throw new Error('immutable receipt conflict')
  } else writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 })
  if (JSON.parse(readFileSync(join(dir, `${base}.receipt.json`), 'utf8')).sha256 !== receipt.sha256) throw new Error('receipt readback mismatch')
  return receipt
}

/** Commit and delivery are distinct. A delivery failure after commit returns
 * committed:true with auditReceived:false, NEVER retries database effects.
 * The caller must retain recoveryManifest and arrange receipt-only redelivery.
 */
export async function executeAuditedOfflineImport(db: ImportDatabase, input: ExecuteOfflineImportInput, p: {
  directory: string; codeRevision: string; inputSha256: string; calculatedAt: Date
}): Promise<{ committed: boolean | null; plan?: ImportPlan; auditReceived: boolean; receipt?: AuditReceipt; recoveryManifest?: string; failure?: 'database' | 'delivery' | 'unknown' }> {
  if (!safeRun(input.runId) || !/^[a-f0-9]{7,40}$/.test(p.codeRevision) || !/^[a-f0-9]{64}$/.test(p.inputSha256)) throw new Error('invalid audit provenance')
  const base: Manifest = {
    schemaVersion: 1, platform: 'bet2invest', runId: input.runId, codeRevision: p.codeRevision, inputSha256: p.inputSha256,
    capturedAt: input.capturedAt.toISOString(), calculatedAt: p.calculatedAt.toISOString(), executedAt: new Date().toISOString(), finalizedAt: new Date().toISOString(),
    state: 'planned', counts: null,
    outcomes: input.rows.map((r) => ({ slug: r.slug, status: r.status, ...('reason' in r ? { reason: r.reason } : {}) })),
    rows: input.rows.flatMap((r) => r.status !== 'row' ? [] : [{ slug: r.slug, capturedAt: input.capturedAt.toISOString(), windows: Object.fromEntries(PERIODS.map((n) => [n, { ...r.windows[n], ...windowBounds(input.capturedAt, n) }])) as PeriodAudit['windows'] }]),
  }
  if (!base.rows.every(validAudit)) throw new Error('invalid audit windows')
  checkDirectory(p.directory)
  if (['planned', 'committed', 'failed', 'unknown'].some((s) => existsSync(join(p.directory, `${input.runId}.${s}.json`)))) throw new Error('runId already used; recover receipt without replaying database')
  deliver(p.directory, base) // Fail closed BEFORE database effects if artifact destination cannot receive.
  let plan: ImportPlan
  try { plan = await executeOfflineImport(db, input) }
  catch (error) {
    const unknown = error instanceof TransactionOutcomeUnknown
    const failed: Manifest = { ...base, state: unknown ? 'unknown' : 'failed', finalizedAt: new Date().toISOString() }
    const committed = unknown ? null : false
    try { return { committed, auditReceived: true, receipt: deliver(p.directory, failed), failure: unknown ? 'unknown' : 'database' } }
    catch { return { committed, auditReceived: false, recoveryManifest: JSON.stringify(failed), failure: 'delivery' } }
  }
  const committed: Manifest = { ...base, state: 'committed', counts: plan.counts, finalizedAt: new Date().toISOString(),
    outcomes: base.outcomes.map((o) => { const i = plan.plans.find((p) => p.slug === o.slug); return i ? { slug: o.slug, status: i.plan.action, ...(i.plan.action === 'skip' ? { reason: i.plan.reason } : {}) } : o }),
    // Only written successes establish new audit metadata. Skips do not refresh evidence.
    rows: base.rows.filter((r) => plan.plans.some((i) => i.slug === r.slug && i.plan.action !== 'skip')),
  }
  try { return { committed: true, plan, auditReceived: true, receipt: deliver(p.directory, committed) } }
  catch { return { committed: true, plan, auditReceived: false, recoveryManifest: JSON.stringify(committed), failure: 'delivery' } }
}

/** Destination repair only. Never executes an import. */
export function redeliverAudit(directory: string, recoveryManifest: string): AuditReceipt {
  const m = JSON.parse(recoveryManifest) as Manifest
  if (m.schemaVersion !== 1 || m.platform !== 'bet2invest' || !['failed', 'committed', 'unknown'].includes(m.state) || !m.rows.every(validAudit)) throw new Error('invalid recovery manifest')
  return deliver(directory, m)
}

/** Read receipts + content hashes every time: no long-lived cache across month boundary.
 * Missing config returns no eligible audit. Bad receipts fail closed, not silently
 * accepted; operational caller must surface the error rather than fabricate freshness.
 */
export function loadCommittedAudits(directory: string | undefined): PeriodAudit[] {
  if (!directory) return []
  if (!isAbsolute(directory) || (statSync(directory).mode & 0o077) !== 0) throw new Error('audit directory must be absolute and private (0700)')
  const files = readdirSync(directory).filter((f) => f.endsWith('.committed.receipt.json')).sort()
  if (files.length > 10000) throw new Error('audit index requires retention review')
  const latest = new Map<string, { finalizedAt: string; row: PeriodAudit }>()
  for (const f of files) {
    const receipt = JSON.parse(readFileSync(join(directory, f), 'utf8')) as AuditReceipt
    const body = readFileSync(join(directory, f.replace('.receipt.json', '.json')), 'utf8')
    if (receipt.state !== 'committed' || !receipt.received || receipt.sha256 !== digest(body) || receipt.bytes !== Buffer.byteLength(body)) throw new Error('audit receipt verification failed')
    const m = JSON.parse(body) as Manifest
    if (m.schemaVersion !== 1 || m.platform !== 'bet2invest' || m.state !== 'committed' || m.runId !== receipt.runId || !m.rows.every(validAudit)) throw new Error('invalid committed manifest')
    for (const row of m.rows) {
      const key = `${row.slug}\n${row.capturedAt}`
      if (!latest.has(key) || latest.get(key)!.finalizedAt < m.finalizedAt) latest.set(key, { finalizedAt: m.finalizedAt, row })
    }
  }
  return Array.from(latest.values(), (i) => i.row)
}
