import fs from 'node:fs'
import path from 'node:path'
import { parseProtipsterProfile, parseDashboardGraph } from '../crawler/platforms/protipster/parse'
import { protipsterRowToInsert } from '../crawler/platforms/protipster/to-db'
const root=path.resolve('crawler/platforms/protipster/capture-run-2026-11-20')
const st=JSON.parse(fs.readFileSync(path.join(root,'state.json'),'utf8'))
const rows:any[]=[],mapped:any[]=[],held:any[]=[]
for(const slug of st.profiles.done){
 const preload=fs.readFileSync(path.join(root,'raw',`${slug}-preload-2026-11-20.js.txt`),'utf8')
 const raw=JSON.parse(fs.readFileSync(path.join(root,'raw',`${slug}-dashboard-graph-2026-11-20.json`),'utf8'))
 const parsed=parseProtipsterProfile(preload)
 const row:any={slug,capturedAt:raw.capturedAt,sourceUrl:`https://www.protipster.es/tipster/${slug}`,...parsed,period3m:null,months:{}}
 for(const r of raw.responses){const b=parseDashboardGraph(r.body);if(!b)throw Error(`${slug}:unparseable ${r.dateCriteria}`);if(r.dateCriteria==='lastThreeMonths')row.period3m=b.stats;else row.months[r.dateCriteria]=b.stats}
 const annualPath=path.join(root,'raw',`${slug}-annual-validation.json`)
 if(fs.existsSync(annualPath)){const a=JSON.parse(fs.readFileSync(annualPath,'utf8'));const body=JSON.parse(a[0].resp),block=parseDashboardGraph(body);row.periodAlltime=block?.stats??null;row.annualCoverage={criteria:block?.defaultDateCriteria,years:body.chartData.detailedGraphData.slice(1).map((v:any)=>String(v[0])),activeMonths:block?.activeMonths}}
 rows.push(row)
 const result=protipsterRowToInsert(row,{id:parsed.overview?.id??0,idSource:'source-captured',slug:parsed.overview?.usernameCanonical??slug,sourceUrl:row.sourceUrl})
 if(result.ok)mapped.push(result.insert);else held.push({slug,...result,parsed:{overview:!!parsed.overview,summary:!!parsed.summary,chartDefault:!!parsed.chartDefault}})
}
for(const h of st.profiles.held)rows.push({slug:h.slug,capturedAt:st.updatedAt,sourceUrl:`https://www.protipster.es/tipster/${h.slug}`,overview:null,summary:null,chartDefault:null,period3m:null,months:{},quarantine:{reason:h.reason}})
fs.mkdirSync('data/protipster',{recursive:true})
fs.writeFileSync('data/protipster/profiles.jsonl',rows.map(r=>JSON.stringify(r)).join('\n')+'\n')
fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({total:rows.length,captured:st.profiles.done.length,captureHolds:st.profiles.held,valid:mapped.length,held,noPicks12m:mapped.filter(r=>r.yield12m===null).map(r=>r.slug),missingAvatars:mapped.filter(r=>!r.avatarUrl).map(r=>r.slug),duplicateSourceIds:mapped.filter((r,i)=>mapped.findIndex(v=>v.id===r.id)!==i).map(r=>r.slug)},null,2))
console.log(fs.readFileSync(path.join(root,'validation.json'),'utf8'))
