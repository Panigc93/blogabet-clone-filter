// Disposable local seed for review, not a production importer. Refuses any
// live database URL and never imports '@/db'. No network and no new captures.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tipsters } from '../db/schema'
import { parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'
import { monthlyRecord } from '../crawler/platforms/olbg/monthly-record'
import { OLBG_LOCAL_SCHEMA, planOlbgPersistence } from '../crawler/platforms/olbg/persistence-plan'
async function main(){
 if(process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT) throw Error('Live DB URLs forbidden for local seed')
 const dir=mkdtempSync('/tmp/olbg-disposable-review-')
 const pg=new PGlite(dir);const db=drizzle(pg)
 try {
  for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql']) {
   for(const q of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint')) if(q.trim()) await pg.exec(q)
  }
  await pg.exec(OLBG_LOCAL_SCHEMA)
  const ids=[565069,342919,535122]
  for(let i=0;i<ids.length;i++) {
   const id=ids[i]
   const load=(mode:string)=>{const f=JSON.parse(readFileSync(`tests/fixtures/olbg/profile-${id}-${mode}.json`,'utf8'));return parseOlbgPerformance(f.node,f.originalReceipt,id,'2026-11')}
   const r=monthlyRecord(prepareOlbgProfile(load('month'),load('table-1'),load('table-2')))
   await db.insert(tipsters).values({id:i+1,platform:'olbg',slug:String(id),name:r.username,capturedAt:new Date(r.capturedAt),picks:0})
   const plan=planOlbgPersistence(r,{catalogSurrogateId:i+1,activeCapturedAt:null,sameSnapshot:null})
   await pg.transaction(async tx=>{for(const q of plan.statements)await tx.query(q.text,q.params)})
  }
  const platforms=['blogabet','tipstrr','golazobets','bet2invest']
  for(let i=0;i<platforms.length;i++) {
   const platform=platforms[i]
   await db.insert(tipsters).values({id:i+20,platform,slug:'synthetic-local-'+platform,name:'SYNTHETIC LOCAL '+platform,picks:100,yield:'10',yield6m:'10',capturedAt:new Date('2026-11-17T12:00:00Z')})
  }
  writeFileSync('/tmp/olbg/local-smoke-state.json',JSON.stringify({dir,syntheticBaseline:true,pilotCount:3}))
  console.log('Disposable local seed created; state in /tmp/olbg/local-smoke-state.json')
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
