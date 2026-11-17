// Combines parser checkpoints, splits exact capture anchors and tests every
// sourced batch against one disposable local database. Never opens a URL.
import { readActiveIndex } from '../crawler/platforms/bet2invest/active-period-index'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { executeDatabaseAuditedImport, type SourceCapture } from '../crawler/platforms/bet2invest/database-manifest'
import type { OfflineRow } from '../crawler/platforms/bet2invest/offline-import'
const [out, ...args] = process.argv.slice(2)
const syntheticRefresh = args.includes('--synthetic-refresh')
const files = args.filter(a=>a!=='--synthetic-refresh')
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
type Entry = { capturedAt: string; row: OfflineRow; source: SourceCapture }
async function main() {
 const entries: Entry[] = [], held: {slug:string;reason:string}[] = []
 for (const f of files) { const p = JSON.parse(readFileSync(f,'utf8')); entries.push(...p.entries); held.push(...p.held) }
 if (new Set([...entries.map(e=>e.row.slug),...held.map(e=>e.slug)]).size !== entries.length+held.length) throw Error('duplicate profile')
 const groups = new Map<string,Entry[]>()
 for (const e of entries) groups.set(e.capturedAt,[...(groups.get(e.capturedAt)??[]),e])
 const batches = Array.from(groups).sort(([a],[b])=>a.localeCompare(b)).map(([capturedAt,es])=>({runId:`sourced-${hash(capturedAt).slice(0,20)}`,capturedAt,rows:es.map(e=>e.row),sourceCaptures:es.map(e=>e.source)}))
 writeFileSync(out+'.plan.json',JSON.stringify({schemaVersion:1,batches,held}))
 const pg = new PGlite()
 try {
  for (const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])
   for (const q of readFileSync(join(__dirname,'../drizzle',f),'utf8').split('--> statement-breakpoint')) if(q.trim())await pg.exec(q)
  await pg.exec("INSERT INTO tipsters (id,platform,slug,name,picks) VALUES (1,'blogabet','sentinel','untouched',123),(2,'tipstrr','sentinel','untouched',456),(3,'golazobets','sentinel','untouched',789)")
  const before=(await pg.query("SELECT * FROM tipsters WHERE platform!='bet2invest' ORDER BY id")).rows
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
  const counts:Record<string,number>={}, receipts=[]
  for (const b of batches) {
   for (const r of b.rows) if(r.status==='row') {r.insert.capturedAt=new Date(r.insert.capturedAt!);r.insert.statsUpdatedAt=new Date(r.insert.statsUpdatedAt!)}
   const input={rows:b.rows,capturedAt:new Date(b.capturedAt),runId:b.runId}
   const provenance={codeRevision:revision,inputSha256:hash(JSON.stringify(b)),calculatedAt:new Date(),sourceCaptures:b.sourceCaptures}
   const db={transaction:<T>(fn:(tx:any)=>Promise<T>)=>pg.transaction(fn)}
   const result=await executeDatabaseAuditedImport(db,input,provenance)
   if(!result.committed||!result.plan||!result.receipt)throw Error('missing receipt')
   for(const [k,v]of Object.entries(result.plan.counts))counts[k]=(counts[k]??0)+v
   const replay=await executeDatabaseAuditedImport(db,input,provenance)
   if(!replay.alreadyCommitted||replay.receipt?.sha256!==result.receipt.sha256)throw Error('same-run replay mismatch')
   receipts.push(result.receipt)
  }
  for(const e of entries)if(e.row.status==='row'){
   const r=(await pg.query<Record<string,unknown>>("SELECT * FROM tipsters WHERE platform='bet2invest' AND slug=$1",[e.row.slug])).rows[0]
   const p=e.row.insert
   for(const [k,v]of Object.entries({picks:p.picks,profit:p.profit,yield:p.yield,yield_3m:p.yield3m,yield_6m:p.yield6m,yield_12m:p.yield12m}))if(v==null?r[k]!==null:Number(r[k])!==Number(v))throw Error('stored value mismatch')
   if(new Date(r.captured_at as string).toISOString()!==e.capturedAt)throw Error('source capture mismatch')
  }
  if(JSON.stringify(before)!==JSON.stringify((await pg.query("SELECT * FROM tipsters WHERE platform!='bet2invest' ORDER BY id")).rows))throw Error('sentinel changed')
  let syntheticRefreshCounts:Record<string,number>|null=null
  if(syntheticRefresh){
   syntheticRefreshCounts={}
   for(const b of batches){
    const at=new Date(new Date(b.capturedAt).getTime()+1000)
    const rows=JSON.parse(JSON.stringify(b.rows)) as OfflineRow[]
    for(const r of rows)if(r.status==='row'){r.insert.capturedAt=at;r.insert.statsUpdatedAt=at}
    const db={transaction:<T>(fn:(tx:any)=>Promise<T>)=>pg.transaction(fn)}
    const result=await executeDatabaseAuditedImport(db,{rows,capturedAt:at,runId:'synthetic-refresh-'+b.runId},{codeRevision:revision,inputSha256:hash(JSON.stringify(rows)),calculatedAt:new Date()})
    if(!result.plan||!result.committed)throw Error('synthetic second refresh failed')
    for(const[k,v]of Object.entries(result.plan.counts))syntheticRefreshCounts[k]=(syntheticRefreshCounts[k]??0)+v
   }
   const active=await readActiveIndex(pg)
   if(active?.length!==entries.filter(e=>e.row.status==='row').length)throw Error('active index population mismatch')
   for(const e of entries)if(e.row.status==='row'&&active.find(a=>a.slug===e.row.slug)?.capturedAt!==new Date(Date.parse(e.capturedAt)+1000).toISOString())throw Error('second refresh anchor mismatch')
  }
  const summary={syntheticSecondRefresh:syntheticRefreshCounts,syntheticRefreshCaveat:syntheticRefresh?'second timestamps shifted 1s for isolated testing only, not source evidence':null,profiles:entries.length+held.length,prepared:entries.length,batches:batches.length,counts,held,sourceBasis:entries.reduce((a,e)=>{a[e.source.ssr.basis]=(a[e.source.ssr.basis]??0)+1;return a},{}as Record<string,number>),persisted:(await pg.query("SELECT count(*)::int AS rows,count(yield_3m)::int AS y3,count(yield_6m)::int AS y6,count(yield_12m)::int AS y12 FROM tipsters WHERE platform='bet2invest'")).rows,firstRunManifestReceipts:receipts.length,totalHistoricalManifests:(await pg.query<{n:number}>("SELECT count(*)::int n FROM import_validation_log WHERE class='b2i-run-manifest-v1'")).rows[0].n,activeIndexRows:(await readActiveIndex(pg))?.length??0,receiptBytes:receipts.reduce((a,r)=>a+r.bytes,0),allValuesAndOriginalSsrAnchorsVerified:true,sameRunReplaysNoWrites:true,otherPlatformsUnchanged:true,sourceCut:'per-profile SSR and API evidence retained separately; no simultaneous-cut claim'}
  writeFileSync(out+'.report.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
