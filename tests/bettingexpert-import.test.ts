import { describe,it,expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {executeInsertBatch,batchDigest,preflight,validateRows,type VerifiedRow} from '../crawler/platforms/bettingexpert/import'
import {bettingexpertToInsert} from '../crawler/platforms/bettingexpert/to-db'
import type {ImportDatabase} from '../crawler/platforms/bet2invest/execute-offline-import'
const row=(username='One',n=1):VerifiedRow=>({guid:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,username,ok:true,scope:'profile-overall',capturedAt:'2026-11-17T20:00:00Z',picks:30,profit:2.23456,yieldPct:1.234,winRatePct:null,profitUnit:'bettingexpert-points',yield3m:null,yield6m:null,yield12m:null})
const input=(rows:VerifiedRow[])=>({rows,runId:'local-test',expectedSha256:batchDigest(rows),codeRevision:'a'.repeat(40)})
async function setup(){const pg=new PGlite();for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'));return pg}
describe('BE reviewed insert-only protocol',()=>{
 it('validates source scope, identity, period nulls and bound',()=>{expect(()=>validateRows([])).toThrow();expect(()=>validateRows([row(),row()])).toThrow();expect(()=>validateRows([{...row(),yield3m:2} as never])).toThrow();expect(()=>validateRows([{...row(),profitUnit:'eur'}as never])).toThrow();expect(()=>validateRows(Array.from({length:251},(_,i)=>row('r'+i,i+1)))).toThrow()})
 it('accepts genuine integer internal ids including negative; rejects overflow/zero',()=>{expect(bettingexpertToInsert(row(),-2000000001).id).toBe(-2000000001);for(const id of [0,1.1,2147483648,-2147483649])expect(()=>bettingexpertToInsert(row(),id)).toThrow()})
 it('rejects provenance before any database call',async()=>{const db={transaction:()=>{throw Error('must not reach')}}as ImportDatabase;await expect(executeInsertBatch(db,{...input([row()]),expectedSha256:'bad'})).rejects.toThrow('provenance')})
 it('inserts via sequence, logs GUID provenance, preserves other platform and blocks replay',async()=>{const pg=await setup();try{
  await pg.query("INSERT INTO tipsters(id,platform,slug,name,picks) VALUES(1,'blogabet','One','sentinel',7)")
  const before=await pg.query("SELECT * FROM tipsters WHERE platform='blogabet'")
  const pf=await preflight(pg,[row()]);expect(pf.inserts).toBe(1)
  const seqBefore=(await pg.query('SELECT last_value,is_called FROM tipsters_internal_id_seq')).rows
  await preflight(pg,[row()]);expect((await pg.query('SELECT last_value,is_called FROM tipsters_internal_id_seq')).rows).toEqual(seqBefore)
  const db:ImportDatabase={transaction:fn=>pg.transaction(tx=>fn(tx))};const result=await executeInsertBatch(db,input([row()]));expect(result.inserted[0].id).toBe(-2000000000)
  const stored=(await pg.query('SELECT * FROM tipsters WHERE platform=$1',['bettingexpert'])).rows[0]as any
  expect(Number(stored.profit)).toBe(2.235);expect(Number(stored.yield)).toBe(1.23);expect(stored.yield_3m).toBeNull();expect(stored.slug).toBe('One')
  const log=(await pg.query('SELECT reason FROM import_validation_log')).rows[0]as any;expect(JSON.parse(log.reason).sourceGuid).toBe(row().guid)
  expect((await pg.query("SELECT * FROM tipsters WHERE platform='blogabet'")).rows).toEqual(before.rows)
  await expect(executeInsertBatch(db,input([row()]))).rejects.toThrow('existing-identity');expect((await pg.query('SELECT count(*)::int n FROM tipsters')).rows).toEqual([{n:2}])
 }finally{await pg.close()}},20000)
 it('rolls back inserted rows and audit on injected failure',async()=>{const pg=await setup();try{let writes=0;const db:ImportDatabase={transaction:fn=>pg.transaction(tx=>fn({query:async(text,params)=>{if(text.startsWith('INSERT INTO import_validation_log')&&++writes===2)throw Error('injected');return tx.query(text,params)}}))};await expect(executeInsertBatch(db,input([row('a',1),row('b',2)]))).rejects.toThrow('injected');expect((await pg.query('SELECT count(*)::int n FROM tipsters')).rows).toEqual([{n:0}]);expect((await pg.query('SELECT count(*)::int n FROM import_validation_log')).rows).toEqual([{n:0}])}finally{await pg.close()}},20000)
})
