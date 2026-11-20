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
 for(const slug of ['ingolueders77','muskoinaffey11'])it(`holds ${slug} with conflicting alltime displayed yield rather than relaxing checks`,()=>{const m=map(slug);expect(m.ok).toBe(false);if(!m.ok){expect(m.klass).toBe('cuarentena[capture-inconsistency]');expect(m.reason).toContain('alltime')}})
})
