import {describe,it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import {eq} from 'drizzle-orm'
import {olbgPublishedSnapshots} from '@/db/schema'
import {importProductSnapshot,readStoredSnapshot,PRODUCT_SNAPSHOT_SCHEMA,type SnapshotSQL} from '@/lib/olbg-product-storage'
import {prepareProductSnapshot,decodeProductSnapshot} from '@/lib/olbg-product-snapshot'
import {commonMonthlyPage} from '@/lib/olbg-common-list-candidate'
import type {PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
import real from '../fixtures/olbg/published-monthly-real.json'
const profiles=real as PublishedMonthlyProfile[]
const {payload,manifest}=prepareProductSnapshot(profiles)
describe('isolated pinned OLBG product storage',()=>{
 it('projects an explicit allowlist, excluding raw metadata and preserving every product field',()=>{
  const enriched=profiles.map(p=>({...p,rawHtml:'private',privatePath:'/secret',inputSha256:{secret:'x'}}))
  expect(prepareProductSnapshot(enriched)).toEqual({payload,manifest})
  expect(payload).not.toContain('private');expect(payload).not.toContain('inputSha256')
  expect(decodeProductSnapshot(payload,manifest).profiles).toEqual(profiles.map(p=>({...p,avatarUrl:p.avatarUrl??null})))
 })
 it('fails on digest, count and contract mismatches',()=>{
  expect(()=>decodeProductSnapshot(payload+' ',manifest)).toThrow(/digest/)
  expect(()=>decodeProductSnapshot(payload,{...manifest,profileCount:999})).toThrow(/count/)
  expect(()=>decodeProductSnapshot(payload,{...manifest,version:2 as 1})).toThrow(/manifest/)
 })
 it('imports twice idempotently, preserves baseline rows and uses real schema/Drizzle read shape',async()=>{
  const pg=new PGlite();const sql=pg as SnapshotSQL
  try{
   await pg.exec("CREATE TABLE tipsters(id integer PRIMARY KEY,name text);INSERT INTO tipsters VALUES(1,'baseline')")
   const before=await pg.query('SELECT * FROM tipsters')
   const first=await pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,payload,manifest))
   expect(first.inserted).toBe(true)
   expect((await pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,payload,manifest))).inserted).toBe(false)
   expect(await pg.query('SELECT * FROM tipsters')).toEqual(before)
   const loaded=await readStoredSnapshot(sql,manifest)
   const db=drizzle(pg)
   const rows=await db.select().from(olbgPublishedSnapshots).where(eq(olbgPublishedSnapshots.revision,manifest.revision))
   expect(rows).toHaveLength(1);expect(rows[0].payload).toBe(payload)
   const request={estimate:true,order:'yield-desc' as const,monthly:{month:'latest-available'},pageSize:2}
   const fromFile=commonMonthlyPage([],'baseline',{revision:manifest.revision,profiles:JSON.parse(payload).profiles},request)
   expect(commonMonthlyPage([],'baseline',loaded,request)).toEqual(fromFile)
   expect(fromFile.nextCursor).not.toBeNull()
   const changed=prepareProductSnapshot(profiles.map((p,i)=>i? p:{...p,name:p.name+' updated'}))
   await pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,changed.payload,changed.manifest))
   expect(()=>commonMonthlyPage([],'baseline',{revision:changed.manifest.revision,profiles:JSON.parse(changed.payload).profiles},{...request,cursor:fromFile.nextCursor!})).toThrow(/restart/)
   // Rollback is an old manifest selection, never deleting or rewriting data.
   expect(await readStoredSnapshot(sql,manifest)).toEqual(loaded)
   expect(Number((await pg.query<{n:string}>('SELECT count(*) AS n FROM olbg_published_snapshots')).rows[0].n)).toBe(2)
  }finally{await pg.close()}
 })
 it('fails closed for missing revision or corrupt storage and rolls back failed insert',async()=>{
  const pg=new PGlite();const sql=pg as SnapshotSQL
  try{
   await pg.exec(PRODUCT_SNAPSHOT_SCHEMA)
   await expect(readStoredSnapshot(sql,manifest)).rejects.toThrow(/Missing/)
   await pg.query('INSERT INTO olbg_published_snapshots VALUES($1,1,$2,$3,$4,now())',[manifest.revision,manifest.profileCount,manifest.monthCount,payload+' '])
   await expect(pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,payload,manifest))).rejects.toThrow(/digest/)
   await expect(readStoredSnapshot(sql,manifest)).rejects.toThrow(/digest/)
   const fresh=prepareProductSnapshot(profiles.slice(0,1))
   await expect(pg.transaction(async tx=>{await importProductSnapshot(tx as SnapshotSQL,fresh.payload,fresh.manifest);throw Error('rollback')})).rejects.toThrow('rollback')
   await expect(readStoredSnapshot(sql,fresh.manifest)).rejects.toThrow(/Missing/)
  }finally{await pg.close()}
 })
})
