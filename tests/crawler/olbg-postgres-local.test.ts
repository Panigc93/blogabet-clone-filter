// Opt-in, UNIX socket only. No DATABASE_URL, TCP, production driver or secrets.
// Uses a dedicated disposable schema inside a dedicated local test database.
import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { Client } from 'pg'
import { userInfo } from 'node:os'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rollbackOlbgNewPilot } from '@/crawler/platforms/olbg/rollback-pilot'
import { executeOlbgPreparedBatch,reconcileOlbgRun } from '@/crawler/platforms/olbg/execute-prepared'
import { OLBG_LOCAL_SCHEMA } from '@/crawler/platforms/olbg/persistence-plan'
import { monthlyRecord } from '@/crawler/platforms/olbg/monthly-record'
import { parseOlbgPerformance } from '@/crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '@/crawler/platforms/olbg/prepare'
import { transactionAdapter } from '@/crawler/platforms/bet2invest/transaction-adapter'
import { readOlbgActiveRecords } from '@/crawler/platforms/olbg/active-read'
import { compactRevisionGuard } from '@/lib/olbg-revision'
const socket=process.env.OLBG_LOCAL_PG_SOCKET
if(socket&&!/^\/tmp\/olbg-local-pg-[a-zA-Z0-9-]+$/.test(socket))throw Error('Explicit OLBG local socket directory required')
const schema='olbg_review_'+process.pid
const clients:Client[]=[]
async function connect(){
 const c=new Client({host:socket,port:55440,database:'olbg_executor_test',user:userInfo().username,connectionTimeoutMillis:1000})
 await c.connect();clients.push(c);return c
}
const wrap=(c:Client,statementMs=1000)=>transactionAdapter({query:async(text,params)=>({rows:(await c.query(text,params)).rows}),discard:async()=>{await c.end()}},{statementMs,idleMs:2000,budgetMs:5000})
const load=(mode:string)=>{const f=JSON.parse(readFileSync(join(__dirname,`../fixtures/olbg/profile-565069-${mode}.json`),'utf8'));return parseOlbgPerformance(f.node,f.originalReceipt,565069,'2026-11')}
const record=monthlyRecord(prepareOlbgProfile(load('month'),load('table-1'),load('table-2')))
const input=(runId:string)=>({runId,reviewedAt:'2026-11-18T12:00:00.000Z',records:[structuredClone(record)]})
let admin:Client,a:Client,b:Client
beforeAll(async()=>{
 if(!socket)return
 admin=await connect();await admin.query(`CREATE SCHEMA ${schema}`)
 a=await connect();b=await connect()
 for(const c of [admin,a,b])await c.query(`SET search_path TO ${schema},public`)
 for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])for(const q of readFileSync(join(__dirname,'../../drizzle',f),'utf8').split('--> statement-breakpoint'))if(q.trim())await admin.query(q)
 await admin.query(OLBG_LOCAL_SCHEMA)
 await executeOlbgPreparedBatch(wrap(a),input('initial'))
})
afterAll(async()=>{
 if(!socket)return
 for(const c of [a,b]){try{await c.query('ROLLBACK')}catch{}}
 if(admin)await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
 for(const c of clients){try{await c.end()}catch{}}
})
describe.skipIf(!socket)('OLBG real local PostgreSQL concurrent connections',()=>{
 it('NOWAIT refuses conflicting writer; readers remain available and receipt is absent',async()=>{
  await a.query('BEGIN');await a.query('LOCK TABLE tipsters IN SHARE ROW EXCLUSIVE MODE')
  try{
   const start=performance.now()
   await expect(executeOlbgPreparedBatch(wrap(b),input('blocked'))).rejects.toMatchObject({code:'55P03'})
   expect(performance.now()-start).toBeLessThan(1500)
   expect((await b.query('SELECT count(*)::int n FROM tipsters')).rows[0].n).toBe(1)
   expect((await reconcileOlbgRun({query:async(t,p)=>({rows:(await b.query(t,p)).rows})},input('blocked'))).state).toBe('not-found')
  }finally{await a.query('ROLLBACK')}
 })
 it('bounded adapter statement timeout rolls back and connection can be reused',async()=>{
  await expect(wrap(a,30).transaction(async tx=>{await tx.query('SELECT pg_sleep(0.2)');return 1})).rejects.toMatchObject({code:'57014'})
  expect((await a.query('SELECT 1 n')).rows[0].n).toBe(1)
 })
 it('refresh committed on another connection invalidates read barrier and preserves newest pointer',async()=>{
  const now=new Date('2026-11-18T12:00:00Z')
  const reader={query:async<T>(t:string,p:unknown[])=>({rows:(await a.query(t,p)).rows as T[]})}
  const loadRevision=async()=>{const r=(await a.query('SELECT revision::text,changed_at FROM olbg_revision')).rows[0];return {status:'ok' as const,revision:r.revision,changedAt:new Date(r.changed_at).toISOString()}}
  const first=await loadRevision()
  const guard=compactRevisionGuard(first,now,()=>now,loadRevision)
  const update=input('concurrent-refresh');update.records[0].capturedAt='2026-11-17T23:00:00.000Z';update.records[0].source.capturedAt=update.records[0].capturedAt
  await executeOlbgPreparedBatch(wrap(b),update)
  expect(await guard.revisionUnchanged()).toBe(false)
  const old=await executeOlbgPreparedBatch(wrap(a),input('old-arrives-after'));if(old.state==='committed')expect(old.summary.skippedOlder).toBe(1)
  expect((await readOlbgActiveRecords(reader,now)).records[0].capturedAt).toBe(update.records[0].capturedAt)
 })
 it('new-only pilot rollback removes catalog and active pointer, retains durable snapshots and receipt',async()=>{
  const i={...input('pg-pilot-rollback'),newOnly:true};const r=i.records[0];r.profileId=888;r.profileUrl='https://www.olbg.com/tipsters/about/888';r.source.url='https://www.olbg.com/tipsters/performance/month/888/__data.json'
  await executeOlbgPreparedBatch(wrap(a),i)
  await rollbackOlbgNewPilot(wrap(b),i)
  expect((await b.query("SELECT count(*)::int n FROM tipsters WHERE platform='olbg' AND slug='888'")).rows[0].n).toBe(0)
  expect((await b.query('SELECT count(*)::int n FROM olbg_monthly_active WHERE profile_id=888')).rows[0].n).toBe(0)
  expect((await b.query('SELECT count(*)::int n FROM olbg_monthly_snapshots WHERE profile_id=888')).rows[0].n).toBe(1)
  expect((await reconcileOlbgRun({query:async(t,p)=>({rows:(await b.query(t,p)).rows})},i)).state).toBe('rolled-back')
 })
 it('lost COMMIT acknowledgment is unknown, then read-only reconciliation confirms committed run',async()=>{
  const c=await connect();await c.query(`SET search_path TO ${schema},public`)
  let discarded=false
  const db=transactionAdapter({query:async(text,params)=>{const r=await c.query(text,params);if(text==='COMMIT')throw Error('injected lost ack');return {rows:r.rows}},discard:async()=>{discarded=true;await c.end()}},{statementMs:1000,idleMs:2000,budgetMs:5000})
  const i=input('lost-commit')
  expect((await executeOlbgPreparedBatch(db,i)).state).toBe('unknown');expect(discarded).toBe(true)
  expect((await reconcileOlbgRun({query:async(t,p)=>({rows:(await b.query(t,p)).rows})},i)).state).toBe('committed')
 })
})
