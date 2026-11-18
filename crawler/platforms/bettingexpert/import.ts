// Pure/injected preparation. No connections, environment, network or automatic execution.
import { createHash } from 'node:crypto'
import { bettingexpertToInsert } from './to-db'
import type { BatchRow } from './batch'
import { buildInsert } from '../tipstrr/insert-sql'
import type { ImportDatabase, ImportTransaction } from '../bet2invest/execute-offline-import'
export const MAX_IMPORT_BATCH = 250
export type VerifiedRow = Extract<BatchRow, {ok:true}>
export function validateRows(rows: BatchRow[]): asserts rows is VerifiedRow[] {
  if (!rows.length || rows.length > MAX_IMPORT_BATCH) throw new Error('invalid-batch-size')
  const guids = new Set<string>(), slugs = new Set<string>()
  for (const row of rows) {
    if (!row.ok || row.scope !== 'profile-overall' || row.profitUnit !== 'bettingexpert-points' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.guid) ||
      guids.has(row.guid) || slugs.has(row.username) || row.yield3m !== null || row.yield6m !== null || row.yield12m !== null) throw new Error('unverified-or-duplicate-source')
    bettingexpertToInsert(row, -2000000000) // validation only; this id is never persisted
    guids.add(row.guid); slugs.add(row.username)
  }
}
export function batchDigest(rows: BatchRow[]) { validateRows(rows); return createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
/** Read-only inventory. Does not allocate ids or infer future ids from max(id). */
export async function preflight(tx: ImportTransaction, rows: BatchRow[]) {
  validateRows(rows)
  const selected = await tx.query<{id:number;slug:string}>(
    "SELECT id, slug FROM tipsters WHERE platform='bettingexpert' AND (slug=ANY($1::text[]) OR lower(slug)=ANY($2::text[])) ORDER BY id",
    [rows.map(x=>x.username), rows.map(x=>x.username.toLowerCase())])
  const exact = selected.rows.filter(x=>rows.some(r=>r.username===x.slug))
  const sameCaseFold = selected.rows.filter(x=>!exact.includes(x))
  return { selected: selected.rows, exact, sameCaseFold, inputSha256: batchDigest(rows), inserts: rows.length-exact.length }
}
/** Insert-only atomic chunk. Existing identities fail closed, including a replay.
 * No updates, no ON CONFLICT overwrite and no source GUID -> internal id conversion.
 * A fresh read-only preflight is useful but this rechecks under a NOWAIT table lock.
 * Source identity/capture/digest are persisted in the existing validation log in
 * the SAME transaction. No schema changes. No CLI or database adapter provided.
 */
export async function executeInsertBatch(db: ImportDatabase, input: {rows:BatchRow[];runId:string;expectedSha256:string;codeRevision:string}) {
  validateRows(input.rows)
  if (!/^[\w.-]{1,100}$/.test(input.runId) || !/^[0-9a-f]{40}$/.test(input.codeRevision) || input.expectedSha256!==batchDigest(input.rows)) throw new Error('invalid-provenance')
  const rows = input.rows
  return db.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='1s'")
    await tx.query("SET LOCAL statement_timeout='15s'")
    await tx.query('LOCK TABLE tipsters IN SHARE ROW EXCLUSIVE MODE NOWAIT')
    const check=await preflight(tx,rows)
    if (check.exact.length) throw new Error('existing-identity-requires-reconciliation')
    // Case variants are distinct source identities, but do not insert near an
    // unreviewed pre-existing case variant. Same-batch variants remain distinct.
    if (check.sameCaseFold.length) throw new Error('existing-case-variant-requires-review')
    const allocations=await tx.query<{id:number|string}>("SELECT nextval('tipsters_internal_id_seq') AS id FROM generate_series(1,$1::int)",[rows.length])
    const ids=allocations.rows.map(x=>Number(x.id))
    if(ids.length!==rows.length||new Set(ids).size!==ids.length||ids.some(x=>!Number.isSafeInteger(x)||x< -2147483648||x> -2000000000))throw new Error('invalid-sequence-allocation')
    const inserted:{id:number;guid:string;slug:string}[]=[]
    for(let i=0;i<rows.length;i++){
      const source=rows[i],insert=bettingexpertToInsert(source,ids[i]),q=buildInsert(insert,false)
      const result=await tx.query<{id:number}>(q.text+' RETURNING id',q.params)
      if(result.rows.length!==1||Number(result.rows[0].id)!==ids[i])throw new Error('insert-receipt-mismatch')
      await tx.query('INSERT INTO import_validation_log (platform,slug,captured_at,class,reason,run_id) VALUES ($1,$2,$3,$4,$5,$6)',
        ['bettingexpert',source.username,new Date(source.capturedAt),'accepted[profile-overall]',JSON.stringify({sourceGuid:source.guid,sourceUsername:source.username,profitUnit:source.profitUnit,scope:source.scope,batchSha256:check.inputSha256,codeRevision:input.codeRevision}),input.runId])
      inserted.push({id:ids[i],guid:source.guid,slug:source.username})
    }
    return {inserted,inputSha256:check.inputSha256,runId:input.runId}
  })
}
