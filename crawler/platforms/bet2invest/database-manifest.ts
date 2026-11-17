// One private, versioned manifest per run in the EXISTING validation-log table.
// No schema changes, no per-profile success logs, no filesystem dependency.
import { createHash } from 'node:crypto'
import type { TipsterInsert } from '@/db/schema'
import { PERIODS, validAudit, windowBounds, type PeriodAudit } from '@/lib/bet2invest-period-contract'
import { executeOfflineImport, type ImportDatabase, type ImportTransaction, type ExecuteOfflineImportInput } from './execute-offline-import'
import { TransactionOutcomeUnknown } from './transaction-adapter'
import type { ImportPlan } from './offline-import'

export const MANIFEST_CLASS = 'b2i-run-manifest-v1'
const SLUG_PREFIX = '__b2i_run__:'
const MAX_BYTES = 2 * 1024 * 1024
export interface SourceCapture {
  slug: string
  ssr: { at: string; basis: 'http-date' | 'local-download-completed' | 'local-request-recorded'; sha256: string }
  api: { at: string; basis: 'http-date' | 'local-download-completed' | 'local-request-recorded'; sha256: string } | null
}
interface Manifest {
  sourceCaptures?: SourceCapture[]
  schemaVersion: 1; platform: 'bet2invest'; runId: string; state: 'committed'
  capturedAt: string; calculatedAt: string; executedAt: string
  codeRevision: string; inputSha256: string; payloadSha256: string; counts: ImportPlan['counts']
  rows: PeriodAudit[]; outcomes: { slug: string; status: string; reason?: string }[]
}
interface Envelope { sha256: string; bytes: number; manifest: Manifest }
export interface ManifestReceipt { runId: string; sha256: string; bytes: number; received: true }
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
function runSlug(runId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) throw new Error('invalid manifest run id')
  return SLUG_PREFIX + runId
}
function pack(manifest: Manifest): Envelope {
  const body = JSON.stringify(manifest)
  const bytes = Buffer.byteLength(body)
  if (bytes > MAX_BYTES) throw new Error('manifest exceeds 2 MiB')
  return { manifest, sha256: hash(body), bytes }
}
function unpack(reason: string, runId?: string): Envelope {
  if (Buffer.byteLength(reason) > MAX_BYTES + 1024) throw new Error('oversized manifest envelope')
  const e = JSON.parse(reason) as Envelope
  if (e.manifest?.schemaVersion !== 1 || e.manifest.platform !== 'bet2invest' || e.manifest.state !== 'committed'
      || (runId && e.manifest.runId !== runId) || !e.manifest.rows.every(validAudit)) throw new Error('invalid database manifest')
  const canonical = pack(e.manifest)
  if (canonical.sha256 !== e.sha256 || canonical.bytes !== e.bytes) throw new Error('database manifest integrity mismatch')
  return e
}
const selectRun = async (tx: ImportTransaction, runId: string) => {
  const result = await tx.query<{ reason: string }>('SELECT reason FROM import_validation_log WHERE platform=$1 AND class=$2 AND slug=$3 AND run_id=$4', ['bet2invest', MANIFEST_CLASS, runSlug(runId), runId])
  if (result.rows.length > 1) throw new Error('duplicate run manifests require reconciliation')
  return result.rows[0] ? unpack(result.rows[0].reason, runId) : null
}
const receipt = (e: Envelope): ManifestReceipt => ({ runId: e.manifest.runId, sha256: e.sha256, bytes: e.bytes, received: true })

/** Reconcile on a NEW pinned connection after COMMIT acknowledgement loss.
 * A found valid manifest confirms the atomic data+manifest commit. Absence
 * alone is inconclusive if the old transaction is still in flight: do not
 * retry until its connection/backend termination is confirmed by caller.
 */
export async function reconcileRun(reader: ImportTransaction, runId: string): Promise<ManifestReceipt | null> {
  const e = await selectRun(reader, runId)
  return e ? receipt(e) : null
}

