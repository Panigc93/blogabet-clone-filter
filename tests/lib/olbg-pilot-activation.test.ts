import { describe,it,expect } from 'vitest'
import { olbgActivation,OLBG_PILOT_IDS } from '@/lib/olbg-activation'
import { readFileSync } from 'node:fs'
import { olbgVisibilityFilter } from '@/lib/tipster-read-context'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters } from '@/db/schema'
describe('approved three-profile server rollout',()=>{
 it('defaults off and local flag alone never activates a remote database',()=>{
  expect(olbgActivation({})).toBe('disabled')
  expect(olbgActivation({OLBG_LOCAL_REVIEW:'1'})).toBe('disabled')
  expect(olbgActivation({OLBG_PILOT_THREE:'true'})).toBe('disabled')
  expect(olbgActivation({OLBG_PILOT_THREE:'1'})).toBe('pilot-three')
  expect(olbgActivation({USE_PGLITE:'1',OLBG_PILOT_THREE:'1'})).toBe('disabled')
  expect(olbgActivation({USE_PGLITE:'1',OLBG_LOCAL_REVIEW:'1'})).toBe('local')
 })
 it('fixes the approved identity set and applies it to shared SSR/API filters before pagination',()=>{
  expect([...OLBG_PILOT_IDS].sort()).toEqual(['342919','535122','565069'])
  const shared=readFileSync('lib/tipster-read-context.ts','utf8')
  expect(shared).toContain("activation==='pilot-three'")
  expect(shared).toContain('olbgVisibilityFilter(activation)')
  for(const f of ['app/page.tsx','app/api/tipsters/route.ts'])expect(readFileSync(f,'utf8')).toContain('periods.filters(filters)')
 })
 it('evaluates the same allowlist in SQL, keeping other platforms including a colliding slug',async()=>{
  const pg=new PGlite();const db=drizzle(pg)
  try{
   await pg.exec('CREATE TABLE tipsters(platform text,slug text)')
   for(const [platform,slug] of [['olbg','565069'],['olbg','342919'],['olbg','535122'],['olbg','999999'],['blogabet','999999'],['bet2invest','565069']])await pg.query('INSERT INTO tipsters VALUES($1,$2)',[platform,slug])
   const read=async(mode:ReturnType<typeof olbgActivation>)=>db.select({platform:tipsters.platform,slug:tipsters.slug}).from(tipsters).where(olbgVisibilityFilter(mode))
   const pilot=await read('pilot-three');expect(pilot).toHaveLength(5);expect(pilot.filter(x=>x.platform==='olbg').map(x=>x.slug).sort()).toEqual([...OLBG_PILOT_IDS].sort())
   expect(await read('disabled')).toHaveLength(2)
   expect(await read('local')).toHaveLength(6)
  }finally{await pg.close()}
 })
})
