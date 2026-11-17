// Local PGlite indexed-reader characterization. Never opens remote accounts.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync,writeFileSync} from 'node:fs'
import {ACTIVE_CLASS,ACTIVE_SLUG,updateActiveIndex,readActiveIndex} from '../crawler/platforms/bet2invest/active-period-index'
import {windowBounds,type PeriodAudit} from '../lib/bet2invest-period-contract'
async function main(){
 const pg=new PGlite(),results=[]
 try{
  await pg.exec('CREATE TABLE tipsters(platform text,slug text,captured_at timestamptz);CREATE TABLE import_validation_log(platform text,slug text,class text,reason text,run_id text,created_at timestamptz DEFAULT NOW());CREATE INDEX existing_platform_slug ON import_validation_log(platform,slug)')
  const plan=JSON.parse(readFileSync('/downloads/b2i-sourced-final.plan.json','utf8'))
  const rows:PeriodAudit[]=plan.batches.flatMap((b:any)=>b.rows.filter((r:any)=>r.status==='row').map((r:any)=>({slug:r.slug,capturedAt:b.capturedAt,windows:Object.fromEntries(([3,6,12] as const).map(n=>[n,{...r.windows[n],...windowBounds(new Date(b.capturedAt),n)}]))})))
  await pg.transaction(tx=>updateActiveIndex(tx,rows))
  for(const retained of [970,9700,29100]){
   const n=(await pg.query<{n:number}>('SELECT count(*)::int n FROM import_validation_log')).rows[0].n
   await pg.query("INSERT INTO import_validation_log(platform,slug,class,reason,run_id) SELECT 'bet2invest','historical-'||i,'b2i-run-manifest-v1',$1,'old-'||i FROM generate_series($2::int,$3::int)i",[JSON.stringify({manifest:{rows:[rows[0]]}}),n,retained-1])
   await pg.exec('ANALYZE')
   const ms=[];let count=0
   for(let i=0;i<5;i++){const start=performance.now();count=(await readActiveIndex(pg))!.length;ms.push(Number((performance.now()-start).toFixed(2)))}
   const explain=await pg.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT reason FROM import_validation_log WHERE platform=$1 AND slug=$2 AND class=$3',['bet2invest',ACTIVE_SLUG,ACTIVE_CLASS])
   results.push({retained,current:count,readAndIntegrityMs:ms,explain:explain.rows})
  }
  writeFileSync('/downloads/b2i-singleton-read-cost.json',JSON.stringify({engine:'local PGlite',results},null,2));console.log(JSON.stringify(results.map(({explain,...r})=>r)))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
