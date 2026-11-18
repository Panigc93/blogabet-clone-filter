// Offline validation over a retained, private source projection. No network.
// Optional second argument: previously reviewed interval-analysis result.json.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {estimateGlobalYield} from '../lib/olbg-estimated-global'
import {validateMonthlyProfile,type PublishedMonthlyProfile} from '../lib/olbg-published-monthly'
const [file,reviewed]=process.argv.slice(2)
if(!file)throw Error('Expected retained projection path')
const ps:PublishedMonthlyProfile[]=JSON.parse(fs.readFileSync(file,'utf8')).profiles
ps.forEach(validateMonthlyProfile)
const prior=reviewed?JSON.parse(fs.readFileSync(reviewed,'utf8')):null
const result:any={profiles:ps.length,global:{},windows:{},reviewedComparisons:0}
const global=ps.map(p=>({id:p.id,name:p.name,estimate:estimateGlobalYield(p)}))
for(const status of ['estimated','interval-only','unavailable'])result.global[status]=global.filter(p=>p.estimate.status===status).length
for(const scope of [3,6,12] as const){
 const rows=ps.map(p=>({id:p.id,estimate:estimateGlobalYield(p,scope)})).filter(x=>x.estimate.monthsUsed.length===scope&&x.estimate.missingMonths.length===0)
 const widths=rows.filter(x=>x.estimate.range).map(x=>x.estimate.range!.widthPP).sort((a,b)=>a-b)
 result.windows[scope]={complete:rows.length,estimated:rows.filter(x=>x.estimate.status==='estimated').length,intervalOnly:rows.filter(x=>x.estimate.status==='interval-only').length,bands:[widths.filter(x=>x<=1).length,widths.filter(x=>x>1&&x<=2).length,widths.filter(x=>x>2&&x<=5).length,widths.filter(x=>x>5).length],median:widths.length%2?widths[(widths.length-1)/2]:(widths[widths.length/2-1]+widths[widths.length/2])/2}
 if(prior){
  const before=prior.windows[scope].profiles
  assert.equal(rows.length,before.length)
  for(const row of rows){
   const old=before.find((x:any)=>x.id===row.id);assert.ok(old)
   const e=row.estimate
   if(old.central===null)assert.equal(e.centralPct,null);else assert.ok(e.centralPct!==null&&Math.abs(e.centralPct-old.central)<1e-10)
   for(const [key,oldKey] of [['nearest','nearest-integer'],['truncation','truncate-toward-zero'],['range','combined-rule-envelope']] as const){
    const a=e[key],b=old[oldKey];assert.equal(a===null,b===null)
    if(a&&b){assert.ok(Math.abs(a.lowerPct-b.lo)<1e-10);assert.ok(Math.abs(a.upperPct-b.hi)<1e-10);assert.ok(Math.abs(a.widthPP-b.widthPP)<1e-10);result.reviewedComparisons++}
   }
  }
 }
}
// Every real available-row estimate includes exactly its retained closed rows.
for(const p of ps){const e=global.find(x=>x.id===p.id)!.estimate;const closed=p.months.filter(m=>m.month<p.capturedAt.slice(0,7));assert.equal(e.monthsUsed.length,closed.length);assert.equal(e.picks,closed.reduce((n,m)=>n+m.picks,0));assert.equal(e.profitSource,closed.reduce((n,m)=>n+m.profitPublished,0));if(e.centralPct!==null){assert.ok(e.range);assert.ok(e.centralPct>=e.range.lowerPct-1e-10&&e.centralPct<=e.range.upperPct+1e-10)}}
const representative=global.find(x=>x.id===638883)
result.representative=representative
console.log(JSON.stringify(result,null,2))
