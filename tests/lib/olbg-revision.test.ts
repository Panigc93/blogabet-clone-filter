import { describe,it,expect } from 'vitest'
import { eligibleMonthlyRecord,type OlbgMonthlyRecord } from '@/crawler/platforms/olbg/monthly-record'
import { olbgRecordDigest } from '@/crawler/platforms/olbg/persistence-plan'
import { makeOlbgRevisionGuard } from '@/lib/olbg-revision'
const record:OlbgMonthlyRecord={version:1,profileId:1,username:'SYNTHETIC',profileUrl:'https://www.olbg.com/tipsters/about/1',capturedAt:'2026-11-17T12:00:00.000Z',sourceMonth:'2026-11',scope:'global-all-tips',source:{url:'https://www.olbg.com/tipsters/performance/month/1/__data.json',capturedAt:'2026-11-17T12:00:00.000Z',sha256:'a'.repeat(64),bytes:50,httpDate:null},months:[]}
describe('OLBG revision barrier synthetic deterministic races',()=>{
 it('rejects same-month refresh during a read and old continuation, without trusting stale snapshot data',async()=>{
  const now=new Date('2026-11-18T00:00:00Z');let state={status:'ok',records:[record],rejected:0}
  const guard=makeOlbgRevisionGuard(state,now,()=>now,async()=>state)
  expect(await guard.revisionUnchanged()).toBe(true)
  const r=structuredClone(record);r.capturedAt='2026-11-17T13:00:00.000Z';r.source.capturedAt=r.capturedAt
  state={...state,records:[r]}
  expect(await guard.revisionUnchanged()).toBe(false)
  expect(makeOlbgRevisionGuard(state,new Date('2026-11-17T12:30:00Z'),()=>now,async()=>state).changedSinceAnchor).toBe(true)
  expect(eligibleMonthlyRecord(r,now)).toBe(true);expect(olbgRecordDigest(record)).not.toBe(olbgRecordDigest(r))
 })
 it('rejects index failure, content-only corruption and month boundary during read',async()=>{
  const now=new Date('2026-11-30T23:59:59Z');const state={status:'ok',records:[record],rejected:0}
  let after={...state};let clock=now
  const guard=makeOlbgRevisionGuard(state,now,()=>clock,async()=>after)
  after={...state,status:'unavailable',records:[]};expect(await guard.revisionUnchanged()).toBe(false)
  after={...state,records:[{...record,username:'CHANGED'}]};expect(await guard.revisionUnchanged()).toBe(false)
  after=state;clock=new Date('2026-12-01');expect(await guard.revisionUnchanged()).toBe(false)
 })
})
