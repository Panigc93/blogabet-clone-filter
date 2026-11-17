import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { and, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tipsters } from '@/db/schema'
import { parseOlbgPerformance } from '@/crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '@/crawler/platforms/olbg/prepare'
import { monthlyRecord, validMonthlyRecord, recordSummaries } from '@/crawler/platforms/olbg/monthly-record'
import { readOlbgActiveRecords } from '@/crawler/platforms/olbg/active-read'
import { OLBG_LOCAL_SCHEMA, planOlbgPersistence, olbgRecordDigest } from '@/crawler/platforms/olbg/persistence-plan'
import { periodReadContext } from '@/lib/bet2invest-period-read'
import { windowBounds, type PeriodAudit } from '@/lib/bet2invest-period-contract'
import { olbgReadContext } from '@/lib/olbg-read-context'
import { fromDbTipster } from '@/components/tipster-card-model'
import { fromOlbgReadRow } from '@/components/olbg-card-model'
const now = new Date('2026-11-18T12:00:00Z')
function record(id: number) {
  const load = (mode: string) => {
    const f = JSON.parse(readFileSync(join(__dirname,`../fixtures/olbg/profile-${id}-${mode}.json`),'utf8'))
    return parseOlbgPerformance(f.node, f.originalReceipt, id, '2026-11')
  }
  return monthlyRecord(prepareOlbgProfile(load('month'),load('table-1'),load('table-2')))
}
const records = [record(565069),record(342919),record(535122)]
const pg = new PGlite(); const db = drizzle(pg)
const b2iAt = '2026-11-17T12:00:00.000Z'
const b2i: PeriodAudit = { slug:'b2i', capturedAt:b2iAt, windows: Object.fromEntries(([3,6,12] as const).map(n => [n,{...windowBounds(now,n),value:'10.00',months:1,bets:10,caveats:[],reason:null}])) as unknown as PeriodAudit['windows'] }
beforeAll(async()=>{
 for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql']) {
  for(const q of readFileSync(join(__dirname,'../../drizzle',f),'utf8').split('--> statement-breakpoint')) if(q.trim()) await pg.exec(q)
 }
 await pg.exec(OLBG_LOCAL_SCHEMA)
 await db.insert(tipsters).values([
  {id:1,platform:'blogabet',slug:'bb',name:'bb',yield:'15',yield6m:'50',picks:100},
  {id:2,platform:'bet2invest',slug:'b2i',name:'b2i',capturedAt:new Date(b2iAt),yield:'20',yield6m:'10',yield3m:'10',yield12m:'10',picks:80},
  ...records.map((r,i)=>({id:i+3,platform:'olbg',slug:String(r.profileId),name:r.username,capturedAt:new Date(r.capturedAt),picks:0,yield:'999',yield6m:'999',profit:'999',followers:999})),
  {id:6,platform:'olbg',slug:'1',name:'without-evidence',picks:0,yield:'999',yield6m:'999'},
 ])
})
afterAll(()=>pg.close())
const query = (date=now, source=records) => {
 const base = periodReadContext([b2i],date);const c=olbgReadContext(base,source,date)
 const select=()=>db.select(c.projection).from(tipsters).leftJoin(base.source,base.joinOn).leftJoin(c.source,c.joinOn)
 return {c,select}
}
describe('OLBG reversible local persistence/read preparation',()=>{
 it('validates source identity, numeric months and immutable record, keeps source ROI separate',()=>{
  const r=records[0];expect(validMonthlyRecord(r)).toBe(true)
  expect(recordSummaries(r)[1].derivedLevelStakesYieldPct).toBeCloseTo(33.037397)
  expect(r.months.find(m=>m.month==='2026-05')!.roiPct).toBe(40)
  for(const bad of [{...r,profileId:1},{...r,scope:'sport'}, {...r,months:[...r.months,r.months[0]]},{...r,secret:'unexpected'}]) expect(validMonthlyRecord(bad)).toBe(false)
  expect(()=>planOlbgPersistence(r,{catalogSurrogateId:-1,activeCapturedAt:null,sameSnapshot:null})).toThrow('surrogate')
  expect(()=>planOlbgPersistence(r,{catalogSurrogateId:3,activeCapturedAt:r.capturedAt,sameSnapshot:{...r,username:'changed'}})).toThrow('conflict')
  expect(planOlbgPersistence(r,{catalogSurrogateId:3,activeCapturedAt:r.capturedAt,sameSnapshot:r}).action).toBe('no-op')
  expect(planOlbgPersistence(r,{catalogSurrogateId:3,activeCapturedAt:now.toISOString(),sameSnapshot:null}).action).toBe('skip-older')
 })
 it('proposes immutable history + exact active pointer in local disposable SQL only',async()=>{
  for(let i=0;i<records.length;i++) {
   const r = records[i]
   const plan=planOlbgPersistence(r,{catalogSurrogateId:i+3,activeCapturedAt:null,sameSnapshot:null})
   expect(plan.action).toBe('proposed-transaction')
   await pg.transaction(async tx=>{for(const q of plan.statements) await tx.query(q.text,q.params)})
  }
  expect((await pg.query('SELECT * FROM olbg_monthly_active')).rows).toHaveLength(3)
  const active = await readOlbgActiveRecords(pg,now)
  expect(active.status).toBe('ok');expect(active.records).toHaveLength(3)
  expect((await readOlbgActiveRecords(pg,new Date('2026-12-01'))).records).toHaveLength(0)
  expect((await readOlbgActiveRecords({ query:async()=>{throw Error('offline')} },now)).status).toBe('unavailable')
  const persisted=(await pg.query<{record:unknown}>('SELECT record FROM olbg_monthly_snapshots WHERE profile_id=565069')).rows[0].record
  expect(validMonthlyRecord(persisted)).toBe(true)
  expect(planOlbgPersistence(records[0],{catalogSurrogateId:3,activeCapturedAt:records[0].capturedAt,sameSnapshot:persisted as typeof records[number]}).action).toBe('no-op')
  await expect(pg.transaction(async tx=>{await tx.query('DELETE FROM olbg_monthly_active');throw Error('rollback')})).rejects.toThrow('rollback')
  expect((await pg.query('SELECT * FROM olbg_monthly_active')).rows).toHaveLength(3)
  await pg.query("UPDATE olbg_monthly_snapshots SET record_sha256=$1 WHERE profile_id=565069",['0'.repeat(64)])
  const corrupt=await readOlbgActiveRecords(pg,now)
  expect(corrupt.status).toBe('partial-invalid');expect(corrupt.rejected).toBe(1);expect(corrupt.records).toHaveLength(2)
  await pg.query("UPDATE olbg_monthly_snapshots SET record_sha256=$1 WHERE profile_id=565069",[olbgRecordDigest(records[0])])
 })
 it('masks false all-time scalars and ranks complete derived periods before LIMIT, preserving B2I',async()=>{
  const {c,select}=query(); const rows=await select().orderBy(...c.order('yield6m'))
  expect(rows.map(r=>r.slug)).toEqual(['bb','565069','b2i','535122','1','342919'])
  expect(rows.find(r=>r.slug==='b2i')!.yield6m).toBe('10.00')
  expect(rows.filter(r=>r.platform==='olbg').every(r=>r.yield===null&&r.picks===null&&r.profit===null&&r.followers===null)).toBe(true)
  expect(rows.filter(r=>r.platform==='olbg').every(r=>r.profitUnit==='olbg-level-stakes-units')).toBe(true)
  const first=await select().orderBy(...c.order('yield6m')).limit(2)
  const second=await select().orderBy(...c.order('yield6m')).limit(2).offset(2)
  expect([...first,...second].map(r=>r.slug)).toEqual(rows.slice(0,4).map(r=>r.slug))
  const card=fromOlbgReadRow(rows.find(r=>r.slug==='565069')!,now)!
  expect(card.yield6m.valuePct).toBeCloseTo(33.037397)
  expect(fromDbTipster(rows.find(r=>r.slug==='565069')!,now).yield6m.valuePct).toBeCloseTo(33.037397)
  expect(fromDbTipster(rows.find(r=>r.slug==='b2i')!,now).yield6m.valuePct).toBe(10)
  const json=JSON.stringify(rows.find(r=>r.slug==='565069')!.olbgEvidence)
  expect(json).not.toContain('sha256');expect(json).not.toContain('bytes');expect(json).not.toContain('source":')
 })
 it('filters and counts against the same masked all-time metric, not internal zero or period yield',async()=>{
  const {c,select}=query()
  const conditions=c.filters({minPicks:0,minYield:0})
  expect((await select().where(and(...conditions))).map(r=>r.slug).sort()).toEqual(['b2i','bb'])
  const all=await select().orderBy(...c.order('picks'))
  expect(all.slice(0,2).map(r=>r.slug)).toEqual(['bb','b2i'])
  const count=await db.select({n:sql<number>`count(*)::int`}).from(tipsters).leftJoin(c.source,c.joinOn).where(and(...conditions))
  expect(count[0].n).toBe(2)
  expect((await select().where(and(...c.filters({tipo:'free'})))).some(r=>r.platform==='olbg')).toBe(false)
  expect(c.warnings({platform:'blogabet'})).toEqual([])
  expect(c.warnings({platform:'olbg',minPicks:0})).toHaveLength(1)
  expect(c.warnings({platform:'olbg'})).toEqual([])
 })
 it('fails closed on missing evidence, identity/capture mismatch, invalid records and month rollover',async()=>{
  const {c,select}=query(new Date('2026-12-01T00:00:00Z'))
  const rows=await select().orderBy(...c.order('yield6m'))
  expect(rows.filter(r=>r.platform==='olbg'||r.platform==='bet2invest').every(r=>r.yield6m===null)).toBe(true)
  expect(rows.find(r=>r.slug==='bb')!.yield6m).toBe('50.00')
  expect(fromDbTipster(rows.find(r=>r.slug==='565069')!,new Date('2026-12-01')).yield6m.valuePct).toBeNull()
  const good=(await query().select()).find(r=>r.slug==='565069')!
  expect(fromOlbgReadRow({...good,slug:'other'},now)).toBeNull()
  expect(fromOlbgReadRow({...good,capturedAt:'bad'},now)).toBeNull()
  expect(fromOlbgReadRow(good,new Date('2026-12-01'))!.yield6m.valuePct).toBeNull()
  expect(()=>query(now,[...records,records[0]])).toThrow('Duplicate')
  expect(query(now,[{...records[0],months:[{...records[0].months[0],tips:-1}]}]).c.acceptedRecords).toBe(0)
 })
})
