import {describe,it,expect} from 'vitest'
import {monthlyExistingRequest} from '@/lib/olbg-existing-routes'
import {commonMonthlyPage} from '@/lib/olbg-common-list-candidate'
import {fromEstimatedOlbgProfile,fromPublishedOlbgMonth} from '@/components/olbg-monthly-card-model'
import {OLBG_PRODUCT_ACCESS,olbgProductMatchesType} from '@/lib/olbg-product-access'
import type {PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
import real from '../fixtures/olbg/published-monthly-real.json'
const first=real[0] as PublishedMonthlyProfile
const profiles=Array.from({length:123},(_,i)=>({...first,id:100000+i,name:'OLBG source '+i,sourceUrl:`https://www.olbg.com/tipsters/about/${100000+i}`}))
const snapshot={revision:'product-revision',profiles}
describe('scoped OLBG product Free policy',()=>{
 it('is affirmative on-platform service policy, independent of global access flag',()=>{
  expect(OLBG_PRODUCT_ACCESS.state).toBe('free')
  for(const tipo of [undefined,'all','free'] as const)expect(olbgProductMatchesType(tipo)).toBe(true)
  expect(olbgProductMatchesType('paid')).toBe(false)
  for(const mapper of [fromPublishedOlbgMonth,fromEstimatedOlbgProfile])expect(mapper(first,first.months[0].month).isPaid).toBe(false)
 })
 it('Free and Todos share cards/count/order; Paid has none; pagination covers123 once',()=>{
  const all=monthlyExistingRequest(new URLSearchParams(),{platform:'olbg',tipo:'all'},'yield')
  const free=monthlyExistingRequest(new URLSearchParams(),{platform:'olbg',tipo:'free'},'yield')
  const paid=monthlyExistingRequest(new URLSearchParams(),{platform:'olbg',tipo:'paid'},'yield')
  expect(all.excludeMonthly).toBe(false);expect(free.excludeMonthly).toBe(false);expect(paid.excludeMonthly).toBe(true)
  expect(commonMonthlyPage([],'base',snapshot,paid).total).toBe(0)
  let cursor:string|undefined;const keys:string[]=[];const sizes:number[]=[]
  do{
   const page=commonMonthlyPage([],'base',snapshot,{...free,cursor})
   expect(page.total).toBe(123);expect(page.rows.every(r=>r.card.isPaid===false)).toBe(true)
   sizes.push(page.rows.length);keys.push(...page.rows.map(r=>r.key));cursor=page.nextCursor??undefined
  }while(cursor)
  expect(sizes).toEqual([50,50,23]);expect(new Set(keys).size).toBe(123)
  expect(commonMonthlyPage([],'base',snapshot,free).rows).toEqual(commonMonthlyPage([],'base',snapshot,all).rows)
 })
 it('pins Free/All/Paid query identity and preserves other platform/activity exclusions',()=>{
  const free=monthlyExistingRequest(new URLSearchParams(),{tipo:'free'},'yield')
  const page=commonMonthlyPage([],'base',snapshot,free)
  for(const tipo of ['all','paid'] as const){
   const request=monthlyExistingRequest(new URLSearchParams(),{tipo},'yield')
   expect(()=>commonMonthlyPage([],'base',snapshot,{...request,cursor:page.nextCursor!})).toThrow(/restart/)
  }
  for(const filters of [{tipo:'free' as const,platform:'blogabet' as const},{tipo:'free' as const,activityMonths:3}])expect(monthlyExistingRequest(new URLSearchParams(),filters,'yield').excludeMonthly).toBe(true)
  const published=monthlyExistingRequest(new URLSearchParams('olbgView=monthly'),{tipo:'free'},'yield')
  expect(published.excludeMonthly).toBe(false)
  expect(commonMonthlyPage([],'base',snapshot,published).total).toBe(123)
 })
})
