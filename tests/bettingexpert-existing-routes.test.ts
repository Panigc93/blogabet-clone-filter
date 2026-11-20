import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {NextRequest} from 'next/server'
import {and,eq,count} from 'drizzle-orm'
import * as schema from '@/db/schema'
import {executeInsertBatch,batchDigest,type VerifiedRow} from '@/crawler/platforms/bettingexpert/import'
import {tipsterReadContext} from '@/lib/tipster-read-context'
import {fromDbTipster} from '@/components/tipster-card-model'
import {bettingexpertApiProjection} from '@/lib/query'
import {beListToken} from '@/lib/bettingexpert-list-token'
import {parseBEPeriodFilters} from '@/lib/bettingexpert-period-filters'
import {GET} from '@/app/api/tipsters/route'
let database:ReturnType<typeof drizzle>
vi.mock('@/db',()=>({get db(){return database}}))
const run=process.env.BE_TEST_GLOBAL547_FILE&&process.env.BE_TEST_EVIDENCE_DIR?it:it.skip
const pg=new PGlite()
let globals:VerifiedRow[],windows:any
beforeAll(async()=>{
 if(!process.env.BE_TEST_GLOBAL547_FILE||!process.env.BE_TEST_EVIDENCE_DIR)return
 vi.stubEnv('NODE_ENV','development');vi.stubEnv('USE_PGLITE','1');vi.stubEnv('BE_EXISTING_LOCAL','1');vi.stubEnv('BE_PRIVATE_RESEARCH_DIR',process.env.BE_TEST_EVIDENCE_DIR)
 database=drizzle(pg,{schema})
 for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'))
 const b=readFileSync(process.env.BE_TEST_GLOBAL547_FILE)
 expect(createHash('sha256').update(b).digest('hex')).toBe('458589cd665e8f4b85a6c43d94ada776699c32f575bcce06647c931e81ec704e')
 globals=JSON.parse(b.toString());windows=JSON.parse(readFileSync(process.env.BE_TEST_EVIDENCE_DIR+'/statistics547.json','utf8'))
 const groups=new Map<string,VerifiedRow[]>();for(const r of globals)groups.set(r.username.toLowerCase(),[...groups.get(r.username.toLowerCase())??[],r])
 const chunks:VerifiedRow[][]=[[]];for(const g of Array.from(groups.values())){if(chunks.at(-1)!.length+g.length>250)chunks.push([]);chunks.at(-1)!.push(...g)}
 for(const [i,rows] of Array.from(chunks.entries()))await executeInsertBatch({transaction:fn=>pg.transaction(tx=>fn(tx))},{rows,runId:'be547-local-'+i,expectedSha256:batchDigest(rows),codeRevision:'f9a0155febb58d6d5dbd625df3dfbb26f506acb1'})
 await database.insert(schema.tipsters).values([{id:1,platform:'blogabet',slug:globals[0].username,name:'BB sentinel',picks:80,yield:'5',profit:'8',yield3m:'2',yield6m:'3',yield12m:'4'},{id:2,platform:'tipstrr',slug:'other-source',name:'Tipstrr sentinel',picks:90,yield:'6',yield6m:'7'}])
},30000)
afterAll(async()=>{vi.unstubAllEnvs();await pg.close()})
async function context(){return tipsterReadContext([],new Date('2026-11-19T18:00:00Z'))}
async function select(period:'3m'|'6m'|'12m',extra:object={}){
 const c=await context(),filters={platform:'bettingexpert' as const,bePeriod:period,...extra}
 const where=and(...c.filters(filters))
 const rows=await database.select(c.projection).from(schema.tipsters).leftJoin(c.base.source,c.base.joinOn).leftJoin(c.olbg.source,c.olbg.joinOn).leftJoin(c.be.source,c.be.joinOn).leftJoin(c.research.source,c.research.joinOn).where(where).orderBy(...c.order(period==='3m'?'yield3m':period==='6m'?'yield6m':'yield12m'))
 const total=await database.select({value:count()}).from(schema.tipsters).leftJoin(c.base.source,c.base.joinOn).leftJoin(c.olbg.source,c.olbg.joinOn).leftJoin(c.be.source,c.be.joinOn).leftJoin(c.research.source,c.research.joinOn).where(where)
 return {rows,total:total[0].value,c}
}
run('real existing SELECT uses all 547 imported Global identities, 485 period numbers and 312 NULL holds',async()=>{
 const stored=new Map((await database.select().from(schema.tipsters).where(eq(schema.tipsters.platform,'bettingexpert'))).map(r=>[r.slug,r]))
 let nums=0,held=0,empty=0;const qualities:Record<string,number>={}
 for(const period of ['3m','6m','12m']as const){
  const {rows,total}=await select(period);expect(rows).toHaveLength(547);expect(total).toBe(547)
  for(const row of rows){
   const p=windows.profiles.find((p:any)=>p.username===row.slug),w=p.windows[period],visible=row.beResearch!.windows[period]
   expect(visible.value).toBe(w.yieldPct);expect(visible.state).toBe(w.state)
   const c=fromDbTipster(bettingexpertApiProjection(row,new Date('2026-11-19T18:00:00Z')))
   const card=period==='3m'?c.yield3m:period==='6m'?c.yield6m:c.yield12m
   expect(card.valuePct).toBe(w.yieldPct===null?null:Number(w.yieldPct))
   if(w.state==='number'){nums++;qualities[visible.quality]=(qualities[visible.quality]??0)+1}else if(w.state==='held')held++;else empty++
   const g=globals.find(g=>g.username===row.slug)!;expect(row.picks).toBe(g.picks);expect(row.yield).toBe(stored.get(row.slug)!.yield);expect(row.profit).toBe(stored.get(row.slug)!.profit)
   expect(c.platform).toBe('bettingexpert');expect(c.yieldTitle).toContain('Global')
  }
 }
 expect([nums,held,empty]).toEqual([485,312,844]);expect(qualities).toEqual({contrasted:48,experimental:3,'global-consistent':137,reconstructed:297})
},30000)
run('period and Global minimum filters use distinct SQL columns before count/order/pagination',async()=>{
 for(const period of ['3m','6m','12m']as const){
  const {rows,total}=await select(period,{beMinYield:'0',beMinPicks:5,minPicks:10})
  const want=windows.profiles.filter((p:any)=>{const w=p.windows[period],g=globals.find(g=>g.guid===p.sourceGuid);return w.yieldPct!==null&&Number(w.yieldPct)>=0&&w.picks>=5&&g!.picks>=10})
  expect(rows.length).toBe(want.length);expect(total).toBe(want.length)
  expect(new Set(rows.map(r=>r.slug))).toEqual(new Set(want.map((p:any)=>p.username)))
 }
},30000)
run('missing/wrong/duplicate GUID provenance masks periods, not Global, and no contaminated raw period leaks',async()=>{
 const name=windows.profiles.find((p:any)=>Object.values(p.windows).some((w:any)=>w.state==='number')).username
 const before=(await select('12m')).rows.find(r=>r.slug===name)!
 await pg.query("UPDATE import_validation_log SET reason=jsonb_set(reason::jsonb,'{sourceGuid}','\"00000000-0000-0000-0000-000000000000\"')::text WHERE platform='bettingexpert' AND slug=$1 AND class='accepted[profile-overall]'",[name])
 await pg.query("UPDATE tipsters SET yield_3m=999,yield_6m=999,yield_12m=999 WHERE platform='bettingexpert' AND slug=$1",[name])
 const after=(await select('12m')).rows.find(r=>r.slug===name)!
 expect(after.beResearch).toBeNull();expect(after.yield12m).toBeNull();expect(after.yield).toBe(before.yield)
 await pg.query("UPDATE import_validation_log SET reason=jsonb_set(reason::jsonb,'{sourceGuid}',to_jsonb($2::text))::text WHERE platform='bettingexpert' AND slug=$1 AND class='accepted[profile-overall]'",[name,globals.find(g=>g.username===name)!.guid])
 const restored=(await select('12m')).rows.find(r=>r.slug===name)!;expect(restored.beResearch).not.toBeNull()
 await pg.query("INSERT INTO import_validation_log(platform,slug,captured_at,class,reason,run_id) SELECT platform,slug,captured_at,class,reason,'duplicate-test' FROM import_validation_log WHERE slug=$1 AND class='accepted[profile-overall]'",[name])
 expect((await select('12m')).rows.find(r=>r.slug===name)!.beResearch).toBeNull()
 await pg.query("DELETE FROM import_validation_log WHERE run_id='duplicate-test'")
},30000)
run('actual existing API pages match SQL order, preserve Global and reject changed continuations',async()=>{
 const q={platform:'bettingexpert' as const,bePeriod:'12m' as const,beMinYield:'0'}
 const c=await context(),token=beListToken(c.beRevision,q,'yield12m')!
 const expected=(await select('12m',{beMinYield:'0'})).rows.map(r=>r.id);const ids:number[]=[]
 for(let page=0;page<Math.ceil(expected.length/50);page++){
  const p=new URLSearchParams({platform:'bettingexpert',bePeriod:'12m',beMinYield:'0',sort:'yield12m',page:String(page),beRevision:token})
  const res=await GET(new NextRequest('http://localhost/api/tipsters?'+p));expect(res.status).toBe(200);const json=await res.json();ids.push(...json.data.map((r:any)=>r.id))
  for(const r of json.data){expect(r.beResearch).toBeTruthy();expect(r.yield12m).toBe(r.beResearch.windows['12m'].value);expect(r.beAudit).toBeNull()}
  const serialized=JSON.stringify(json);for(const forbidden of ['raw_base64','jsonPointer','receiptSha256','anchorCapturedAt','/tmp/','sourceGuid'])expect(serialized).not.toContain(forbidden)
 }
 expect(ids).toEqual(expected);expect(new Set(ids).size).toBe(ids.length)
 const changed=await GET(new NextRequest('http://localhost/api/tipsters?platform=bettingexpert&bePeriod=6m&page=1&beRevision='+token));expect(changed.status).toBe(409)
 const missing=await GET(new NextRequest('http://localhost/api/tipsters?platform=bettingexpert&page=1'));expect(missing.status).toBe(409)
},30000)
run('local flag is fail-closed in production, month rollover masks, and other platforms are unchanged',async()=>{
 const {beExistingLocalEnabled}=await import('@/lib/bettingexpert-existing-read')
 expect(beExistingLocalEnabled({NODE_ENV:'production',USE_PGLITE:'1',BE_EXISTING_LOCAL:'1'})).toBe(false)
 const current=await context();expect(await current.revisionUnchanged()).toBe(true)
 await pg.query("UPDATE tipsters SET name='Changed locally' WHERE id=1") // other platform does not affect BE snapshot
 expect(await current.revisionUnchanged()).toBe(true)
 const row=(await database.select().from(schema.tipsters).where(eq(schema.tipsters.id,1)))[0];expect(fromDbTipster(row).yield6m.valuePct).toBe(3)
 const next=await tipsterReadContext([],new Date('2026-12-01T00:00:00Z'));const rows=await database.select(next.projection).from(schema.tipsters).leftJoin(next.base.source,next.base.joinOn).leftJoin(next.olbg.source,next.olbg.joinOn).leftJoin(next.be.source,next.be.joinOn).leftJoin(next.research.source,next.research.joinOn).where(eq(schema.tipsters.platform,'bettingexpert'))
 expect(rows.every(r=>r.yield3m===null&&r.yield6m===null&&r.yield12m===null)).toBe(true)
 expect(()=>parseBEPeriodFilters(new URLSearchParams('beMinYield=1'))).toThrow()
},30000)
run('snapshot changes invalidate continuation and fixed metadata cannot accept foreign policy/files',async()=>{
 const c=await context(),row=globals[0]
 await pg.query("UPDATE tipsters SET yield=yield+0.01 WHERE platform='bettingexpert' AND slug=$1",[row.username])
 expect(await c.revisionUnchanged()).toBe(false)
 const next=await context();expect(next.beRevision).not.toBe(c.beRevision)
 expect(beListToken(next.beRevision,{platform:'bettingexpert'},'yield')).not.toBe(beListToken(c.beRevision,{platform:'bettingexpert'},'yield'))
 await pg.query("UPDATE tipsters SET yield=$2::numeric WHERE platform='bettingexpert' AND slug=$1",[row.username,String(row.yieldPct)])
},30000)

