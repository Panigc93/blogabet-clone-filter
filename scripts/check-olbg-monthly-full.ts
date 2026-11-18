import fs from 'node:fs'
import assert from 'node:assert/strict'
import {queryPublishedMonths,validateMonthlyProfile,type PublishedMonthlyProfile} from '../lib/olbg-published-monthly'
const file=process.argv[2]
if(!file)throw Error('Expected offline projected JSON')
const profiles=JSON.parse(fs.readFileSync(file,'utf8')).profiles as PublishedMonthlyProfile[]
profiles.forEach(validateMonthlyProfile)
assert.equal(profiles.length,561)
assert.equal(profiles.reduce((s,p)=>s+p.months.length,0),6020)
const october=queryPublishedMonths(profiles,{month:'2026-10',order:'roi-desc',roiMin:-1000000})
assert.equal(october.length,511)
const latest=queryPublishedMonths(profiles,{month:'latest-available',order:'name'})
assert.equal(latest.length,561)
for(let i=1;i<october.length;i++){
 const a=october[i-1].months.find(m=>m.month==='2026-10')!.roiPublished!
 const b=october[i].months.find(m=>m.month==='2026-10')!.roiPublished!
 assert.ok(a>=b)
}
console.log(JSON.stringify({profiles:561,sourceMonths:6020,octoberPositivePicksAndPublishedROI:511,latestAvailableProfiles:561,octoberSort:'descending verified'}))
import {commonMonthlyPage} from '../lib/olbg-common-list-candidate'
const snapshot={revision:'offline-source-validated',profiles}
let cursor:string|undefined=undefined
const seen=new Set<string>();let pages=0
for(;;){
 const page=commonMonthlyPage([],'baseline-empty-offline',snapshot,{order:'name',monthly:{month:'latest-available'},pageSize:50,cursor})
 assert.equal(page.total,561);pages++
 for(const row of page.rows){assert.ok(!seen.has(row.key));seen.add(row.key)}
 if(!page.nextCursor)break
 cursor=page.nextCursor
}
assert.equal(seen.size,561);assert.equal(pages,12)
const monthly=commonMonthlyPage([],'baseline-empty-offline',snapshot,{order:'olbg-roi-desc',monthly:{month:'2026-10',roiMin:-1000000},pageSize:50})
assert.equal(monthly.total,511)
console.log(JSON.stringify({commonPipelineProfiles:seen.size,pages,commonOctoberFilteredTotal:monthly.total,productionMounted:false}))
