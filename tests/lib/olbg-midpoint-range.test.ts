import {describe,it,expect} from 'vitest'
import {profitToleranceRange} from '@/lib/olbg-midpoint-range'
import {estimateGlobalYield} from '@/lib/olbg-estimated-global'
import {publishedMonth,type PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
const m=(profit:string,roi:string)=>publishedMonth({date:'Oct 2026',tips:'100',roi,profit})
const profile=(rows:ReturnType<typeof m>[]):PublishedMonthlyProfile=>({id:1,name:'Synthetic',avatarUrl:null,joinedAt:'2020-01-01',capturedAt:'2026-11-18T00:00:00Z',sourceUrl:'https://www.olbg.com/tipsters/about/1',months:rows})
describe('approved conditional midpoint rescue',()=>{
 it('keeps original nonzero-ROI central unchanged',()=>{
  const e=estimateGlobalYield(profile([m('100','10%')]))
  expect(e.centralPct).toBe(10);expect(e.centralConvention).toBeUndefined()
 })
 it('includes Profit uncertainty and treats zero as uncertain, not an exact recovered zero',()=>{
  const r=profitToleranceRange([m('0','0%')])!
  expect(r.lowerPct).toBe(-1);expect(r.upperPct).toBe(1);expect(r.widthPP).toBe(2)
  const e=estimateGlobalYield(profile([m('0','0%')]))
  expect(e.centralPct).toBe(0);expect(e.centralConvention).toBe('interval-midpoint-profit-tolerance-1')
 })
 it('does not use periods as a fallback global and does not change period convention',()=>{
  expect(estimateGlobalYield(profile([m('0','0%')]),3).centralConvention).toBeUndefined()
 })
 it('refuses intervals above2pp and keeps losses negative',()=>{
  const wide=profile([m('-50','0%'),{...m('-100','-10%'),month:'2026-09',source:{date:'Sep 2026',tips:'100',roi:'-10%',profit:'-100'}}])
  const e=estimateGlobalYield(wide)
  expect(e.range!.widthPP).toBeGreaterThan(2);expect(e.centralPct).toBeNull()
  const narrow=profile([m('-1','0%'),{...m('-1,000','-1%'),month:'2026-09',source:{date:'Sep 2026',tips:'100',roi:'-1%',profit:'-1,000'}}])
  const n=estimateGlobalYield(narrow)
  expect(n.centralPct).toBeLessThan(0);expect(n.range!.widthPP).toBeLessThanOrEqual(2)
 })
})
