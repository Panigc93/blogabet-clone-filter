// Entirely SYNTHETIC scale exercise derived from one fixture's shape. No OLBG
// network, no live URLs opened, no production account/database access.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tipsters } from '../db/schema'
import { parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'
import { monthlyRecord } from '../crawler/platforms/olbg/monthly-record'
import { OLBG_LOCAL_SCHEMA,olbgRecordDigest } from '../crawler/platforms/olbg/persistence-plan'
import { executeOlbgPreparedBatch } from '../crawler/platforms/olbg/execute-prepared'
import { readOlbgActiveRecords } from '../crawler/platforms/olbg/active-read'
import { periodReadContext } from '../lib/bet2invest-period-read'
import { olbgReadContext } from '../lib/olbg-read-context'
async function main(){
 if(process.env.DATABASE_URL||process.env.DATABASE_URL_DIRECT)throw Error('No live DB URLs permitted')
 const pg=new PGlite();const db=drizzle(pg);const at=new Date('2026-11-18T12:00:00Z')
 const metrics:Record<string,unknown>={synthetic:true,count:867,retainedHistoryRows:30000,engine:'single-process disposable PGlite; NOT Neon/PostgreSQL multi-connection benchmark'}
 try{
  for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])for(const q of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint'))if(q.trim())await pg.exec(q)
  await pg.exec(OLBG_LOCAL_SCHEMA)
  const load=(m:string)=>{const f=JSON.parse(readFileSync(`tests/fixtures/olbg/profile-535122-${m}.json`,'utf8'));return parseOlbgPerformance(f.node,f.originalReceipt,535122,'2026-11')}
  const template=monthlyRecord(prepareOlbgProfile(load('month'),load('table-1'),load('table-2')))
  const records=Array.from({length:867},(_,i)=>{const r=structuredClone(template);r.profileId=10000000+i;r.username='SYNTHETIC SCALE '+i;r.profileUrl=`https://www.olbg.com/tipsters/about/${r.profileId}`;r.source.url=`https://www.olbg.com/tipsters/performance/month/${r.profileId}/__data.json`;return r})
  const batches=[];let queryCount=0
  const txdb={transaction:<T>(work:(tx:any)=>Promise<T>)=>pg.transaction(tx=>work({query:(q:string,p?:unknown[])=>{queryCount++;return tx.query(q,p)}}))}
  const started=performance.now()
  for(let i=0;i<records.length;i+=50){const t=performance.now();const result=await executeOlbgPreparedBatch(txdb,{runId:'synthetic-'+i,reviewedAt:at.toISOString(),records:records.slice(i,i+50)});if(result.state!=='committed')throw Error('not committed');batches.push(performance.now()-t)}
  metrics.importMs=performance.now()-started;metrics.batchMs=batches;metrics.queryCount=queryCount
  // Historical copies are deliberately synthetic; not active and not evidence
  // of real captures. Same shape and retained bytes, distinct old timestamps.
  for(let offset=0;offset<30000;offset+=1000){
   const history=Array.from({length:1000},(_,i)=>{const r=structuredClone(records[0]);r.capturedAt=new Date(Date.UTC(2026,10,1,0,0,offset+i)).toISOString();r.source.capturedAt=r.capturedAt;return {profile_id:r.profileId,captured_at:r.capturedAt,record:r,record_sha256:olbgRecordDigest(r)}})
   await pg.query('INSERT INTO olbg_monthly_snapshots SELECT h.profile_id,h.captured_at,h.record,h.record_sha256 FROM jsonb_to_recordset($1::jsonb) AS h(profile_id bigint,captured_at timestamptz,record jsonb,record_sha256 text)',[JSON.stringify(history)])
  }
  const samples=[]
  for(let i=0;i<5;i++){
   const start=performance.now();const active=await readOlbgActiveRecords(pg,at);const decoded=performance.now();if(active.records.length!==867)throw Error('active count')
   const base=periodReadContext([],at);const c=olbgReadContext(base,active.records,at);const planned=performance.now()
   const first=await db.select(c.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(c.source,c.joinOn).orderBy(...c.order('yield6m')).limit(50)
   if(first.length!==50||first.some(r=>r.yield6m===null))throw Error('read projection')
   samples.push({readValidateMs:decoded-start,planMs:planned-decoded,sqlMs:performance.now()-planned,totalMs:performance.now()-start})
  }
  metrics.readSamples=samples;metrics.activeRecordBytes=Buffer.byteLength(JSON.stringify(records));metrics.historyRows=(await pg.query<{n:number}>('SELECT count(*)::int n FROM olbg_monthly_snapshots')).rows[0].n
  writeFileSync('/tmp/olbg/synthetic-scale-result.json',JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
