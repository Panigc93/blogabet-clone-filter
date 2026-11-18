import {describe,it,expect} from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCommonPublishedMonthlyPage} from '@/lib/olbg-common-list-loader'
import {loadPublishedMonthlySnapshot} from '@/lib/olbg-published-monthly-loader'
import {commonMonthlyPage,type CommonMonthlyRequest} from '@/lib/olbg-common-list-candidate'
import {unknownOlbgCard} from '@/components/olbg-card-model'
import type {TipsterCardData} from '@/components/tipster-card-model'
import real from '../fixtures/olbg/published-monthly-real.json'
import type {PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
const profiles=real as PublishedMonthlyProfile[]
const snapshot={revision:'source-v1',profiles}
// Synthetic baseline card ONLY in tests, no user-facing invented profile.
const baseline=[{key:'baseline:test',card:{...unknownOlbgCard('Baseline test','123'),platform:'blogabet',yieldPct:4} as TipsterCardData}]
const request:CommonMonthlyRequest={order:'name',monthly:{month:'latest-available'},pageSize:2}
describe('candidate common-list read integration',()=>{
 it('merges before pagination and returns every identity exactly once',()=>{
  const first=commonMonthlyPage(baseline,'base-v1',snapshot,request)
  expect(first.total).toBe(4);expect(first.rows).toHaveLength(2)
  const second=commonMonthlyPage(baseline,'base-v1',snapshot,{...request,cursor:first.nextCursor!})
  expect(new Set([...first.rows,...second.rows].map(r=>r.key)).size).toBe(4);expect(second.nextCursor).toBeNull()
 })
 it('shared yield order places monthly unknowns last and filters never pass them as zero',()=>{
  const q={...request,pageSize:50,order:'yield-desc' as const}
  expect(commonMonthlyPage(baseline,'v1',snapshot,q).rows[0].key).toBe('baseline:test')
  const filtered=commonMonthlyPage(baseline,'v1',snapshot,{...q,minCommonYield:-100})
  expect(filtered.rows.map(r=>r.key)).toEqual(['baseline:test'])
 })
 it('monthly numeric comparison explicitly selects OLBG scope and common month',()=>{
  const result=commonMonthlyPage(baseline,'v1',snapshot,{...request,pageSize:50,order:'olbg-roi-desc',monthly:{month:'2026-10',roiMin:-17}})
  expect(result.rows).toHaveLength(1);expect(result.rows[0].card.name).toBe('Grobler');expect(result.scopeNote).toContain('solo del mes indicado')
  expect(()=>commonMonthlyPage(baseline,'v1',snapshot,{...request,order:'olbg-roi-desc'})).toThrow()
 })
 it('rejects stale revision or changed filters across pages, not silently duplicating results',()=>{
  const page=commonMonthlyPage(baseline,'v1',snapshot,request)
  expect(()=>commonMonthlyPage(baseline,'v2',snapshot,{...request,cursor:page.nextCursor!})).toThrow(/restart/)
  expect(()=>commonMonthlyPage(baseline,'v1',{...snapshot,revision:'source-v2'},{...request,cursor:page.nextCursor!})).toThrow(/restart/)
  expect(()=>commonMonthlyPage(baseline,'v1',snapshot,{...request,search:'Grobler',cursor:page.nextCursor!})).toThrow(/restart/)
 })
 it('has JSON-stable identical SSR/API result and month scope',()=>{
  const first=commonMonthlyPage(baseline,'v1',snapshot,request)
  expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  expect(commonMonthlyPage(baseline,'v1',snapshot,request)).toEqual(first)
 })
 it('rejects unbounded or invalid pagination',()=>{
  expect(()=>commonMonthlyPage(baseline,'v1',snapshot,{...request,pageSize:0})).toThrow()
  expect(()=>commonMonthlyPage(baseline,'v1',snapshot,{...request,cursor:'{}'})).toThrow()
 })
 it('keeps estimates labelled and uses their central values for common yield thresholds',()=>{
  const q={...request,estimate:true,order:'yield-desc' as const,pageSize:50}
  const all=commonMonthlyPage(baseline,'v1',snapshot,q)
  expect(all.rows.filter(r=>r.card.platform==='olbg').every(r=>r.card.olbgEstimates&&r.card.olbgMonthly)).toBe(true)
  for(const minCommonYield of [-100,0,10]){
   const filtered=commonMonthlyPage(baseline,'v1',snapshot,{...q,minCommonYield})
   expect(filtered.rows.every(r=>r.card.yieldPct!==null&&r.card.yieldPct>=minCommonYield)).toBe(true)
   expect(filtered.rows.map(r=>r.key)).toEqual(all.rows.filter(r=>r.card.yieldPct!==null&&r.card.yieldPct>=minCommonYield).map(r=>r.key))
  }
 })
 it('uses accumulated retained picks, not one selected monthly count, in estimated mode',()=>{
  const q={...request,estimate:true,order:'yield-desc' as const,pageSize:50,minCommonPicks:300}
  expect(commonMonthlyPage([], 'v1',snapshot,q).rows.every(r=>r.card.olbgEstimates!.global.picks>=300)).toBe(true)
 })
 it('pins estimated versus published-only semantics in pagination identity',()=>{
  const first=commonMonthlyPage(baseline,'v1',snapshot,request)
  expect(()=>commonMonthlyPage(baseline,'v1',snapshot,{...request,estimate:true,cursor:first.nextCursor!})).toThrow(/restart/)
 })
 it('loads only pinned read-only source snapshots, rejects tampering and duplicates',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'olbg-read-'))
  try{
   const f=path.join(dir,'snapshot.json');const bytes=JSON.stringify({version:1,basis:'source-published-month-global-all-tips',profiles})
   await fs.writeFile(f,bytes);const digest=createHash('sha256').update(bytes).digest('hex')
   expect((await loadPublishedMonthlySnapshot(f,digest)).profiles).toHaveLength(3)
   const service={monthlyFile:f,monthlySha256:digest,request,readBaseline:async()=>({rows:[],revision:'base-v1',complete:true as const,readAt:'2026-11-18T12:00:00Z'}),baselineUnchanged:async()=>true}
   expect((await loadCommonPublishedMonthlyPage(service)).total).toBe(3)
   let redundantRead=false
   expect((await loadCommonPublishedMonthlyPage({...service,atomicStatementSnapshot:true,sourceContextUnchanged:async()=>true,baselineUnchanged:async()=>{redundantRead=true;return false}})).total).toBe(3)
   expect(redundantRead).toBe(false)
   await expect(loadCommonPublishedMonthlyPage({...service,atomicStatementSnapshot:true,sourceContextUnchanged:async()=>false})).rejects.toThrow(/Source context changed/)
   await expect(loadCommonPublishedMonthlyPage({...service,atomicStatementSnapshot:true})).rejects.toThrow(/Source context changed/)
   await expect(loadCommonPublishedMonthlyPage({...service,baselineUnchanged:async()=>false})).rejects.toThrow(/changed during read/)
   await expect(loadPublishedMonthlySnapshot(f,'0'.repeat(64))).rejects.toThrow(/revision mismatch/)
   const duplicate=JSON.stringify({version:1,basis:'source-published-month-global-all-tips',profiles:[...profiles,profiles[0]]})
   await fs.writeFile(f,duplicate);await expect(loadPublishedMonthlySnapshot(f,createHash('sha256').update(duplicate).digest('hex'))).rejects.toThrow(/Duplicate/)
  }finally{await fs.rm(dir,{recursive:true,force:true})}
 })
})
