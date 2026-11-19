// Same source validation, conversion, allocation and provenance as the original
// importer. Only SQL transport changes: two INSERT statements per <=250 chunk.
import {validateRows,batchDigest,preflight,type VerifiedRow} from './import'
import {bettingexpertToInsert} from './to-db'
import {buildInsert} from '../tipstrr/insert-sql'
import type {ImportDatabase} from '../bet2invest/execute-offline-import'
import type {BatchRow} from './batch'
export async function executeChunkedInsertBatch(db:ImportDatabase,input:{rows:BatchRow[];runId:string;expectedSha256:string;codeRevision:string}){
 validateRows(input.rows)
 if(!/^[\w.-]{1,100}$/.test(input.runId)||!/^[0-9a-f]{40}$/.test(input.codeRevision)||input.expectedSha256!==batchDigest(input.rows))throw Error('invalid-provenance')
 const rows=input.rows
 return db.transaction(async tx=>{
  await tx.query("SET LOCAL lock_timeout='1s'");await tx.query("SET LOCAL statement_timeout='15s'")
  await tx.query('LOCK TABLE tipsters IN SHARE ROW EXCLUSIVE MODE NOWAIT')
  const check=await preflight(tx,rows)
  if(check.exact.length)throw Error('existing-identity-requires-reconciliation')
  if(check.sameCaseFold.length)throw Error('existing-case-variant-requires-review')
  const a=await tx.query<{id:number|string}>("SELECT nextval('tipsters_internal_id_seq') AS id FROM generate_series(1,$1::int)",[rows.length]);const ids=a.rows.map(r=>Number(r.id))
  if(ids.length!==rows.length||new Set(ids).size!==ids.length||ids.some(x=>!Number.isSafeInteger(x)||x< -2147483648||x> -2000000000))throw Error('invalid-sequence-allocation')
  // Reuse the exact reviewed row builder; shift its placeholders rather than
  // create a second field/default mapper. Reject different column signatures.
  const inserts=rows.map((r,i)=>buildInsert(bettingexpertToInsert(r,ids[i]),false)),params:unknown[]=[],values:string[]=[]
  const prefix=inserts[0].text.slice(0,inserts[0].text.indexOf(' VALUES '))
  for(const q of inserts){const split=q.text.indexOf(' VALUES ');if(q.text.slice(0,split)!==prefix)throw Error('inconsistent-insert-columns');const offset=params.length;values.push(q.text.slice(split+8).replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+offset)));params.push(...q.params)}
  const actual=await tx.query<{id:number;slug:string}>(prefix+' VALUES '+values.join(',')+' RETURNING id,slug',params)
  if(actual.rows.length!==ids.length||new Set(actual.rows.map(r=>Number(r.id))).size!==ids.length||actual.rows.some(r=>rows[ids.indexOf(Number(r.id))]?.username!==r.slug))throw Error('insert-receipt-mismatch')
  const logsParams:unknown[]=[],logsValues:string[]=[]
  for(const source of rows){const offset=logsParams.length;logsValues.push('('+Array.from({length:6},(_,i)=>'$'+(offset+i+1)).join(',')+')');logsParams.push('bettingexpert',source.username,new Date(source.capturedAt),'accepted[profile-overall]',JSON.stringify({sourceGuid:source.guid,sourceUsername:source.username,profitUnit:source.profitUnit,scope:source.scope,batchSha256:check.inputSha256,codeRevision:input.codeRevision,sourceEvidence:(source as VerifiedRow).sourceEvidence??{precision:'parsed-graphql-full'}}),input.runId)}
  const logs=await tx.query<{id:number|string;slug:string;reason:string}>('INSERT INTO import_validation_log(platform,slug,captured_at,class,reason,run_id) VALUES '+logsValues.join(',')+' RETURNING id,slug,reason',logsParams)
  if(logs.rows.length!==rows.length||new Set(logs.rows.map(r=>String(r.id))).size!==rows.length||new Set(logs.rows.map(r=>r.slug)).size!==rows.length||logs.rows.some(r=>{const source=rows.find(s=>s.username===r.slug);return !source||JSON.parse(r.reason).sourceGuid!==source.guid}))throw Error('log-receipt-mismatch')
  return {inserted:rows.map((r,i)=>({id:ids[i],guid:r.guid,slug:r.username})),inputSha256:check.inputSha256,runId:input.runId}
 })
}
