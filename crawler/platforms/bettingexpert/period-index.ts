// Server/injected only. No connection or automatic execution. Existing audit table.
import {createHash} from 'node:crypto'
import {validBEAudit,type BEAudit} from '@/lib/bettingexpert-period-contract'
import type {ImportDatabase} from '../bet2invest/execute-offline-import'
export const BE_CLASS='be-active-window-index-v1',BE_SLUG='__be_active_windows__'
const MAX=4*1024*1024
export function encodeBE(rows:BEAudit[],updatedAt:string){
 if(rows.length>20000||!rows.every(validBEAudit)||new Set(rows.map(x=>x.slug)).size!==rows.length||new Set(rows.map(x=>x.guid)).size!==rows.length||!Number.isFinite(Date.parse(updatedAt)))throw Error('invalid BE index')
 const payload={version:1,platform:'bettingexpert',updatedAt,rows:[...rows].sort((a,b)=>a.slug.localeCompare(b.slug))};const body=JSON.stringify(payload);if(Buffer.byteLength(body)>MAX)throw Error('BE index too large')
 return JSON.stringify({payload,sha256:createHash('sha256').update(body).digest('hex')})
}
export function decodeBE(reason:string){if(Buffer.byteLength(reason)>MAX+200)throw Error('BE index too large');const e=JSON.parse(reason);if(e.payload?.version!==1||e.payload.platform!=='bettingexpert'||encodeBE(e.payload.rows,e.payload.updatedAt)!==reason)throw Error('invalid BE index receipt');return{rows:e.payload.rows as BEAudit[],updatedAt:e.payload.updatedAt as string,revision:e.sha256 as string}}
/** Caller supplies reviewed compact audits from verified staged source workflow.
 * Hashes are custody, not authenticity. No raw client input. Atomic readback.
 * Global row AND accepted importer GUID/capture must match before activation.
 */
export async function activateBE(db:ImportDatabase,rows:BEAudit[],updatedAt:string){
 encodeBE(rows,updatedAt)
 return db.transaction(async tx=>{
  await tx.query("SET LOCAL lock_timeout='1s'");await tx.query("SET LOCAL statement_timeout='15s'")
  await tx.query('LOCK TABLE tipsters,import_validation_log IN SHARE ROW EXCLUSIVE MODE NOWAIT')
  const old=await tx.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE platform=$1 AND slug=$2 AND class=$3',['bettingexpert',BE_SLUG,BE_CLASS]);if(old.rows.length>1)throw Error('duplicate BE index')
  const previous=old.rows[0]?decodeBE(old.rows[0].reason):null
  const map=new Map((previous?.rows??[]).map(r=>[r.slug,r]))
  for(const a of rows){
   const matches=await tx.query<{reason:string}>("SELECT l.reason FROM tipsters t JOIN import_validation_log l ON l.platform=t.platform AND l.slug=t.slug AND l.captured_at=t.captured_at WHERE t.platform='bettingexpert' AND t.slug=$1 AND t.captured_at=$2::timestamptz AND l.class='accepted[profile-overall]'",[a.slug,a.globalCapturedAt])
   if(matches.rows.length!==1||JSON.parse(matches.rows[0].reason).sourceGuid!==a.guid)throw Error('BE global provenance mismatch')
   map.set(a.slug,a)
  }
  const reason=encodeBE(Array.from(map.values()),updatedAt)
  if(previous)await tx.query('UPDATE import_validation_log SET reason=$1,created_at=NOW() WHERE platform=$2 AND slug=$3 AND class=$4',[reason,'bettingexpert',BE_SLUG,BE_CLASS])
  else await tx.query('INSERT INTO import_validation_log(platform,slug,class,reason,run_id) VALUES($1,$2,$3,$4,$5)',['bettingexpert',BE_SLUG,BE_CLASS,reason,'be-window-activation'])
  const back=await tx.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE platform=$1 AND slug=$2 AND class=$3',['bettingexpert',BE_SLUG,BE_CLASS]);if(back.rows.length!==1||back.rows[0].reason!==reason)throw Error('BE index readback mismatch')
  return decodeBE(reason).revision
 })
}
