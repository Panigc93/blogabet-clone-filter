// Rollback is deliberately limited to the proposed NEW-ONLY pilot. It never
// deletes retained snapshots/receipts and refuses any newer capture or changed
// catalog identity. No connections, environment, DDL or automatic execution.
import type { ImportDatabase } from '../bet2invest/execute-offline-import'
import { TransactionOutcomeUnknown } from '../bet2invest/transaction-adapter'
import { reconcileOlbgRun,olbgInputDigest,type OlbgImportInput } from './execute-prepared'
import { olbgRecordDigest } from './persistence-plan'
export async function rollbackOlbgNewPilot(db:ImportDatabase,input:OlbgImportInput){
 if(!input.newOnly||input.records.length>3)throw Error('Rollback limited to explicit new-only pilot of at most 3')
 try{
  return await db.transaction(async tx=>{
   await tx.query('LOCK TABLE tipsters,olbg_monthly_active,olbg_monthly_snapshots,olbg_import_runs,olbg_revision IN SHARE ROW EXCLUSIVE MODE NOWAIT')
   const receipt=await reconcileOlbgRun(tx,input)
   if(receipt.state==='rolled-back')return {state:'rolled-back' as const,replayed:true}
   if(receipt.state!=='committed'||receipt.summary.inserted!==input.records.length||receipt.summary.updated||receipt.summary.unchanged||receipt.summary.skippedOlder)throw Error('Receipt is not an entirely new pilot')
   const expected=input.records.map(r=>({profile_id:r.profileId,slug:String(r.profileId),captured_at:r.capturedAt,digest:olbgRecordDigest(r)}))
   const json=JSON.stringify(expected)
   const found=await tx.query<{profile_id:string|number;id:number}>("SELECT x.profile_id,t.id FROM jsonb_to_recordset($1::jsonb) AS x(profile_id bigint,slug text,captured_at timestamptz,digest text) JOIN tipsters t ON t.platform='olbg' AND t.slug=x.slug AND t.captured_at=x.captured_at JOIN olbg_monthly_active a ON a.profile_id=x.profile_id AND a.captured_at=x.captured_at JOIN olbg_monthly_snapshots s ON s.profile_id=a.profile_id AND s.captured_at=a.captured_at AND s.record_sha256=x.digest",[json])
   if(found.rows.length!==input.records.length||new Set(found.rows.map(r=>r.id)).size!==input.records.length||found.rows.some(r=>r.id> -2000000000||r.id< -2147483648))throw Error('Pilot changed since import; rollback refused')
   const deleted=await tx.query('DELETE FROM olbg_monthly_active a USING jsonb_to_recordset($1::jsonb) AS x(profile_id bigint,captured_at timestamptz) WHERE a.profile_id=x.profile_id AND a.captured_at=x.captured_at RETURNING a.profile_id',[json])
   if(deleted.rows.length!==input.records.length)throw Error('Incomplete pilot rollback')
   const catalog=await tx.query("DELETE FROM tipsters WHERE platform='olbg' AND id=ANY($1::int[]) RETURNING id",[found.rows.map(r=>r.id)])
   if(catalog.rows.length!==input.records.length)throw Error('Incomplete catalog rollback')
   const run=await tx.query('UPDATE olbg_import_runs SET rolled_back_at=clock_timestamp() WHERE run_id=$1 AND input_sha256=$2 AND rolled_back_at IS NULL RETURNING run_id',[input.runId,olbgInputDigest(input)])
   const rev=await tx.query('UPDATE olbg_revision SET revision=revision+1,changed_at=clock_timestamp() WHERE singleton=true RETURNING revision')
   if(run.rows.length!==1||rev.rows.length!==1)throw Error('Missing rollback receipt')
   return {state:'rolled-back' as const,replayed:false}
  })
 }catch(e){if(e instanceof TransactionOutcomeUnknown)return {state:'unknown' as const,reconcileRequired:true,runId:input.runId};throw e}
}
