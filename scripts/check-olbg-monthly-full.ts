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
