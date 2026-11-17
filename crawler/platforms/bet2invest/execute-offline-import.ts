// No connections, environment reads, network calls or automatic execution.
// The caller supplies a database and owns authorization to use that database.
import type { TipsterInsert } from '@/db/schema'
import { COLUMNS, buildInsert, buildUpdate } from '../tipstrr/insert-sql'
import { planOfflineImport, type ImportPlan, type OfflineRow } from './offline-import'

export interface ImportTransaction {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string, params?: unknown[],
  ): Promise<{ rows: T[] }>
}
export interface ImportDatabase {
  // MUST pin one connection, BEGIN, COMMIT on success, ROLLBACK on any throw.
  transaction<T>(work: (tx: ImportTransaction) => Promise<T>): Promise<T>
}
export interface ExecuteOfflineImportInput {
  rows: OfflineRow[]
  capturedAt: Date
  runId: string
}

function decode(row: Record<string, unknown>): TipsterInsert {
  // Explicit mapping is intentional: regex camelization loses digits in yield_3m.
  const out: Record<string, unknown> = { id: row.id }
  for (const [key, col] of COLUMNS) out[key] = row[col]
  return out as TipsterInsert
}

/** One atomic batch. Uses only 0000-0005 schema. Never trusts fixture ids.
 *
 * The table lock serializes identity lookup + insertion, even against writers
 * that do not use this executor. It briefly blocks OTHER platforms' writes,
 * but never updates their rows. Readers remain available. At most 1000 input
 * rows per batch, and NOWAIT refuses an already-held conflicting lock. This
 * does NOT bound lock hold time. Measure on a representative isolated database
 * and set a transaction timeout in the future adapter before production use.
 * Sequence gaps after rollback are normal PostgreSQL behavior, not lost rows.
 * Windows retain their capture-time basis. Delayed import does not refresh data.
 */
export async function executeOfflineImport(
  db: ImportDatabase, input: ExecuteOfflineImportInput,
): Promise<ImportPlan> {
  if (input.rows.length > 1000) throw new Error('batch exceeds 1000 rows')
  if (!Number.isFinite(input.capturedAt.getTime())) throw new Error('invalid capturedAt')
  if (!input.runId.trim()) throw new Error('runId required')
  const slugs = new Set<string>()
  for (const row of input.rows) {
    if (!row.slug || slugs.has(row.slug)) throw new Error('empty or duplicate slug')
    slugs.add(row.slug)
    if (row.status === 'row') {
      const at = row.insert.capturedAt
      if (row.insert.platform !== 'bet2invest' || row.insert.slug !== row.slug) throw new Error('invalid row identity')
      if (!(at instanceof Date) || at.getTime() !== input.capturedAt.getTime()) throw new Error('capture date mismatch')
      if (row.insert.statsUpdatedAt?.getTime() !== input.capturedAt.getTime()) throw new Error('stats capture date mismatch')
    }
  }
  if (!input.rows.length) return { plans: [], log: [], counts: { insert: 0, update: 0, skip: 0, notSelected: 0, parseError: 0 } }

  return db.transaction(async (tx) => {
    // Do not queue behind an active crawler write. Caller may retry a failed batch.
    await tx.query('LOCK TABLE tipsters IN SHARE ROW EXCLUSIVE MODE NOWAIT')
    const selected = await tx.query(
      "SELECT * FROM tipsters WHERE platform = 'bet2invest' AND slug = ANY($1::text[])",
      [Array.from(slugs)],
    )
    const existing = new Map(selected.rows.map((r) => [String(r.slug), decode(r)]))
    const count = input.rows.filter((r) => r.status === 'row' && !existing.has(r.slug)).length
    const ids: number[] = []
    if (count) {
      const allocated = await tx.query<{ id: string | number }>(
        "SELECT nextval('tipsters_internal_id_seq') AS id FROM generate_series(1, $1::int)", [count],
      )
      for (const row of allocated.rows) {
        const id = Number(row.id)
        if (!Number.isSafeInteger(id) || id > -2000000000 || id < -2147483648) throw new Error('internal id outside integer range')
        ids.push(id)
      }
      if (ids.length !== count) throw new Error('incomplete id allocation')
    }
    let next = 0
    const plan = planOfflineImport({
      ...input, existing, idSource: 'internal-transactional',
      allocateId: () => {
        if (next >= ids.length) throw new Error('missing internal id')
        return ids[next++]
      },
    })
    for (const item of plan.plans) {
      const p = item.plan
      if (p.action === 'skip') continue
      const q = p.action === 'insert' ? buildInsert(p.insert, false) : buildUpdate(p.merged.id, p.merged)
      // Defense in depth: an update must still match both platform and slug.
      const text = p.action === 'update'
        ? `${q.text} AND platform = $${q.params.length + 1} AND slug = $${q.params.length + 2} RETURNING id`
        : `${q.text} RETURNING id`
      const params = p.action === 'update' ? [...q.params, 'bet2invest', item.slug] : q.params
      const result = await tx.query(text, params)
      if (result.rows.length !== 1) throw new Error('write did not affect exactly one row')
    }
    for (const log of plan.log) {
      await tx.query(
        'INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [log.platform, log.slug, log.capturedAt, log.class, log.reason, log.runId],
      )
    }
    return plan
  })
}
