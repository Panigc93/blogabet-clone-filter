// Isolated transaction regression. Never connects to production.
import {readFileSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import {tipsters,importValidationLog} from '../db/schema'
import {planProtipsterImport,executeProtipsterImport} from '../crawler/platforms/protipster/import'
async function main(){
 const dir='/tmp/pglite-protipster-regression';rmSync(dir,{recursive:true,force:true});const pg=new PGlite(dir),db=drizzle(pg,{schema:{tipsters,importValidationLog}})
 for(const file of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql'])for(const st of readFileSync(join(__dirname,'../drizzle',file),'utf8').split('--> statement-breakpoint'))if(st.trim())await pg.exec(st)
 await pg.exec(`INSERT INTO tipsters(id,platform,slug,name,picks,profit,yield) VALUES(12345,'blogabet','bb-probe','BB Probe',111,12.5,5.50),(-221629,'tipstrr','tr-probe','TR Probe',222,361.815,8.25)`)
 const hash=async(platform:boolean)=>(await pg.query<{h:string}>(`SELECT md5(string_agg(t::text,'' ORDER BY id)) h FROM (SELECT * FROM tipsters WHERE ${platform?"platform='protipster'":"platform<>'protipster'"}) t`)).rows[0].h
 const others=await hash(false),p=planProtipsterImport('data/protipster/profiles.jsonl')
 await executeProtipsterImport(db,p,'pt-reg-1');const first=await hash(true);await executeProtipsterImport(db,p,'pt-reg-2');assert.equal(await hash(true),first);assert.equal(await hash(false),others)
 const count=(await pg.query<{n:number}>(`SELECT count(*)::int n FROM tipsters WHERE platform='protipster'`)).rows[0].n;assert.equal(count,p.inserts.length)
 assert.equal((await pg.query<{n:number}>(`SELECT count(*)::int n FROM tipsters WHERE platform='protipster' AND id>-2000000000`)).rows[0].n,0)
 const rows=readFileSync('data/protipster/profiles.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l));const sample=structuredClone(rows.find(r=>r.slug==='sonicc'));assert(sample)
 const select=async()=>(await pg.query<{id:number,yield_3m:string|null}>(`SELECT id,yield_3m FROM tipsters WHERE platform='protipster' AND slug='sonicc'`)).rows[0];const before=await select();assert.notEqual(before.yield_3m,null)
 sample.period3m={...sample.period3m,picks:0,profit:0,stakes:0,yield:null};writeFileSync('/tmp/pt-reg-empty.jsonl',JSON.stringify(sample)+'\n');await executeProtipsterImport(db,planProtipsterImport('/tmp/pt-reg-empty.jsonl'),'pt-empty');assert.equal((await select()).yield_3m,null);assert.equal((await select()).id,before.id)
 sample.period3m={...sample.period3m,picks:10,profit:15,stakes:100,yield:15};writeFileSync('/tmp/pt-reg-refill.jsonl',JSON.stringify(sample)+'\n');await executeProtipsterImport(db,planProtipsterImport('/tmp/pt-reg-refill.jsonl'),'pt-refill');assert.equal((await select()).yield_3m,'15.00');assert.equal((await select()).id,before.id)
 const rb=p.inserts.slice(0,201).map((v,i)=>({...v,slug:`rb-${i}`,name:i===200?null:v.name}));assert.equal(rb.length,201);let threw=false;try{await executeProtipsterImport(db,{rows:201,inserts:rb,holds:[] } as any,'pt-rollback')}catch{threw=true};assert(threw);assert.equal((await pg.query<{n:number}>(`SELECT count(*)::int n FROM tipsters WHERE slug LIKE 'rb-%'`)).rows[0].n,0);assert.equal(await hash(false),others)
 for(const h of p.holds)assert.equal((await pg.query<{n:number}>(`SELECT count(*)::int n FROM tipsters WHERE platform='protipster' AND slug=$1`,[h.slug])).rows[0].n,0)
 console.log(JSON.stringify({result:'REGRESSION OK',rows:p.rows,inserted:count,holds:p.holds.length,checks:['double-import hash identical','other platforms byte-identical','internal ids disjoint','populated-empty-populated overwrites NULL','identity preserved','second-batch failure rolls back all','holds absent']},null,2));await pg.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
