import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { executeOlbgPreparedBatch,reconcileOlbgRun,type OlbgImportInput } from '@/crawler/platforms/olbg/execute-prepared'
import { OLBG_LOCAL_SCHEMA } from '@/crawler/platforms/olbg/persistence-plan'
import { monthlyRecord } from '@/crawler/platforms/olbg/monthly-record'
import { parseOlbgPerformance } from '@/crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '@/crawler/platforms/olbg/prepare'
import { TransactionOutcomeUnknown } from '@/crawler/platforms/bet2invest/transaction-adapter'
import type { ImportDatabase } from '@/crawler/platforms/bet2invest/execute-offline-import'
const pg=new PGlite()
const db:ImportDatabase={transaction:work=>pg.transaction(work)}
const load=(mode:string)=>{const f=JSON.parse(readFileSync(join(__dirname,`../fixtures/olbg/profile-565069-${mode}.json`),'utf8'));return parseOlbgPerformance(f.node,f.originalReceipt,565069,'2026-11')}
const record=monthlyRecord(prepareOlbgProfile(load('month'),load('table-1'),load('table-2')))
const input=(runId:string):OlbgImportInput=>({runId,reviewedAt:'2026-11-18T12:00:00.000Z',records:[structuredClone(record)]})
beforeAll(async()=>{
 for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql','0007_blogabet_access_signal.sql'])for(const q of readFileSync(join(__dirname,'../../drizzle',f),'utf8').split('--> statement-breakpoint'))if(q.trim())await pg.exec(q)
 await pg.exec(OLBG_LOCAL_SCHEMA)
 await pg.exec("INSERT INTO tipsters(id,platform,slug,name,yield) VALUES(7,'blogabet','bb','sentinel',42)")
})
afterAll(()=>pg.close())
describe('inert OLBG executor, disposable local SQL only',()=>{
 it('allocates negative internal identity, atomically preserves evidence and leaves BB unchanged',async()=>{
  const result=await executeOlbgPreparedBatch(db,input('first'))
  expect(result.state).toBe('committed')
  if(result.state==='committed')expect(result.summary).toMatchObject({inserted:1,updated:0})
  const rows=(await pg.query<{id:number;platform:string;captured_at:unknown;yield:unknown}>('SELECT * FROM tipsters ORDER BY id')).rows
  expect(rows[0].id).toBeLessThanOrEqual(-2000000000);expect(rows[0].yield).toBeNull()
  expect(rows.find(r=>r.platform==='blogabet')!.yield).toBe('42.00')
  expect((await reconcileOlbgRun(pg,input('first'))).state).toBe('committed')
 })
 it('replays a committed run without duplicate writes, rejects changed content',async()=>{
  const r=await executeOlbgPreparedBatch(db,input('first'));if(r.state==='committed')expect(r.replayed).toBe(true)
  const modified=input('first');modified.records[0].username='changed'
  await expect(executeOlbgPreparedBatch(db,modified)).rejects.toThrow('content conflict')
  const newer=input('second');newer.records[0].capturedAt='2026-11-17T23:00:00.000Z';newer.records[0].source.capturedAt=newer.records[0].capturedAt
  const updated=await executeOlbgPreparedBatch(db,newer);if(updated.state==='committed')expect(updated.summary.updated).toBe(1)
  const older=await executeOlbgPreparedBatch(db,input('older'));if(older.state==='committed')expect(older.summary.skippedOlder).toBe(1)
 })
 it('rolls back entire batch and run receipt on injected mid-write failure',async()=>{
  const next=input('rollback');const r=next.records[0];r.profileId=999;r.profileUrl='https://www.olbg.com/tipsters/about/999';r.source.url='https://www.olbg.com/tipsters/performance/month/999/__data.json'
  const broken:ImportDatabase={transaction:work=>pg.transaction(tx=>work({query:async(text,params)=>{if(text.startsWith('INSERT INTO olbg_monthly_active'))throw Error('injected');return tx.query(text,params)}}))}
  await expect(executeOlbgPreparedBatch(broken,next)).rejects.toThrow('injected')
  expect((await pg.query("SELECT * FROM tipsters WHERE platform='olbg' AND slug='999'")).rows).toHaveLength(0)
  expect((await reconcileOlbgRun(pg,next)).state).toBe('not-found')
 })
 it('does not report missing commit acknowledgment as failure or blindly retry',async()=>{
  const next=input('unknown')
  const unknown:ImportDatabase={transaction:async work=>{await pg.transaction(work);throw new TransactionOutcomeUnknown('lost ack')}}
  const outcome=await executeOlbgPreparedBatch(unknown,next)
  expect(outcome.state).toBe('unknown')
  expect((await reconcileOlbgRun(pg,next)).state).toBe('committed')
  const retry=await executeOlbgPreparedBatch(db,next);if(retry.state==='committed')expect(retry.replayed).toBe(true)
 })
 it('rejects oversized/duplicate/future inputs before entering a transaction',async()=>{
  const bad=input('bad');bad.records.push(bad.records[0]);let called=false
  const no:ImportDatabase={transaction:async()=>{called=true;throw Error('must not call')}}
  await expect(executeOlbgPreparedBatch(no,bad)).rejects.toThrow('Duplicate')
  expect(called).toBe(false)
 })
})