export async function executeDatabaseAuditedImport(db: ImportDatabase, input: ExecuteOfflineImportInput, provenance: {
  codeRevision: string; inputSha256: string; calculatedAt: Date; sourceCaptures?: SourceCapture[]
}): Promise<{ committed: boolean | null; alreadyCommitted?: boolean; plan?: ImportPlan; receipt?: ManifestReceipt; state: 'committed' | 'rolled-back' | 'unknown' }> {
  runSlug(input.runId)
  if (!/^[a-f0-9]{7,40}$/.test(provenance.codeRevision) || !/^[a-f0-9]{64}$/.test(provenance.inputSha256)) throw new Error('invalid manifest provenance')
  if (provenance.sourceCaptures) {
    const sources = provenance.sourceCaptures
    if (sources.length !== input.rows.length || new Set(sources.map(s => s.slug)).size !== sources.length) throw new Error('source coverage mismatch')
    for (const r of input.rows) {
      const s = sources.find(s => s.slug === r.slug)
      if (!s || s.ssr.at !== input.capturedAt.toISOString()) throw new Error('source SSR anchor mismatch')
      for (const capture of [s.ssr, s.api]) if (capture && (!/^[a-f0-9]{64}$/.test(capture.sha256) || !['http-date', 'local-download-completed', 'local-request-recorded'].includes(capture.basis) || !Number.isFinite(Date.parse(capture.at)))) throw new Error('invalid source capture')
    }
  }
  const rows: PeriodAudit[] = input.rows.flatMap((r) => r.status !== 'row' ? [] : [{ slug: r.slug, capturedAt: input.capturedAt.toISOString(), windows: Object.fromEntries(PERIODS.map((n) => [n, { ...r.windows[n], ...windowBounds(input.capturedAt, n) }])) as PeriodAudit['windows'] }])
  if (!rows.every(validAudit)) throw new Error('invalid audit windows')
  const payloadSha256 = hash(JSON.stringify(input.rows.map((r) => r.status === 'row' ? { ...r, insert: { ...r.insert, id: undefined } } : r)))
  const executedAt = new Date().toISOString()
  try {
    return await db.transaction(async (tx) => {
      // Same serialization order as executor. Protects run identity from all
      // users of this route; manifest uniqueness is validated, not a new index.
      await tx.query('LOCK TABLE tipsters IN SHARE ROW EXCLUSIVE MODE NOWAIT')
      const previous = await selectRun(tx, input.runId)
      if (previous) {
        if (previous.manifest.payloadSha256 !== payloadSha256 || previous.manifest.inputSha256 !== provenance.inputSha256 || previous.manifest.capturedAt !== input.capturedAt.toISOString() || previous.manifest.codeRevision !== provenance.codeRevision || JSON.stringify(previous.manifest.sourceCaptures) !== JSON.stringify(provenance.sourceCaptures)) throw new Error('run id conflicts with existing provenance')
        return { committed: true, alreadyCommitted: true, receipt: receipt(previous), state: 'committed' as const }
      }
      // Flat transaction wrapper, not a nested BEGIN. All writes remain in tx.
      const plan = await executeOfflineImport({ transaction: (work) => work(tx) }, input)
      const written = new Set(plan.plans.filter((i) => i.plan.action !== 'skip').map((i) => i.slug))
      const manifest: Manifest = {
        schemaVersion: 1, platform: 'bet2invest', runId: input.runId, state: 'committed', capturedAt: input.capturedAt.toISOString(),
        calculatedAt: provenance.calculatedAt.toISOString(), executedAt, codeRevision: provenance.codeRevision, inputSha256: provenance.inputSha256, payloadSha256,
        ...(provenance.sourceCaptures ? { sourceCaptures: provenance.sourceCaptures } : {}),
        counts: plan.counts, rows: rows.filter((r) => written.has(r.slug)),
        outcomes: input.rows.map((r) => { const p = plan.plans.find((i) => i.slug === r.slug)?.plan; return { slug: r.slug, status: p?.action ?? r.status, ...('reason' in r ? { reason: r.reason } : p?.action === 'skip' ? { reason: p.reason } : {}) } }),
      }
      const e = pack(manifest)
      await tx.query('INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1,$2,$3,$4,$5,$6)', ['bet2invest', runSlug(input.runId), input.capturedAt, MANIFEST_CLASS, JSON.stringify(e), input.runId])
      const confirmed = await selectRun(tx, input.runId)
      if (!confirmed || confirmed.sha256 !== e.sha256) throw new Error('database manifest readback failed')
      // Receipt is returned only AFTER outer transaction COMMIT resolves.
      return { committed: true, plan, receipt: receipt(confirmed), state: 'committed' as const }
    })
  } catch (error) {
    if (error instanceof TransactionOutcomeUnknown) return { committed: null, state: 'unknown' }
    // Adapter contract guarantees rollback on non-unknown failures. No false
    // persisted failed marker: it would be rolled back too. Caller reports failure.
    throw error
  }
}

/** Pure decoder for server-fetched filtered records. Never return the private
 * reason/envelope/outcomes to the API. Only validated per-profile windows. */
export function databaseAudits(records: { reason: string; runId: string }[]): PeriodAudit[] {
  if (records.length > 1000 || records.reduce((n, r) => n + Buffer.byteLength(r.reason), 0) > 8 * 1024 * 1024) throw new Error('manifest index exceeds reviewed bounds')
  const all = new Map<string, PeriodAudit>()
  for (const r of records) {
    const e = unpack(r.reason, r.runId)
    for (const row of e.manifest.rows) {
      const key = `${row.slug}\n${row.capturedAt}`
      if (all.size >= 10000 && !all.has(key)) throw new Error('manifest profile index exceeds reviewed bounds')
      const previous = all.get(key)
      if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error('conflicting audit for identical capture')
      all.set(key, row)
    }
  }
  return Array.from(all.values())
}
