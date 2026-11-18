// One bounded read-only production baseline benchmark. Never logs credentials.
import fs from 'node:fs'
import {performance} from 'node:perf_hooks'
async function main(){
 process.env.DATABASE_URL=fs.readFileSync(process.argv[2],'utf8').trim()
 delete process.env.USE_PGLITE;delete process.env.OLBG_ACTIVATION
 const {tipsterReadContext}=await import('../lib/tipster-read-context')
 const {loadDatabasePeriodAudits}=await import('../lib/bet2invest-period-index')
 const {db}=await import('../db')
 const {tipsters}=await import('../db/schema')
 const {and,ne}=await import('drizzle-orm')
 const {loadCommonPublishedMonthlyPage}=await import('../lib/olbg-common-list-loader')
 const {createHash}=await import('node:crypto')
 const {semanticBaselineRevision}=await import('../lib/olbg-release-read-guard')
 const at=new Date(),metrics:any={readOnly:true,atomicStatementSnapshot:process.argv.includes('--atomic'),at:at.toISOString(),queries:[]}
 const start=performance.now(),context=await tipsterReadContext(await loadDatabasePeriodAudits(at),at)
 metrics.contextMs=performance.now()-start
 let previous:any[]|null=null
 const read=async()=>{
  const t=performance.now()
  const rows=await db.select(context.projection).from(tipsters).leftJoin(context.base.source,context.base.joinOn).leftJoin(context.olbg.source,context.olbg.joinOn).where(and(...context.filters({}),ne(tipsters.platform,'olbg'))).orderBy(...context.order('yield'))
  if(previous){const byId=new Map(previous.map(r=>[r.id,r]));const changed=new Set<string>();let count=0;for(const r of rows){const old=byId.get(r.id);if(!old){changed.add('identity');continue}for(const k of Object.keys(r))if(JSON.stringify(old[k])!==JSON.stringify((r as any)[k])){changed.add(k);count++}}console.log(JSON.stringify({changedColumns:Array.from(changed),changedValues:count,orderIdentical:rows.every((r,i)=>r.id===previous![i]?.id)}))};previous=rows
  metrics.queries.push({rows:rows.length,ms:performance.now()-t,jsonBytes:Buffer.byteLength(JSON.stringify(rows))})
  const revision=semanticBaselineRevision(rows)
  return {rows,revision,complete:true as const,readAt:at.toISOString()}
 }
 const file=process.argv[3],digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex')
 const page=await loadCommonPublishedMonthlyPage({monthlyFile:file,monthlySha256:digest,atomicStatementSnapshot:process.argv.includes('--atomic')?true:undefined,sourceContextUnchanged:()=>context.revisionUnchanged(),request:{estimate:true,monthly:{month:'latest-available'},order:'yield-desc',pageSize:50},readBaseline:read,baselineUnchanged:async revision=>await context.revisionUnchanged()&&(await read()).revision===revision})
 metrics.totalMs=performance.now()-start;metrics.totalProfiles=page.total;metrics.firstPage=page.rows.length;metrics.hasMore=!!page.nextCursor;metrics.memory=process.memoryUsage();metrics.snapshotSha=digest
 fs.writeFileSync('/tmp/olbg-production-baseline-benchmark.json',JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2))
}
main().catch(e=>{console.error('Read-only baseline benchmark failed:',JSON.stringify({name:e?.name,code:e?.code,causeName:e?.cause?.name,causeCode:e?.cause?.code,nonsecretMessage:String(e?.message??'').replace(/postgres(?:ql)?:\/\/[^\s]+/gi,'[redacted-url]').replace(/password[^\s]*/gi,'[redacted]')}));process.exitCode=1})