run('active monthly-route integration preserves BE SQL filters, order, cards and continuation',async()=>{
 const dir=mkdtempSync('/tmp/be-monthly-coexist-'),file=dir+'/empty-monthly.json'
 const bytes=JSON.stringify({version:1,basis:'source-published-month-global-all-tips',profiles:[]})
 writeFileSync(file,bytes)
 vi.stubEnv('LAB_PREVIEW','1');vi.stubEnv('OLBG_MONTHLY_LOCAL','1');vi.stubEnv('OLBG_MONTHLY_SNAPSHOT_FILE',file);vi.stubEnv('OLBG_MONTHLY_SNAPSHOT_SHA256',createHash('sha256').update(bytes).digest('hex'))
 try{
  const expected=(await select('6m',{beMinYield:'0'})).rows.map(r=>'bettingexpert:'+r.id),keys:string[]=[]
  let cursor:string|null=null
  do{
   const p=new URLSearchParams({platform:'bettingexpert',bePeriod:'6m',beMinYield:'0',sort:'yield6m'})
   if(cursor)p.set('monthlyCursor',cursor)
   const res=await GET(new NextRequest('http://localhost/api/tipsters?'+p));expect(res.status).toBe(200)
   const result=await res.json();expect(result.mode).toBe('olbg-published-monthly')
   for(const row of result.rows){keys.push(row.key);expect(row.card.platform).toBe('bettingexpert');expect(row.card.yield6m.valuePct).not.toBeNull();expect(row.card.sourceDetail).toBeTruthy()}
   cursor=result.nextCursor
  }while(cursor)
  expect(keys).toEqual(expected)
 }finally{vi.stubEnv('LAB_PREVIEW','0');vi.stubEnv('OLBG_MONTHLY_LOCAL','0');rmSync(dir,{recursive:true,force:true})}
},30000)

