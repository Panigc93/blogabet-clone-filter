import { describe,it,expect } from 'vitest'
import { olbgLocalReviewEnabled } from '@/lib/tipster-read-context'
import { readFileSync } from 'node:fs'
describe('OLBG review activation boundary',()=>{
 it('is disabled by default and cannot enable a Neon-backed deployment',()=>{
  expect(olbgLocalReviewEnabled({})).toBe(false)
  expect(olbgLocalReviewEnabled({OLBG_LOCAL_REVIEW:'1'})).toBe(false)
  expect(olbgLocalReviewEnabled({OLBG_LOCAL_REVIEW:'1',USE_PGLITE:'0'})).toBe(false)
  expect(olbgLocalReviewEnabled({OLBG_LOCAL_REVIEW:'1',USE_PGLITE:'1'})).toBe(true)
 })
 it('SSR, count and API compose the same OLBG/B2I read context and preserve continuation handling',()=>{
  for(const f of ['app/page.tsx','app/api/tipsters/route.ts']) {
   const s=readFileSync(f,'utf8')
   expect(s).toContain('await tipsterReadContext(await loadDatabasePeriodAudits(readAt), readAt)')
   expect(s).toContain('periods.filters(filters)')
   expect(s).toContain('periods.base.source, periods.base.joinOn')
   expect(s).toContain('periods.olbg.source, periods.olbg.joinOn')
  }
  const api=readFileSync('app/api/tipsters/route.ts','utf8')
  expect(api).toContain('continuationAnchor(p.get(\'periodAnchor\'), new Date())')
  expect(api).toContain("{ status: 409 }")
 })
})
