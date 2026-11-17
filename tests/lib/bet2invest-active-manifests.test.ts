import { describe,it,expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { activeManifestPredicate } from '@/lib/bet2invest-active-manifests'
describe('active manifest bounded reader',()=>{
 it('keeps current receipts across successive refreshes without loading historical or empty replay records',async()=>{
  const pg=new PGlite()
  try{
   await pg.exec('CREATE TABLE tipsters(platform text,slug text,captured_at timestamptz);CREATE TABLE import_validation_log(id int,reason text)')
   await pg.query("INSERT INTO tipsters VALUES ('bet2invest','one','2026-11-17T12:00:00Z')")
   const put=async(id:number,at:string,rows=true)=>pg.query('INSERT INTO import_validation_log VALUES($1,$2)',[id,JSON.stringify({manifest:{rows:rows?[{slug:'one',capturedAt:at}]:[]}})])
   await put(1,'2026-11-17T12:00:00Z')
   const read=async()=>{
    const q=new PgDialect().sqlToQuery(sql`SELECT id FROM import_validation_log WHERE ${activeManifestPredicate()}`)
    return (await pg.query<{id:number}>(q.sql,q.params)).rows.map(r=>r.id)
   }
   expect(await read()).toEqual([1])
   await pg.query("UPDATE tipsters SET captured_at='2026-11-17T13:00:00Z'")
   await put(2,'2026-11-17T13:00:00Z')
   for(let i=3;i<1010;i++)await put(i,'2026-11-17T13:00:00Z',false)
   expect(await read()).toEqual([2])
   expect((await pg.query<{n:number}>('SELECT count(*)::int n FROM import_validation_log')).rows[0].n).toBe(1009)
  }finally{await pg.close()}
 })
})
