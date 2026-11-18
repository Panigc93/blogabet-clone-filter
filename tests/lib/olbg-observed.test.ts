import {describe,it,expect} from 'vitest'
import {validOlbgObserved,observedMissing} from '@/lib/olbg-observed'
import {compactOlbg} from '@/crawler/platforms/olbg/compact'
import {validOlbgRegistration,parseOlbgRegistration} from '@/crawler/platforms/olbg/registration'
import registrations from '@/data/olbg/pilot-registrations.json'
import {fromOlbgReadRow} from '@/components/olbg-card-model'
const capturedAt='2026-11-17T12:00:00.000Z'
const record={version:1 as const,profileId:565069,username:'ewanvrs',profileUrl:'https://www.olbg.com/tipsters/about/565069',capturedAt,sourceMonth:'2026-11',scope:'global-all-tips' as const,source:{url:'https://www.olbg.com/tipsters/performance/month/565069/__data.json',capturedAt,httpDate:null,sha256:'a'.repeat(64),bytes:100},months:[]}
const e=compactOlbg(record,'a'.repeat(64))
describe('OLBG observed sample, not all-time',()=>{
 it('validates bounded month labels, totals, uniqueness and zero denominator',()=>{
  const good={covered:['2026-09','2026-11'],tips:20,lsp:1.12}
  expect(validOlbgObserved(good,e)).toBe(true)
  expect(observedMissing(good.covered)).toEqual(['2026-10'])
  for(const bad of [{...good,tips:-1},{...good,lsp:Infinity},{...good,lsp:1.123},{...good,covered:['2026-11','2026-09']},{...good,covered:['2026-11','2026-11']},{...good,covered:['2026-12']},{...good,covered:[]},{...good,raw:'private'}])expect(validOlbgObserved(bad,e)).toBe(false)
 })
 it('retains registration independently, rejects stale observed stats, avoids infinity for zero tips',()=>{
  const row={name:'ewanvrs',slug:'565069',capturedAt,olbgEvidence:e,olbgJoinedAt:'2020-12-14',olbgObserved:{covered:['2026-11'],tips:0,lsp:0}}
  const c=fromOlbgReadRow(row,new Date('2026-11-18T00:00:00Z'))!
  expect(c.sinceYear).toBe(2020);expect(c.picks).toBe(0);expect(c.profitDisplay).toBe('+0.00 u');expect(c.yieldPct).toBeNull()
  const stale=fromOlbgReadRow(row,new Date('2026-12-01T00:00:00Z'))!
  expect(stale.sinceYear).toBe(2020);expect(stale.picks).toBeNull();expect(stale.profitDisplay).toBeNull();expect(stale.yieldPct).toBeNull()
 })
 it('validates registration facts without guessing from earliest monthly data',()=>{
  expect(registrations.every(validOlbgRegistration)).toBe(true)
  expect(registrations.map(r=>[r.profileId,r.joinedAt])).toEqual([[565069,'2020-12-14'],[342919,'2014-10-24'],[535122,'2020-04-16']])
  expect(validOlbgRegistration({...registrations[0],profileId:1})).toBe(false)
  expect(validOlbgRegistration({...registrations[0],joinedAt:'2026-02-31'})).toBe(false)
  const raw=JSON.stringify({nodes:[{data:[{effectiveTipsterId:1,tipsterUsername:2,joinDate:3},565069,'ewanvrs','2020-12-14']}]})
  const r=parseOlbgRegistration(raw,registrations[0].source.url,capturedAt,null,565069)
  expect(r.joinedAt).toBe('2020-12-14');expect(()=>parseOlbgRegistration(raw,registrations[0].source.url,capturedAt,null,535122)).toThrow()
 })
})
