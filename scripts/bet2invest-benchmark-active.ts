// Local PGlite characterization, not provider latency.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync,writeFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { activeManifestPredicate } from '../lib/bet2invest-active-manifests'
async function main(){
 const pg=new PGlite();const results=[]
 try{
  await pg.exec("CREATE TABLE tipsters(platform text,slug text,captured_at timestamptz);CREATE UNIQUE INDEX idx_tipsters_platform_slug ON tipsters(platform,slug);CREATE TABLE import_validation_log(id bigserial,reason text)")
  const plan=JSON.parse(readFileSync('/downloads/b2i-sourced-final.plan.json','utf8'))
  const current=plan.batches.flatMap((b:any)=>b.rows.filter((r:any)=>r.status==='row').map((r:any)=>({slug:r.slug,at:b.capturedAt,windows:r.windows})))
  await pg.query("INSERT INTO tipsters SELECT 'bet2invest',x->>'slug',(x->>'at')::timestamptz FROM jsonb_array_elements($1::jsonb)x",[JSON.stringify(current)])
  const mk=(at:string)=>current.map((r:any)=>({manifest:{rows:[{slug:r.slug,capturedAt:at==='current'?r.at:at,windows:r.windows}]}}))
  await pg.query('INSERT INTO import_validation_log(reason) SELECT x::text FROM jsonb_array_elements($1::jsonb)x',[JSON.stringify(mk('current'))])
  const q=new PgDialect().sqlToQuery(sql`SELECT id, reason FROM import_validation_log WHERE ${activeManifestPredicate()} LIMIT 1001`)
  for(const rounds of [1,10,30]){
   const n=(await pg.query<{n:number}>('SELECT count(*)::int n FROM import_validation_log')).rows[0].n
   const extra=rounds*969-n
   if(extra>0)await pg.query('INSERT INTO import_validation_log(reason) SELECT ($1::jsonb->(i%969))::text FROM generate_series(0,$2::int-1)i',[JSON.stringify(mk('2026-11-16T00:00:00Z')),extra])
   await pg.exec('ANALYZE')
   const ms=[];let count=0
   for(let run=0;run<3;run++){const start=performance.now();count=(await pg.query(q.sql,q.params)).rows.length;ms.push(Math.round(performance.now()-start))}
   const explain=await pg.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,q.params)
   results.push({records:rounds*969,current:count,ms,explain:explain.rows})
  }
  writeFileSync('/downloads/b2i-active-receipts-cost.json',JSON.stringify({engine:'local PGlite',results},null,2));console.log(JSON.stringify(results.map(({explain,...r})=>r)))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
