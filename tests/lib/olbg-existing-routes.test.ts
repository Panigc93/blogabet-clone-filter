import {describe,it,expect} from 'vitest'
import {monthlyExistingRequest,monthlyExistingRoutesEnabled} from '@/lib/olbg-existing-routes'
import {commonMonthlyPage} from '@/lib/olbg-common-list-candidate'
import {unknownOlbgCard} from '@/components/olbg-card-model'
import real from '../fixtures/olbg/published-monthly-real.json'
import type {PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
const source={revision:'pinned',profiles:real as PublishedMonthlyProfile[]}
describe('existing routes monthly integration',()=>{
 it('canonicalizes SSR/API filters despite object property order',()=>{
  const ssr=monthlyExistingRequest(new URLSearchParams(),{search:'abc',tipo:'all',platform:'olbg',activityUnknown:false},'yield')
  const api=monthlyExistingRequest(new URLSearchParams(),{platform:'olbg',tipo:'all',search:'abc',activityUnknown:false,minYield:undefined},'yield')
  expect(ssr.baselineFilterKey).toBe(api.baselineFilterKey)
 })
 it('pins every standard filter, monthly filter and standard sort',()=>{
  const q=monthlyExistingRequest(new URLSearchParams('olbgMonth=2026-10&olbgRoiMin=2&olbgResultMonths=6'),{maxYield:10,activityMonths:3},'followers')
  expect(q).toMatchObject({order:'followers',maxCommonYield:10,excludeMonthly:false,activityMonths:3,monthly:{month:'2026-10',roiMin:2,minResultMonths:6}})
  expect(q.baselineFilterKey).toContain('activityMonths')
 })
 it('preserves complete SQL baseline order and slug search without reinterpreting card display',()=>{
  const b=[{key:'bb:2',baselineRank:0,card:{...unknownOlbgCard('not-the-slug','2'),platform:'blogabet' as const,yieldPct:null}},{key:'bb:1',baselineRank:1,card:{...unknownOlbgCard('another','1'),platform:'blogabet' as const,yieldPct:10}}]
  const q=monthlyExistingRequest(new URLSearchParams(),{search:'matched-slug',minYield:0,platform:'blogabet'},'yield')
  expect(commonMonthlyPage(b,'base',source,q).rows.map(r=>r.key)).toEqual(['bb:2','bb:1'])
 })
 it('excludes monthly data from unsupported common lifetime numeric/type filters',()=>{
  for(const f of [{tipo:'paid' as const},{platform:'tipstrr' as const}])expect(monthlyExistingRequest(new URLSearchParams(),f,'picks').excludeMonthly).toBe(true)
  // Activity is supported monthly evidence (picks per month), not an exclusion.
  expect(monthlyExistingRequest(new URLSearchParams(),{activityMonths:3},'picks')).toMatchObject({excludeMonthly:false,activityMonths:3})
  expect(monthlyExistingRequest(new URLSearchParams(),{activityUnknown:true},'picks')).toMatchObject({excludeMonthly:false,activityUnknown:true})
  expect(monthlyExistingRequest(new URLSearchParams(),{minPicks:100},'picks')).toMatchObject({estimate:true,minCommonPicks:100,excludeMonthly:false})
 })
 it('is disabled by default in a test runtime',()=>{expect(monthlyExistingRoutesEnabled()).toBe(false)})
})
