import { describe,it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { protipsterRowToInsert } from '@/crawler/platforms/protipster/to-db'
import type { ProtipsterCaptureRow } from '@/crawler/platforms/protipster/types'
const rows:ProtipsterCaptureRow[]=JSON.parse(readFileSync(join(__dirname,'fixtures/protipster/validation-edge-cases-2026-11-20.json'),'utf8'))
const map=(slug:string)=>{const row=rows.find(r=>r.slug===slug)!;return protipsterRowToInsert(row,{id:0,idSource:'internal-transactional',slug})}
describe('real full-capture regression cases',()=>{
 it('current-month-only kjell1 has NULL12m and keeps native rolling3m6m',()=>{
  const r=rows.find(r=>r.slug==='kjell1')!,m=map('kjell1');expect(m.ok).toBe(true);if(!m.ok)return
  expect(r.chartDefault!.activeMonths).toEqual(['2026-11']);expect(Object.keys(r.months)).toHaveLength(0)
  expect(m.insert.yield12m).toBeNull();expect(m.insert.yield3m).toBe((r.period3m!.profit!/r.period3m!.stakes!*100).toFixed(2));expect(m.insert.yield6m).toBe((r.chartDefault!.stats.profit!/r.chartDefault!.stats.stakes!*100).toFixed(2))
 })
 it('accepts integer-rounded155 for exact154.75, but not when source says155.0',()=>{const m=map('jakubey');expect(m.ok).toBe(true);const r=structuredClone(rows.find(r=>r.slug==='jakubey')!);r.months['2026-09'].yieldResolution=0.1;const held=protipsterRowToInsert(r,{id:0,idSource:'internal-transactional',slug:r.slug});expect(held.ok).toBe(false)})
 for(const slug of ['ingolueders77','muskoinaffey11'])it(`uses explicit native annual graph for ${slug}, preserving coherent total amounts`,()=>{const m=map(slug),r=rows.find(r=>r.slug===slug)!;expect(m.ok).toBe(true);if(m.ok)expect(m.insert.yield).toBe((r.periodAlltime!.profit!/r.periodAlltime!.stakes!*100).toFixed(2))})
 it('holds contradictory annual totals rather than accepting unchecked override',()=>{const r=structuredClone(rows.find(r=>r.slug==='muskoinaffey11')!);r.periodAlltime!.picks++;expect(protipsterRowToInsert(r,{id:0,idSource:'internal-transactional',slug:r.slug}).ok).toBe(false)})
 it('holds native year override without proven lifetime coverage',()=>{const r=structuredClone(rows.find(r=>r.slug==='muskoinaffey11')!);r.overview!.userJoinDate='2025-11-02 07:47:07';expect(protipsterRowToInsert(r,{id:0,idSource:'internal-transactional',slug:r.slug}).ok).toBe(false)})
 it('still holds unresolved source disagreement without annual evidence',()=>{const r=structuredClone(rows.find(r=>r.slug==='muskoinaffey11')!);delete r.periodAlltime;expect(protipsterRowToInsert(r,{id:0,idSource:'internal-transactional',slug:r.slug}).ok).toBe(false)})
})