run('production fixed snapshot reads existing cards, rejects changed evidence and preserves other platforms on missing snapshot',async()=>{
 const {BE_RELEASE_TABLE_SQL}=await import('@/lib/bettingexpert-release-install')
 const {buildBEReleaseProfiles,BE_RELEASE_ID,BE_RELEASE_SHA256,BE_RELEASE_POLICY,EVIDENCE_REVISION}=await import('@/lib/bettingexpert-release-artifact')
 await pg.exec(BE_RELEASE_TABLE_SQL)
 const profiles=buildBEReleaseProfiles(process.env.BE_TEST_EVIDENCE_DIR!)
 await pg.query(`INSERT INTO be_fixed_release(release_id,evidence_revision,policy,profiles_sha256,profiles,inserted_rows,run_ids,inserted_logs) VALUES($1,$2,$3,$4,$5::jsonb,'[]','[]','[]')`,[BE_RELEASE_ID,EVIDENCE_REVISION,BE_RELEASE_POLICY,BE_RELEASE_SHA256,JSON.stringify(profiles)])
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('BE_FIXED_RELEASE',BE_RELEASE_ID)
 try{
  const c=await context();expect(await c.revisionUnchanged()).toBe(true)
  const result=await select('12m');expect(result.rows.filter(r=>r.yield12m!==null)).toHaveLength(profiles.filter(p=>p.public.windows['12m'].value!==null).length)
  await pg.query("UPDATE be_fixed_release SET profiles=jsonb_set(profiles,'{0,public,windows,12m,value}','\"999\"')")
  await expect(c.revisionUnchanged()).rejects.toThrow('Fixed BE release bytes mismatch')
  const masked=await select('12m');expect(masked.rows.every(r=>r.yield12m===null)).toBe(true)
  expect(masked.rows.every(r=>r.yield!==null)).toBe(true)
  await pg.query('DELETE FROM be_fixed_release')
  const missing=await select('6m');expect(missing.rows.every(r=>r.yield6m===null)).toBe(true)
  expect((await select('6m',{beMinYield:'0'})).rows).toHaveLength(0)
  const safe=await context();expect(safe.warnings({platform:'bettingexpert'}).join(' ')).toContain('Global conservado')
  expect((await database.select().from(schema.tipsters).where(eq(schema.tipsters.id,1)))[0].platform).toBe('blogabet')
 }finally{vi.stubEnv('NODE_ENV','development');vi.stubEnv('BE_FIXED_RELEASE','')}
},30000)
