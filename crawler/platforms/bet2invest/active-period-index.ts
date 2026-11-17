// A single mutable, private active audit index. History remains immutable in
// the per-run manifests. Callers hold the executor's tipsters table lock.
import { createHash } from 'node:crypto'
import type { PeriodAudit } from '@/lib/bet2invest-period-contract'
import { validAudit } from '@/lib/bet2invest-period-contract'
import type { ImportTransaction } from './execute-offline-import'
export const ACTIVE_CLASS = 'b2i-active-period-index-v1'
export const ACTIVE_SLUG = '__b2i_active_period_index__'
const MAX_BYTES = 2 * 1024 * 1024
const hash = (body:string)=>createHash('sha256').update(body).digest('hex')
function pack(rows:PeriodAudit[]) {
  if(rows.length>10000||!rows.every(validAudit)||new Set(rows.map(r=>r.slug)).size!==rows.length)throw Error('invalid active audit index')
  const index={schemaVersion:1,platform:'bet2invest',rows:rows.slice().sort((a,b)=>a.slug.localeCompare(b.slug))}
  const body=JSON.stringify(index),bytes=Buffer.byteLength(body)
  if(bytes>MAX_BYTES)throw Error('active audit index exceeds 2 MiB')
  return {index,bytes,sha256:hash(body)}
}
export function decodeActiveIndex(reason:string):PeriodAudit[] {
 if(Buffer.byteLength(reason)>MAX_BYTES+1024)throw Error('oversized active index')
 const envelope=JSON.parse(reason)
 if(envelope.index?.schemaVersion!==1||envelope.index.platform!=='bet2invest'||!Array.isArray(envelope.index.rows))throw Error('invalid active index version')
 const checked=pack(envelope.index.rows)
 if(checked.sha256!==envelope.sha256||checked.bytes!==envelope.bytes)throw Error('active index integrity mismatch')
 return checked.index.rows
}
export async function readActiveIndex(tx:ImportTransaction):Promise<PeriodAudit[]|null>{
 const records=(await tx.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE platform=$1 AND slug=$2 AND class=$3',['bet2invest',ACTIVE_SLUG,ACTIVE_CLASS])).rows
 if(records.length>1)throw Error('duplicate active index')
 return records[0]?decodeActiveIndex(records[0].reason):null
}
async function saveActiveIndex(tx:ImportTransaction,rows:PeriodAudit[],exists:boolean){
 const body=JSON.stringify(pack(rows))
 if(exists)await tx.query('UPDATE import_validation_log SET reason=$1, created_at=NOW() WHERE platform=$2 AND slug=$3 AND class=$4',[body,'bet2invest',ACTIVE_SLUG,ACTIVE_CLASS])
 else await tx.query('INSERT INTO import_validation_log(platform,slug,class,reason,run_id) VALUES($1,$2,$3,$4,$5)',['bet2invest',ACTIVE_SLUG,ACTIVE_CLASS,body,'active-period-index'])
 const confirmed=await readActiveIndex(tx)
 if(confirmed===null||JSON.stringify(pack(confirmed))!==body)throw Error('active index readback mismatch')
}
/** Bootstrap older installations explicitly, under the SAME import lock.
 * Caller supplies previously integrity-verified legacy audits. Missing or
 * conflicting metadata cannot be silently adopted. No historical DB scan
 * occurs on the request path. Original capturedAt values remain unchanged.
 */
export async function bootstrapActiveIndex(tx:ImportTransaction,audits:PeriodAudit[]){
 if(await readActiveIndex(tx)!==null)throw Error('active index already initialized')
 const current=(await tx.query<{slug:string;captured_at:Date|string|null}>('SELECT slug,captured_at FROM tipsters WHERE platform=$1',['bet2invest'])).rows
 const chosen:PeriodAudit[]=[]
 for(const row of current){
  if(!row.captured_at)continue
  const at=new Date(row.captured_at).toISOString()
  const matches=audits.filter(a=>a.slug===row.slug&&a.capturedAt===at)
  if(matches.length!==1)throw Error('legacy active audit coverage incomplete')
  chosen.push(matches[0])
 }
 await saveActiveIndex(tx,chosen,false)
}
export async function updateActiveIndex(tx:ImportTransaction,written:PeriodAudit[]){
 const previous=await readActiveIndex(tx)
 if(previous===null){
  // A fresh DB may initialize lazily. Existing B2I rows need explicit
  // legacy reconciliation; do not lose their metadata during first update.
  const current=(await tx.query<{slug:string}>('SELECT slug FROM tipsters WHERE platform=$1',['bet2invest'])).rows
  const writtenSlugs=new Set(written.map(r=>r.slug))
  if(current.some(r=>!writtenSlugs.has(r.slug)))throw Error('active index requires explicit legacy bootstrap')
 }
 const bySlug=new Map((previous??[]).map(r=>[r.slug,r]))
 for(const row of written)bySlug.set(row.slug,row)
 await saveActiveIndex(tx,Array.from(bySlug.values()),previous!==null)
}
