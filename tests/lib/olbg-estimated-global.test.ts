import {describe,it,expect} from 'vitest'
import {estimateGlobalYield,estimateMonths} from '@/lib/olbg-estimated-global'
import {publishedMonth,type PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
// Synthetic accounting examples only. Real-data checks stay outside the repo.
const profile=(rows:Array<[string,number,number,number]>,capture='2026-11-18T12:00:00Z'):PublishedMonthlyProfile=>({id:1,name:'Synthetic test',joinedAt:'2020-01-01',capturedAt:capture,sourceUrl:'https://www.olbg.com/tipsters/about/1',months:rows.map(([date,tips,profit,roi])=>publishedMonth({date,tips:String(tips),profit:String(profit),roi:`${roi}%`}))})
describe('conditional estimated global OLBG yield',()=>{
 it('uses inferred stakes, not a picks-weighted mean, and excludes current month',()=>{
  const e=estimateGlobalYield(profile([['Sep 2026',176,4726,49],['Oct 2026',184,-1175,-12],['Nov 2026',999,9999,999]]))
  expect(e.centralPct).toBeCloseTo(18.269689,5);expect(e.picks).toBe(360);expect(e.profitSource).toBe(3551)
  expect(e.monthsUsed).toEqual(['2026-09','2026-10']);expect(e.range!.lowerPct).toBeLessThanOrEqual(e.centralPct!)
  expect(e.range!.upperPct).toBeGreaterThanOrEqual(e.centralPct!)
 })
 it('does not impute stake or a midpoint when the zero-ROI global interval exceeds2pp',()=>{
  for(const profit of [0,4,-4]){
   const e=estimateGlobalYield(profile([['Sep 2026',10,profit,0],['Oct 2026',10,100,10]]))
   expect(e.centralPct).toBeNull();expect(e.status).toBe('interval-only');expect(e.range!.stakeUpperUnbounded).toBe(true)
   expect(e.range!.lowerPct).toBeLessThanOrEqual(0);expect(e.range!.upperPct).toBeGreaterThanOrEqual(0)
  }
 })
 it('handles negative totals and exact cancellation without reversing bounds',()=>{
  const e=estimateGlobalYield(profile([['Oct 2026',10,-100,-10]]))
  expect(e.centralPct).toBe(-10);expect(e.range!.lowerPct).toBeLessThan(-10);expect(e.range!.upperPct).toBeGreaterThan(-10)
  const zero=estimateGlobalYield(profile([['Sep 2026',10,100,10],['Oct 2026',10,-100,-10]]))
  expect(zero.centralPct).toBe(0);expect(zero.range!.widthPP).toBe(0)
 })
 it('refuses inconsistent profit/ROI signs and nonzero ROI with zero profit',()=>{
  for(const [profit,roi] of [[10,-10],[0,10],[-10,10]])expect(estimateGlobalYield(profile([['Oct 2026',10,profit,roi]])).reason).toBe('inconsistent-source')
 })
 it('keeps gaps explicit in available rows, never claims a complete fixed window',()=>{
  const p=profile([['Aug 2026',10,100,10],['Oct 2026',10,100,10]])
  const global=estimateGlobalYield(p),three=estimateGlobalYield(p,3)
  expect(global.status).toBe('estimated');expect(global.missingMonths).toEqual(['2026-09'])
  expect(three.status).toBe('unavailable');expect(three.reason).toBe('missing-months');expect(three.centralPct).toBeNull()
 })
 it('does not promote registration or a current-only month into historical results',()=>{
  const e=estimateGlobalYield(profile([['Nov 2026',10,100,10]]))
  expect(e.reason).toBe('no-closed-results');expect(e.monthsUsed).toEqual([]);expect(e.centralPct).toBeNull()
  expect(estimateMonths('2026-02',3)).toEqual(['2025-11','2025-12','2026-01'])
 })
 it('contains exact synthetic accounting under both hypothetical rounding rules',()=>{
  let seed=123456
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<1000;i++){
   const stakes=[100+Math.floor(random()*9000),100+Math.floor(random()*9000)]
   const profits=stakes.map(s=>Math.floor(s*(random()-.4)))
   const truth=100*(profits[0]+profits[1])/(stakes[0]+stakes[1])
   for(const round of [Math.round,Math.trunc]){
    const e=estimateGlobalYield(profile([['Sep 2026',10,profits[0],round(100*profits[0]/stakes[0])],['Oct 2026',10,profits[1],round(100*profits[1]/stakes[1])]]))
    expect(e.range).not.toBeNull();expect(e.range!.lowerPct).toBeLessThanOrEqual(truth+1e-10);expect(e.range!.upperPct).toBeGreaterThanOrEqual(truth-1e-10)
   }
  }
 })
})
