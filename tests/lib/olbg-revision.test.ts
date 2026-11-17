import {describe,it,expect} from 'vitest'
import {compactRevisionGuard,type OlbgRevision} from '@/lib/olbg-revision'
describe('compact revision barrier, no catalog scan',()=>{
 it('invalidates committed concurrent refresh and old continuation',async()=>{
  const now=new Date('2026-11-18T00:00:00Z');let state:OlbgRevision={status:'ok',revision:'1',changedAt:'2026-11-17T12:00:00.000Z'}
  const guard=compactRevisionGuard(state,now,()=>now,async()=>state)
  expect(await guard.revisionUnchanged()).toBe(true)
  state={...state,revision:'2'};expect(await guard.revisionUnchanged()).toBe(false)
  expect(compactRevisionGuard(state,new Date('2026-11-17T10:00:00Z'),()=>now,async()=>state).changedSinceAnchor).toBe(true)
 })
 it('fails closed on unavailable revision and month rollover',async()=>{
  const now=new Date('2026-11-30T23:59:59Z');let state:OlbgRevision={status:'ok',revision:'1',changedAt:'2026-11-17T12:00:00.000Z'};let clock=now
  const guard=compactRevisionGuard(state,now,()=>clock,async()=>state)
  state={status:'unavailable',revision:'',changedAt:''};expect(await guard.revisionUnchanged()).toBe(false)
  clock=new Date('2026-12-01');expect(await guard.revisionUnchanged()).toBe(false)
 })
})
