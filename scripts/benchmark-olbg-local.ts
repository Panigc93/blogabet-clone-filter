// Entirely SYNTHETIC scale exercise derived from one fixture's shape. No OLBG
// network, no live URLs opened, no production account/database access.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { userInfo } from 'node:os'
import { transactionAdapter } from '../crawler/platforms/bet2invest/transaction-adapter'
import { readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { tipsters } from '../db/schema'
import { parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'
import { monthlyRecord } from '../crawler/platforms/olbg/monthly-record'
import { OLBG_LOCAL_SCHEMA,olbgRecordDigest } from '../crawler/platforms/olbg/persistence-plan'
import { executeOlbgPreparedBatch } from '../crawler/platforms/olbg/execute-prepared'
import { recordSummaries } from '../crawler/platforms/olbg/monthly-record'
import { periodReadContext } from '../lib/bet2invest-period-read'
import { olbgReadContext } from '../lib/olbg-read-context'
async function main(){
 if(process.env.DATABASE_URL||process.env.DATABASE_URL_DIRECT)throw Error('No live DB URLs permitted')
 const socket=process.env.OLBG_LOCAL_PG_SOCKET
 if(socket&&!/^\/tmp\/olbg-local-pg-[a-zA-Z0-9-]+$/.test(socket))throw Error('Local socket required')
 let pg:PGlite,db:ReturnType<typeof drizzle>
 if(socket){
  const c=new Client({host:socket,port:55440,database:'olbg_executor_test',user:userInfo().username,connectionTimeoutMillis:1000})
  await c.connect();const schema='olbg_scale_'+process.pid
  await c.query(`CREATE SCHEMA ${schema}`);await c.query(`SET search_path TO ${schema},public`)
  await c.query("SET statement_timeout='10000ms'")
  const adapter=transactionAdapter({query:async(t,p)=>({rows:(await c.query(t,p)).rows}),discard:async()=>{await c.end()}},{statementMs:2000,idleMs:2000,budgetMs:5000})
  pg={query:c.query.bind(c),exec:async(t:string)=>c.query(t),transaction:adapter.transaction,close:async()=>{await c.query(`DROP SCHEMA ${schema} CASCADE`);await c.end()}} as unknown as PGlite
  db=drizzlePg(c) as unknown as ReturnType<typeof drizzle>
 }else{pg=new PGlite();db=drizzle(pg)}
 const at=new Date('2026-11-18T12:00:00Z')
 const metrics:Record<string,unknown>={synthetic:true,count:867,retainedHistoryRows:30000,engine:socket?'real local PostgreSQL by UNIX socket, no network latency':'single-process disposable PGlite, no network latency'}
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
  const samples=[]
  const base=periodReadContext([],at),c=olbgReadContext(base,true,at)
  const selection=()=>db.select(c.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(c.source,c.joinOn).orderBy(...c.order('yield6m')).limit(50)
  const before=await selection();metrics.pageBytesBeforeHistory=Buffer.byteLength(JSON.stringify(before))
  const q=selection().toSQL();metrics.queryParameterBytes=Buffer.byteLength(JSON.stringify(q.params));metrics.querySqlBytes=Buffer.byteLength(q.sql)
  for(let offset=0;offset<30000;offset+=1000){
   const history=Array.from({length:1000},(_,i)=>{const r=structuredClone(records[0]);r.capturedAt=new Date(Date.UTC(2026,10,1,0,0,offset+i)).toISOString();r.source.capturedAt=r.capturedAt;return {profile_id:r.profileId,captured_at:r.capturedAt,record:r,record_sha256:olbgRecordDigest(r)}})
   await pg.query('INSERT INTO olbg_monthly_snapshots SELECT h.profile_id,h.captured_at,h.record,h.record_sha256 FROM jsonb_to_recordset($1::jsonb) AS h(profile_id bigint,captured_at timestamptz,record jsonb,record_sha256 text)',[JSON.stringify(history)])
  }
  const countQuery=db.select({n:sql<number>`count(*)::int`}).from(tipsters).leftJoin(c.source,c.joinOn).toSQL()
  const countStart=performance.now();const countRows=await pg.query(countQuery.sql,countQuery.params)
  metrics.countMs=performance.now()-countStart;metrics.countBytes=Buffer.byteLength(JSON.stringify(countRows.rows))
  metrics.countExplain=(await pg.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+countQuery.sql,countQuery.params)).rows
  metrics.explain=(await pg.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,q.params)).rows
  for(let i=0;i<5;i++){
   const start=performance.now();const first=await selection()
   if(first.length!==50||first.some(r=>r.yield6m===null))throw Error('read projection')
   samples.push({sqlPageMs:performance.now()-start,pageBytes:Buffer.byteLength(JSON.stringify(first))})
  }
  const every=await db.select(c.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(c.source,c.joinOn)
  const expected=recordSummaries(records[0])[1].derivedLevelStakesYieldPct!
  if(every.length!==867||every.some(r=>Math.abs(Number(r.yield6m)-expected)>1e-10))throw Error('867-way equivalence')
  const rev=(await pg.query('SELECT revision::text,changed_at FROM olbg_revision WHERE singleton=true')).rows
  metrics.revisionBytes=Buffer.byteLength(JSON.stringify(rev));metrics.readSamples=samples
  metrics.pageBytesAfterHistory=samples[0].pageBytes;metrics.equivalenceChecked=every.length
  metrics.activeRecordBytes=Buffer.byteLength(JSON.stringify(records));metrics.historyRows=(await pg.query<{n:number}>('SELECT count(*)::int n FROM olbg_monthly_snapshots')).rows[0].n
  metrics.compactStorageBytes=(await pg.query('SELECT sum(pg_column_size(compact))::int bytes FROM olbg_monthly_active')).rows[0]
  writeFileSync(socket?'/tmp/olbg/compact-pg-scale-result.json':'/tmp/olbg/synthetic-scale-result.json',JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
