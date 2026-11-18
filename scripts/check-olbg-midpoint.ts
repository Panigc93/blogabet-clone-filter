// Read-only retained-data validation. No network/DB or source changes.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {estimateGlobalYield} from '../lib/olbg-estimated-global'
import {profitToleranceRange} from '../lib/olbg-midpoint-range'
import {commonMonthlyPage,type CommonListEntry} from '../lib/olbg-common-list-candidate'
import type {PublishedMonthlyProfile} from '../lib/olbg-published-monthly'
const [snapshotFile,reviewedLP]=process.argv.slice(2)
const profiles=JSON.parse(fs.readFileSync(snapshotFile,'utf8')).profiles as PublishedMonthlyProfile[]
const expected=JSON.parse(fs.readFileSync(reviewedLP,'utf8')).scenarios.profitError1_stakeBoundsFalse.results as Array<{id:number;lo:number;hi:number}>
let maxDifference=0,rescued=0
for(const e of expected){
 const p=profiles.find(p=>p.id===e.id)!,closed=p.months.filter(m=>m.month<p.capturedAt.slice(0,7))
 const range=profitToleranceRange(closed)!
 maxDifference=Math.max(maxDifference,Math.abs(range.lowerPct-e.lo),Math.abs(range.upperPct-e.hi))
 const global=estimateGlobalYield(p)
 if(range.widthPP<=2){
  assert.equal(global.centralConvention,'interval-midpoint-profit-tolerance-1')
  assert.ok(Math.abs(global.centralPct!-(range.lowerPct+range.upperPct)/2)<1e-10);rescued++
 }else{assert.equal(global.centralPct,null);assert.equal(global.centralConvention,undefined)}
}
assert.ok(maxDifference<1e-10);assert.equal(rescued,19)
const source={revision:'retained-validation',profiles}
const request={estimate:true,order:'yield-desc' as const,monthly:{month:'latest-available'},pageSize:200}
const all:CommonListEntry[]=[];let cursor:string|undefined
for(;;){const page=commonMonthlyPage([],'baseline',source,{...request,cursor});all.push(...page.rows);if(!page.nextCursor)break;cursor=page.nextCursor}
assert.equal(all.length,561);assert.equal(new Set(all.map(r=>r.key)).size,561)
const numeric=all.filter(r=>r.card.yieldPct!==null)
assert.equal(numeric.length,469)
for(let i=1;i<numeric.length;i++)assert.ok(numeric[i-1].card.yieldPct!>=numeric[i].card.yieldPct!)
for(const minCommonYield of [-1,0,1]){
 const expectedKeys:string[]=all.filter(r=>r.card.yieldPct!==null&&r.card.yieldPct>=minCommonYield).map(r=>r.key)
 const found=[];let cursor:string|undefined
 for(;;){const page=commonMonthlyPage([],'baseline',source,{...request,minCommonYield,cursor});found.push(...page.rows.map(r=>r.key));if(!page.nextCursor)break;cursor=page.nextCursor}
 assert.deepEqual(found,expectedKeys)
}
console.log(JSON.stringify({profiles:561,originalPointEstimates:450,rescuedMidpoints:rescued,remainingIntervalOnly:92,maxDifferenceFromReviewedLP:maxDifference,sortAndFiltersAndPagination:true,sourceUnchanged:true}))
