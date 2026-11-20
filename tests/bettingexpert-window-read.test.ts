import {sql}from 'drizzle-orm'
import {it,expect}from 'vitest'
import {PGlite}from '@electric-sql/pglite'
import {drizzle}from 'drizzle-orm/pglite'
import {readFileSync}from 'node:fs'
import {tipsters}from '@/db/schema'
import {periodReadContext}from '@/lib/bet2invest-period-read'
import {beReadContext}from '@/lib/bettingexpert-period-read'
import {activateBE,decodeBE,BE_CLASS}from '@/crawler/platforms/bettingexpert/period-index'
import {type BEAudit}from '@/lib/bettingexpert-period-contract'
import {fromDbTipster}from '@/components/tipster-card-model'
import {bettingexpertApiProjection}from '@/lib/query'
const at='2026-11-18T02:00:00.000Z',now=new Date('2026-11-18T04:00:00Z')
const audit:BEAudit={guid:'00000000-0000-4000-8000-000000000001',slug:'One',globalCapturedAt:at,periodCapturedAt:'2026-11-18T03:00:00.000Z',anchorCapturedAt:'2026-11-18T03:01:00.000Z',evidenceSha256:'a'.repeat(64),windows:{3:{value:'20',reason:null,picks:2,profit:'2',stake:'10',from:'2026-08',to:'2026-10'},6:{value:null,reason:'missing_anchor',picks:null,profit:null,stake:null,from:'2026-05',to:'2026-10'},12:{value:'10',reason:null,picks:3,profit:'2',stake:'20',from:'2025-11',to:'2026-10'}}}
it('activates only matching global provenance; SQL orders before paging, masks each window and preserves other sources',async()=>{
 const pg=new PGlite();try{for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql','0007_blogabet_access_signal.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'))
 const db=drizzle(pg,{schema:{tipsters}})
 await db.insert(tipsters).values([{id:1,platform:'bettingexpert',slug:'One',name:'One',picks:10,capturedAt:new Date(at),yield12m:'999',yield6m:'999',profitUnit:'bettingexpert-points'},{id:2,platform:'bettingexpert',slug:'Missing',name:'Missing',yield12m:'999',capturedAt:new Date(at)},{id:3,platform:'blogabet',slug:'Sentinel',name:'Sentinel',yield12m:'15'}])
 const injected:import('@/crawler/platforms/bet2invest/execute-offline-import').ImportDatabase={transaction:fn=>pg.transaction(tx=>fn(tx))}
 await expect(activateBE(injected,[audit],now.toISOString())).rejects.toThrow('provenance')
 await pg.query("INSERT INTO import_validation_log(platform,slug,captured_at,class,reason,run_id)VALUES('bettingexpert','One',$1,'accepted[profile-overall]',$2,'test')",[at,JSON.stringify({sourceGuid:audit.guid})])
 await activateBE(injected,[audit],now.toISOString());const records=await pg.query<{reason:string}>('SELECT reason FROM import_validation_log WHERE class=$1',[BE_CLASS]);const index=decodeBE(records.rows[0].reason)
 const base=periodReadContext([],now),be=beReadContext(base,index.rows,now)
 const rows=await db.select(be.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(be.source,be.joinOn).orderBy(be.projection.yield12m).limit(50)
 const one=rows.find(x=>x.slug==='One')!;const ordered=await db.select(be.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(be.source,be.joinOn).orderBy(sql`${be.projection.yield12m} DESC NULLS LAST`,sql`${tipsters.id} DESC`).limit(1).offset(1);expect(ordered[0].slug).toBe('One');expect(Number(one.yield12m)).toBe(10);expect(one.yield6m).toBeNull();expect(rows.find(x=>x.slug==='Missing')!.yield12m).toBeNull();expect(Number(rows.find(x=>x.slug==='Sentinel')!.yield12m)).toBe(15)
 expect(bettingexpertApiProjection(one,now).yield12m).toBe('10');expect(fromDbTipster(one as any,now).yield12m.valuePct).toBe(10);expect(fromDbTipster(one as any,now).yield6m.valuePct).toBeNull()
 expect(JSON.stringify(one)).not.toContain('evidenceSha256');expect(JSON.stringify(one)).not.toContain(audit.guid)
 const stale=beReadContext(base,index.rows,new Date('2026-12-01T00:00:00Z'));const s=await db.select(stale.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(stale.source,stale.joinOn);expect(s.find(x=>x.slug==='One')!.yield12m).toBeNull()
 expect(()=>decodeBE(records.rows[0].reason.replace('"value":"20"','"value":"21"'))).toThrow()
 }finally{await pg.close()}
},20000)
