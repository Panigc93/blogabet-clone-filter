// Inert, no driver/env/connection/schema creation/route. Explicit caller owns
// account authority and one pinned bounded transaction. Max 50 records/4MiB.
import { createHash } from 'node:crypto'
import type { ImportDatabase, ImportTransaction } from '../bet2invest/execute-offline-import'
import { TransactionOutcomeUnknown } from '../bet2invest/transaction-adapter'
import { validMonthlyRecord, type OlbgMonthlyRecord } from './monthly-record'
import { canonicalOlbgJson, olbgRecordDigest } from './persistence-plan'
export interface OlbgImportInput { runId:string; records:OlbgMonthlyRecord[]; reviewedAt:string }
export interface OlbgImportSummary { inserted:number; updated:number; unchanged:number; skippedOlder:number; profiles:number }
export function olbgInputDigest(i:OlbgImportInput){return createHash('sha256').update(canonicalOlbgJson({reviewedAt:i.reviewedAt,records:[...i.records].sort((a,b)=>a.profileId-b.profileId)})).digest('hex')}
function validate(i:OlbgImportInput){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(i.runId))throw Error('Invalid run identity')
 const at=new Date(i.reviewedAt)
 if(!Number.isFinite(at.getTime())||at.toISOString()!==i.reviewedAt)throw Error('Explicit reviewedAt required')
 if(!Array.isArray(i.records)||i.records.length<1||i.records.length>50)throw Error('Bounded batch requires 1..50 records')
 if(new Set(i.records.map(r=>r.profileId)).size!==i.records.length)throw Error('Duplicate profile')
 if(i.records.some(r=>!validMonthlyRecord(r)||r.capturedAt>i.reviewedAt))throw Error('Invalid or future source record')
 if(JSON.stringify(i.records).length>4*1024*1024)throw Error('Batch exceeds 4 MiB')
}
const iso=(v:unknown)=>v===null?null:(v instanceof Date?v:new Date(String(v))).toISOString()
export async function reconcileOlbgRun(db:ImportTransaction,i:OlbgImportInput){
 validate(i)
 const r=await db.query<{input_sha256:string;summary:OlbgImportSummary}>('SELECT input_sha256,summary FROM olbg_import_runs WHERE run_id=$1',[i.runId])
 if(r.rows.length>1)throw Error('Duplicate run identity')
 if(!r.rows.length)return {state:'not-found' as const}
 if(r.rows[0].input_sha256!==olbgInputDigest(i))throw Error('Run identity content conflict')
 return {state:'committed' as const,summary:r.rows[0].summary}
}
export async function executeOlbgPreparedBatch(db:ImportDatabase,i:OlbgImportInput){
 validate(i);const digest=olbgInputDigest(i)
 try{
  const result=await db.transaction(async tx=>{
   // Serializes even writers not using this module. NOWAIT refuses contention;
   // briefly blocks other writers, not readers. Adapter bounds duration.
   await tx.query('LOCK TABLE tipsters,olbg_monthly_active,olbg_monthly_snapshots,olbg_import_runs IN SHARE ROW EXCLUSIVE MODE NOWAIT')
   const prior=await reconcileOlbgRun(tx,i)
   if(prior.state==='committed')return {replayed:true,summary:prior.summary}
   const rows=[...i.records].sort((a,b)=>a.profileId-b.profileId).map(r=>({profile_id:r.profileId,slug:String(r.profileId),captured_at:r.capturedAt,username:r.username,record:r,record_sha256:olbgRecordDigest(r)}))
   const inputJson=JSON.stringify(rows)
   const existing=await tx.query<{profile_id:string|number;id:number|null;catalog_at:unknown;active_at:unknown;record:OlbgMonthlyRecord|null;record_sha256:string|null}>(
    "SELECT x.profile_id,t.id,t.captured_at catalog_at,a.captured_at active_at,s.record,s.record_sha256 FROM jsonb_to_recordset($1::jsonb) AS x(profile_id bigint,slug text,captured_at timestamptz) LEFT JOIN tipsters t ON t.platform='olbg' AND t.slug=x.slug LEFT JOIN olbg_monthly_active a ON a.profile_id=x.profile_id LEFT JOIN olbg_monthly_snapshots s ON s.profile_id=x.profile_id AND s.captured_at=x.captured_at",[inputJson])
   if(existing.rows.length!==rows.length||new Set(existing.rows.map(r=>Number(r.profile_id))).size!==rows.length)throw Error('Identity preflight mismatch')
   const byId=new Map(existing.rows.map(r=>[Number(r.profile_id),r]))
   const summary:OlbgImportSummary={inserted:0,updated:0,unchanged:0,skippedOlder:0,profiles:rows.length}
   const changed:typeof rows=[];const snapshots:typeof rows=[];const missing:typeof rows=[]
   for(const r of rows){
    const old=byId.get(r.profile_id)!
    if(old.id!==null&&(!Number.isSafeInteger(old.id)||old.id===0))throw Error('Invalid catalog surrogate')
    const active=iso(old.active_at),catalog=iso(old.catalog_at)
    if(active!==catalog||active&&old.id===null)throw Error('Catalog/active capture mismatch')
    if(old.record&&(!validMonthlyRecord(old.record)||olbgRecordDigest(old.record)!==old.record_sha256||old.record_sha256!==r.record_sha256))throw Error('Immutable snapshot content conflict')
    if(active&&active>r.captured_at){summary.skippedOlder++;continue}
    if(active===r.captured_at){if(!old.record)throw Error('Active snapshot missing');summary.unchanged++;continue}
    changed.push(r);if(!old.record)snapshots.push(r)
    if(old.id===null){missing.push(r);summary.inserted++}else summary.updated++
   }
   if(missing.length){
    const inserted=await tx.query<{id:number;slug:string}>("INSERT INTO tipsters(id,platform,slug,name,profit_unit,price_currency,picks) SELECT nextval('tipsters_internal_id_seq'),'olbg',x.slug,x.username,'olbg-level-stakes-units','unknown',0 FROM jsonb_to_recordset($1::jsonb) AS x(slug text,username text) RETURNING id,slug",[JSON.stringify(missing)])
    if(inserted.rows.length!==missing.length||new Set(inserted.rows.map(r=>r.slug)).size!==missing.length||inserted.rows.some(r=>r.id> -2000000000||r.id< -2147483648||!Number.isSafeInteger(r.id)||!missing.some(x=>x.slug===r.slug)))throw Error('Internal surrogate allocation mismatch')
   }
   if(snapshots.length){
    const inserted=await tx.query('INSERT INTO olbg_monthly_snapshots(profile_id,captured_at,record,record_sha256) SELECT x.profile_id,x.captured_at,x.record,x.record_sha256 FROM jsonb_to_recordset($1::jsonb) AS x(profile_id bigint,captured_at timestamptz,record jsonb,record_sha256 text) RETURNING profile_id',[JSON.stringify(snapshots)])
    if(inserted.rows.length!==snapshots.length)throw Error('Incomplete snapshot insertion')
   }
   if(changed.length){
    const json=JSON.stringify(changed)
    const pointer=await tx.query('INSERT INTO olbg_monthly_active(profile_id,captured_at) SELECT x.profile_id,x.captured_at FROM jsonb_to_recordset($1::jsonb) AS x(profile_id bigint,captured_at timestamptz) ON CONFLICT(profile_id) DO UPDATE SET captured_at=EXCLUDED.captured_at WHERE olbg_monthly_active.captured_at < EXCLUDED.captured_at RETURNING profile_id',[json])
    if(pointer.rows.length!==changed.length)throw Error('Incomplete active update')
    const catalog=await tx.query("UPDATE tipsters t SET name=x.username,captured_at=x.captured_at,profit_unit='olbg-level-stakes-units',yield=NULL,profit=NULL,yield_3m=NULL,yield_6m=NULL,yield_12m=NULL,picks_6m_avg=NULL,followers=NULL,verified_pct=NULL,since_year=NULL,last_pick_at=NULL FROM jsonb_to_recordset($1::jsonb) AS x(slug text,username text,captured_at timestamptz) WHERE t.platform='olbg' AND t.slug=x.slug RETURNING t.slug",[json])
    if(catalog.rows.length!==changed.length)throw Error('Incomplete catalog update')
    const read=await tx.query<{slug:string;catalog_at:unknown;active_at:unknown;record_sha256:string}>("SELECT t.slug,t.captured_at catalog_at,a.captured_at active_at,s.record_sha256 FROM jsonb_to_recordset($1::jsonb) AS x(slug text,profile_id bigint) JOIN tipsters t ON t.platform='olbg' AND t.slug=x.slug JOIN olbg_monthly_active a ON a.profile_id=x.profile_id JOIN olbg_monthly_snapshots s ON s.profile_id=a.profile_id AND s.captured_at=a.captured_at",[json])
    if(read.rows.length!==changed.length||read.rows.some(r=>{const wanted=changed.find(x=>x.slug===r.slug);return !wanted||iso(r.catalog_at)!==wanted.captured_at||iso(r.active_at)!==wanted.captured_at||r.record_sha256!==wanted.record_sha256}))throw Error('Post-write reconciliation failed')
   }
   const receipt=await tx.query('INSERT INTO olbg_import_runs(run_id,input_sha256,summary) VALUES($1,$2,$3::jsonb) RETURNING run_id',[i.runId,digest,JSON.stringify(summary)])
   if(receipt.rows.length!==1)throw Error('Missing run receipt')
   return {replayed:false,summary}
  })
  return {state:'committed' as const,...result}
 }catch(e){if(e instanceof TransactionOutcomeUnknown)return {state:'unknown' as const,runId:i.runId,inputDigest:digest,reconcileRequired:true};throw e}
}
