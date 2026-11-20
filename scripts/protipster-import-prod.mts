// Explicit production runner. Dry-run default. Credentials read only from env.
import pg from 'pg'
import {drizzle} from 'drizzle-orm/node-postgres'
import * as schemaNs from '../db/schema'
import * as impNs from '../crawler/platforms/protipster/import'
import {writeFileSync} from 'node:fs'
const {tipsters,importValidationLog}=(schemaNs as any).default??schemaNs
const {planProtipsterImport,executeProtipsterImport}=(impNs as any).default??impNs
const RUN='protipster-prod-2026-11-20'
async function main(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required')
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1})
 try{
 const q=(s:string,p?:any[])=>pool.query(s,p).then(r=>r.rows)
 const existing=await q(`SELECT count(*)::int n FROM tipsters WHERE platform='protipster'`);if(existing[0].n!==0)throw Error('Platform not empty. Refusing first-import runner.')
 const col=await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='tipsters' AND column_name='source_url'`);if(col[0].n!==1)throw Error('Required source_url column missing')
 const plan=planProtipsterImport('data/protipster/profiles.jsonl');if(plan.inserts.length!==210||plan.holds.length!==3)throw Error('Plan counts changed; review first')
 const fingerprint=async()=>q(`SELECT platform,count(*)::int n,md5(string_agg(md5(t::text),'' ORDER BY id)) hash FROM (SELECT * FROM tipsters WHERE platform<>'protipster') t GROUP BY platform ORDER BY platform`)
 const before=await fingerprint();console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',run:RUN,inserts:plan.inserts.length,holds:plan.holds,before},null,2))
 if(!process.argv.includes('--apply'))return
 const out=await executeProtipsterImport(drizzle(pool,{schema:{tipsters,importValidationLog}}),plan,RUN)
 const after=await fingerprint();const intact=JSON.stringify(before)===JSON.stringify(after)
 const actual=await q(`SELECT count(*)::int n,count(source_url)::int urls,count(avatar_url)::int avatars,count(*) FILTER(WHERE yield_12m IS NULL)::int no12m FROM tipsters WHERE platform='protipster'`)
 const logs=await q(`SELECT slug,class AS klass,reason FROM import_validation_log WHERE run_id=$1 ORDER BY slug`,[RUN]);const report={run:RUN,...out,actual:actual[0],otherPlatformsIntact:intact,holds:logs}
 writeFileSync('/tmp/protipster-production-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!intact||actual[0].n!==210||logs.length!==3)throw Error('Post-import verification failed, inspect result')
 }finally{await pool.end()}
}
main().catch(e=>{console.error(e.message);process.exit(1)})
