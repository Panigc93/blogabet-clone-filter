import {executeChunkedInsertBatch} from '@/crawler/platforms/bettingexpert/import-chunked'
// Explicit transaction adapter, never opens a connection. Caller must supply an
// outer transaction. No environment, automatic execution or remote CLI.
import {createHash} from 'node:crypto'
import {batchDigest,type VerifiedRow} from '@/crawler/platforms/bettingexpert/import'
import type {ImportTransaction} from '@/crawler/platforms/bet2invest/execute-offline-import'
import {BE_RELEASE_ID,BE_RELEASE_SHA256,BE_RELEASE_POLICY,EVIDENCE_REVISION,assertReleaseProfiles,type BEReleaseProfile} from './bettingexpert-release-artifact'
export const BE_RELEASE_TABLE_SQL=`CREATE TABLE IF NOT EXISTS be_fixed_release (
 release_id text PRIMARY KEY, evidence_revision text NOT NULL, policy text NOT NULL,
 profiles_sha256 text NOT NULL, profiles jsonb NOT NULL, inserted_rows jsonb NOT NULL,
 run_ids jsonb NOT NULL, inserted_logs jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
const GLOBAL_SHA='458589cd665e8f4b85a6c43d94ada776699c32f575bcce06647c931e81ec704e'
export async function installFixedBERelease(tx:ImportTransaction,input:{globalsBytes:Buffer;profiles:BEReleaseProfile[];codeRevision:string}){
 assertReleaseProfiles(input.profiles)
 if(createHash('sha256').update(input.globalsBytes).digest('hex')!==GLOBAL_SHA)throw Error('Unreviewed Global input')
 const rows=JSON.parse(input.globalsBytes.toString())as VerifiedRow[]
 if(rows.length!==547||rows.some(r=>!input.profiles.some(p=>p.guid===r.guid&&p.slug===r.username)))throw Error('Release identity mismatch')
 await tx.query('LOCK TABLE tipsters, import_validation_log, be_fixed_release IN SHARE ROW EXCLUSIVE MODE NOWAIT')
 const inventory=await tx.query<{n:number}>("SELECT count(*)::int AS n FROM tipsters WHERE platform='bettingexpert'");if(inventory.rows[0].n!==0)throw Error('BE inventory changed since approved empty baseline')
 const logInventory=await tx.query<{n:number}>("SELECT count(*)::int AS n FROM import_validation_log WHERE platform='bettingexpert' OR run_id LIKE $1",[BE_RELEASE_ID+'-%']);if(logInventory.rows[0].n!==0)throw Error('BE log inventory or release run IDs changed since approved empty baseline')
 const existing=await tx.query('SELECT release_id FROM be_fixed_release WHERE release_id=$1',[BE_RELEASE_ID]);if(existing.rows.length)throw Error('Release already installed')
 const chunks:VerifiedRow[][]=[[]];const groups=new Map<string,VerifiedRow[]>()
 for(const r of rows)groups.set(r.username.toLowerCase(),[...groups.get(r.username.toLowerCase())??[],r])
 for(const g of Array.from(groups.values())){if(chunks.at(-1)!.length+g.length>250)chunks.push([]);chunks.at(-1)!.push(...g)}
 const ids:number[]=[],runIds:string[]=[]
 for(const [i,chunk]of Array.from(chunks.entries())){const runId=BE_RELEASE_ID+'-'+i;runIds.push(runId);const out=await executeChunkedInsertBatch({transaction:fn=>fn(tx)},{rows:chunk,runId,expectedSha256:batchDigest(chunk),codeRevision:input.codeRevision});ids.push(...out.inserted.map(r=>r.id))}
 const logs=await tx.query<{row:unknown}>("SELECT to_jsonb(l) AS row FROM import_validation_log l WHERE platform='bettingexpert' AND run_id=ANY($1::text[]) ORDER BY id",[runIds])
 if(logs.rows.length!==547||ids.length!==547)throw Error('Exact release insert counts mismatch')
 const captured=await tx.query<{row:unknown}>('SELECT to_jsonb(t) AS row FROM tipsters t WHERE id=ANY($1::int[]) ORDER BY id',[ids])
 await tx.query('INSERT INTO be_fixed_release(release_id,evidence_revision,policy,profiles_sha256,profiles,inserted_rows,run_ids,inserted_logs) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)',[BE_RELEASE_ID,EVIDENCE_REVISION,BE_RELEASE_POLICY,BE_RELEASE_SHA256,JSON.stringify(input.profiles),JSON.stringify(captured.rows.map(r=>r.row)),JSON.stringify(runIds),JSON.stringify(logs.rows.map(r=>r.row))])
 return {profiles:547,periodStates:1641,numeric:485,globalInserts:ids.length,acceptedLogs:ids.length,snapshotRows:1}
}
export async function rollbackFixedBERelease(tx:ImportTransaction){
 await tx.query('LOCK TABLE tipsters, import_validation_log, be_fixed_release IN SHARE ROW EXCLUSIVE MODE NOWAIT')
 const r=await tx.query<{inserted_rows:{id:number}[];run_ids:string[];inserted_logs:{id:number|string}[]}>('SELECT inserted_rows,run_ids,inserted_logs FROM be_fixed_release WHERE release_id=$1 FOR UPDATE',[BE_RELEASE_ID]);if(r.rows.length!==1)throw Error('Release not installed')
 const row=r.rows[0],ids=row.inserted_rows.map(r=>r.id)
 const current=await tx.query<{row:unknown}>('SELECT to_jsonb(t) AS row FROM tipsters t WHERE id=ANY($1::int[]) ORDER BY id',[ids])
 // jsonb canonical property order is stable on both sides; no modified row is deleted.
 if(JSON.stringify(current.rows.map(r=>r.row))!==JSON.stringify(row.inserted_rows))throw Error('Imported rows changed; manual rollback review required')
 const logIds=row.inserted_logs.map(l=>String(l.id))
 const logs=await tx.query<{row:unknown}>("SELECT to_jsonb(l) AS row FROM import_validation_log l WHERE id=ANY($1::bigint[]) ORDER BY id",[logIds])
 if(JSON.stringify(logs.rows.map(r=>r.row))!==JSON.stringify(row.inserted_logs))throw Error('Import logs changed; manual rollback review required')
 await tx.query("DELETE FROM import_validation_log WHERE platform='bettingexpert' AND id=ANY($1::bigint[])",[logIds])
 await tx.query("DELETE FROM tipsters WHERE platform='bettingexpert' AND id=ANY($1::int[])",[ids])
 await tx.query('DELETE FROM be_fixed_release WHERE release_id=$1',[BE_RELEASE_ID])
 return {deletedProfiles:ids.length}
}
