import {describe,it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {ACTIVE_CLASS,ACTIVE_SLUG,updateActiveIndex,readActiveIndex,bootstrapActiveIndex,decodeActiveIndex} from '@/crawler/platforms/bet2invest/active-period-index'
import {windowBounds,type PeriodAudit} from '@/lib/bet2invest-period-contract'
const at=new Date('2026-11-17T12:00:00Z')
const audit=(slug:string,time=at):PeriodAudit=>({slug,capturedAt:time.toISOString(),windows:Object.fromEntries(([3,6,12]as const).map(n=>[n,{...windowBounds(time,n),value:'1.00',months:1,bets:10,caveats:[],reason:null}])) as unknown as PeriodAudit['windows']})
async function setup(){const pg=new PGlite();await pg.exec('CREATE TABLE tipsters(platform text,slug text,captured_at timestamptz);CREATE TABLE import_validation_log(platform text,slug text,class text,reason text,run_id text,created_at timestamptz DEFAULT NOW());CREATE INDEX existing_platform_slug ON import_validation_log(platform,slug)');return pg}
describe('single active index, history independent',()=>{
 it('preserves individual anchors across two complete 970-profile refreshes with 30000 retained historical records',async()=>{
  const pg=await setup()
  try{
   const first=Array.from({length:970},(_,i)=>audit('p'+i,new Date(at.getTime()+1000*i)))
   await pg.transaction(tx=>updateActiveIndex(tx,first))
   const second=first.map((a,i)=>audit(a.slug,new Date(at.getTime()+3600000+1000*i)))
   await pg.transaction(tx=>updateActiveIndex(tx,second))
   await pg.exec("INSERT INTO import_validation_log(platform,slug,class,reason,run_id) SELECT 'bet2invest','historical-'||i,'b2i-run-manifest-v1','{}','old-'||i FROM generate_series(1,30000)i")
   expect(await readActiveIndex(pg)).toEqual(second.slice().sort((a,b)=>a.slug.localeCompare(b.slug)))
   expect((await pg.query<{n:number}>('SELECT count(*)::int n FROM import_validation_log')).rows[0].n).toBe(30001)
  }finally{await pg.close()}
 })
 it('rejects legacy partial coverage, bootstraps exact current dates and retains data on rollback',async()=>{
  const pg=await setup()
  try{
   await pg.query("INSERT INTO tipsters VALUES ('bet2invest','legacy',$1)",[at])
   await expect(pg.transaction(tx=>updateActiveIndex(tx,[]))).rejects.toThrow('bootstrap')
   await expect(pg.transaction(tx=>bootstrapActiveIndex(tx,[]))).rejects.toThrow('coverage')
   await pg.transaction(tx=>bootstrapActiveIndex(tx,[audit('legacy')]))
   const before=await readActiveIndex(pg)
   await expect(pg.transaction(async tx=>{await updateActiveIndex(tx,[audit('new')]);throw Error('rollback')})).rejects.toThrow('rollback')
   expect(await readActiveIndex(pg)).toEqual(before)
   await expect(pg.transaction(tx=>bootstrapActiveIndex(tx,[]))).rejects.toThrow('already')
  }finally{await pg.close()}
 })
 it('corruption and duplicate identity fail closed, never silently replace history',async()=>{
  const pg=await setup()
  try{
   await pg.transaction(tx=>updateActiveIndex(tx,[audit('one')]))
   const record=(await pg.query<{reason:string}>('SELECT reason FROM import_validation_log')).rows[0]
   const damaged=JSON.parse(record.reason);damaged.index.rows[0].windows[3].bets++
   expect(()=>decodeActiveIndex(JSON.stringify(damaged))).toThrow('integrity')
   await pg.query('INSERT INTO import_validation_log(platform,slug,class,reason,run_id) VALUES($1,$2,$3,$4,$5)',['bet2invest',ACTIVE_SLUG,ACTIVE_CLASS,record.reason,'duplicate'])
   await expect(readActiveIndex(pg)).rejects.toThrow('duplicate')
  }finally{await pg.close()}
 })
})
