import {describe,it,expect} from 'vitest'
import {publishedMonth,validateMonthlyProfile,selectPublishedMonth,queryPublishedMonths,latestAvailableMonth,resultMonthCount,type PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
import {fromPublishedOlbgMonth} from '@/components/olbg-monthly-card-model'
import source from '../fixtures/olbg/published-monthly-real.json'
const profiles=source as PublishedMonthlyProfile[]
const grobler=profiles.find(p=>p.id===280)!
const clone=()=>JSON.parse(JSON.stringify(grobler)) as PublishedMonthlyProfile

describe('published OLBG monthly data, isolated candidate',()=>{
 it('validates retained real profiles and displays their source month, not one aggregate',()=>{for(const p of profiles)expect(validateMonthlyProfile(p)).toBe(p);const m=selectPublishedMonth(grobler,'2026-10');expect(m.selected).toMatchObject({picks:525,roiPublished:-16,profitPublished:-4212});expect(m.history).toHaveLength(13)})
 it('preserves source strings without FX or LSP substitution',()=>{expect(selectPublishedMonth(grobler,'2026-10').selected?.source).toEqual({date:'Oct 2026',tips:'525',roi:'-16%',profit:'-4,212'})})
 it('keeps common total and period yields empty',()=>{const c=fromPublishedOlbgMonth(grobler,'2026-10');expect(c.picks).toBeNull();expect(c.profitDisplay).toBeNull();expect(c.yieldPct).toBeNull();for(const key of ['yield3m','yield6m','yield12m'] as const)expect(c[key].valuePct).toBeNull();expect(c.sinceYear).toBe(2004)})
 it('does not silently replace missing months with latest',()=>{const p=profiles.find(x=>x.id===22513)!;expect(selectPublishedMonth(p,'2026-10').selected).toBeNull();expect(latestAvailableMonth(p)).not.toBe('2026-10')})
 it('does not convert empty-month source ROI zero to known performance',()=>{expect(publishedMonth({date:'Oct 2026',tips:'0',profit:'0',roi:'0%'}).roiPublished).toBeNull()})
 it('filters on the displayed source month and null never passes',()=>{const q={month:'2026-10',order:'roi-desc' as const,roiMin:-1000};const r=queryPublishedMonths(profiles,q);expect(r.some(x=>x.id===22513)).toBe(false);expect(r).toHaveLength(2)})
 it('missing values sort last, and published ties use only deterministic identity tiebreak',()=>{const p=clone();p.id=999999;p.sourceUrl='https://www.olbg.com/tipsters/about/999999';p.name='AAAA';const r=queryPublishedMonths([...profiles,p],{month:'2026-10',order:'roi-desc'});expect(r.at(-1)?.id).toBe(22513);expect(r.findIndex(x=>x.id===999999)).toBeLessThan(r.findIndex(x=>x.id===280))})
 it('latest-available mode requires name order, no mixed-month numeric comparison',()=>{expect(queryPublishedMonths(profiles,{month:'latest-available',order:'name'})).toHaveLength(3);expect(()=>queryPublishedMonths(profiles,{month:'latest-available',order:'roi-desc'})).toThrow();expect(()=>queryPublishedMonths(profiles,{month:'latest-available',order:'name',roiMin:0})).toThrow()})
 it('observed result months are neither registration age nor elapsed span',()=>{const p=clone();p.months=[p.months[0],p.months.at(-1)!];expect(resultMonthCount(p)).toBe(2);expect(queryPublishedMonths([p],{month:'latest-available',order:'name',minResultMonths:3})).toEqual([])})
 it('marks only source capture month in progress',()=>{expect(selectPublishedMonth(grobler,'2026-11').currentMonth).toBe(true);expect(selectPublishedMonth(grobler,'2026-10').currentMonth).toBe(false)})
 it('rejects duplicate months and mismatched source identity/numbers',()=>{let p=clone();p.months.push(p.months[0]);expect(()=>validateMonthlyProfile(p)).toThrow();p=clone();p.months[0].profitPublished++;expect(()=>validateMonthlyProfile(p)).toThrow();p=clone();p.sourceUrl='https://www.olbg.com/tipsters/about/2';expect(()=>validateMonthlyProfile(p)).toThrow()})
 it('rejects malformed dates/ROI and invalid filters',()=>{expect(()=>publishedMonth({date:'Total',tips:'2',roi:'5%',profit:'1'})).toThrow();expect(()=>publishedMonth({date:'Oct 2026',tips:'2',roi:'5.5%',profit:'1'})).toThrow();expect(()=>queryPublishedMonths(profiles,{month:'2026-13',order:'name'})).toThrow();expect(()=>queryPublishedMonths(profiles,{month:'2026-10',order:'name',roiMin:NaN})).toThrow();expect(()=>queryPublishedMonths(profiles,{month:'latest-available',order:'name',minResultMonths:-1})).toThrow()})
})