describe('new-only pilot rollback in disposable SQL',()=>{
 const pilot=()=>{const i=input('pilot-new');i.records[0].profileId=777;i.records[0].profileUrl='https://www.olbg.com/tipsters/about/777';i.records[0].source.url='https://www.olbg.com/tipsters/performance/month/777/__data.json';return {...i,newOnly:true}}
 it('restores no-catalog/no-active state, retains evidence and prevents replay after rollback',async()=>{
  const {rollbackOlbgNewPilot}=await import('@/crawler/platforms/olbg/rollback-pilot')
  const i=pilot();await executeOlbgPreparedBatch(db,i)
  const snapshots=(await pg.query('SELECT * FROM olbg_monthly_snapshots WHERE profile_id=777')).rows.length
  expect((await rollbackOlbgNewPilot(db,i)).state).toBe('rolled-back')
  expect((await pg.query("SELECT * FROM tipsters WHERE platform='olbg' AND slug='777'")).rows).toHaveLength(0)
  expect((await pg.query('SELECT * FROM olbg_monthly_active WHERE profile_id=777')).rows).toHaveLength(0)
  expect((await pg.query('SELECT * FROM olbg_monthly_snapshots WHERE profile_id=777')).rows).toHaveLength(snapshots)
  expect((await reconcileOlbgRun(pg,i)).state).toBe('rolled-back')
  await expect(executeOlbgPreparedBatch(db,i)).rejects.toThrow('already rolled back')
  expect((await rollbackOlbgNewPilot(db,i)).state).toBe('rolled-back')
 })
 it('refuses rollback of a refreshed identity and refuses new-only import over existing catalog',async()=>{
  const {rollbackOlbgNewPilot}=await import('@/crawler/platforms/olbg/rollback-pilot')
  const i=pilot();i.runId='pilot-new-2';i.records[0].profileId=778;i.records[0].profileUrl='https://www.olbg.com/tipsters/about/778';i.records[0].source.url='https://www.olbg.com/tipsters/performance/month/778/__data.json'
  await executeOlbgPreparedBatch(db,i)
  const next=structuredClone(i);next.runId='pilot-refresh';next.newOnly=false;next.records[0].capturedAt='2026-11-17T23:00:00.000Z';next.records[0].source.capturedAt=next.records[0].capturedAt
  await executeOlbgPreparedBatch(db,next)
  await expect(rollbackOlbgNewPilot(db,i)).rejects.toThrow('changed since import')
  const blocked=structuredClone(i);blocked.runId='blocked-new-only';await expect(executeOlbgPreparedBatch(db,blocked)).rejects.toThrow('new-only')
 })
})
