import {it,expect,vi} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {buildBEReleaseProfiles,verifyReleaseProfiles,BE_RELEASE_SHA256,releaseDigest} from '@/lib/bettingexpert-release-artifact'
import {installFixedBERelease,rollbackFixedBERelease,BE_RELEASE_TABLE_SQL} from '@/lib/bettingexpert-release-install'
import {beProductionReleaseEnabled} from '@/lib/bettingexpert-release-database'
const run=process.env.BE_TEST_GLOBAL547_FILE&&process.env.BE_TEST_EVIDENCE_DIR?it:it.skip
run('atomic fixed production artifact installs exact scope and rollback preserves other platforms',async()=>{
 const pg=new PGlite()
 try{
 for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'))
 await pg.exec(BE_RELEASE_TABLE_SQL)
 await pg.query("INSERT INTO tipsters(id,platform,slug,name,picks,yield) VALUES(1,'blogabet','control','Control',80,5)")
 const profiles=verifyReleaseProfiles(buildBEReleaseProfiles(process.env.BE_TEST_EVIDENCE_DIR!)),globalsBytes=readFileSync(process.env.BE_TEST_GLOBAL547_FILE!)
 expect(releaseDigest(profiles)).toBe(BE_RELEASE_SHA256)
 expect(()=>verifyReleaseProfiles([...profiles].reverse())).toThrow()
 expect(beProductionReleaseEnabled({NODE_ENV:'production',BE_FIXED_RELEASE:'be547-2026-11-v1'})).toBe(true)
 expect(beProductionReleaseEnabled({NODE_ENV:'production',BE_EXISTING_LOCAL:'1',USE_PGLITE:'1'})).toBe(false)
 const input={profiles,globalsBytes,codeRevision:'1ae42efbefeba955c36edd1e21950fb9ac892218'}
 await expect(pg.transaction(async tx=>{await installFixedBERelease(tx,input);throw Error('force rollback')})).rejects.toThrow('force rollback')
 expect((await pg.query('SELECT count(*)::int AS n FROM tipsters')).rows).toEqual([{n:1}])
 expect((await pg.query('SELECT count(*)::int AS n FROM import_validation_log')).rows).toEqual([{n:0}])
 await pg.query("INSERT INTO import_validation_log(platform,slug,captured_at,class,reason,run_id) VALUES('bettingexpert','preexisting',now(),'external','do not adopt','be547-2026-11-v1-0')")
 await expect(pg.transaction(tx=>installFixedBERelease(tx,input))).rejects.toThrow('BE log inventory')
 expect((await pg.query('SELECT count(*)::int AS n FROM import_validation_log')).rows).toEqual([{n:1}])
 expect((await pg.query('SELECT count(*)::int AS n FROM tipsters')).rows).toEqual([{n:1}])
 await pg.query("DELETE FROM import_validation_log WHERE slug='preexisting'")
 const result=await pg.transaction(tx=>installFixedBERelease(tx,input));expect(result).toEqual({profiles:547,periodStates:1641,numeric:485,globalInserts:547,acceptedLogs:547,snapshotRows:1})
 const stored:any=(await pg.query('SELECT profiles FROM be_fixed_release')).rows[0];expect(releaseDigest(verifyReleaseProfiles(stored.profiles))).toBe(BE_RELEASE_SHA256)
 await expect(pg.transaction(tx=>installFixedBERelease(tx,input))).rejects.toThrow('BE inventory changed')
 await pg.query("UPDATE tipsters SET name='changed' WHERE platform='bettingexpert' AND slug=$1",[profiles[0].slug])
 await expect(pg.transaction(tx=>rollbackFixedBERelease(tx))).rejects.toThrow('Imported rows changed')
 await pg.query("UPDATE tipsters t SET name=r.value->>'name' FROM be_fixed_release b,jsonb_array_elements(b.inserted_rows) r WHERE t.id=(r.value->>'id')::int")
 await pg.query("INSERT INTO import_validation_log(platform,slug,captured_at,class,reason,run_id) VALUES('bettingexpert','later-external',now(),'external','must survive rollback','be547-2026-11-v1-0')")
 expect(await pg.transaction(tx=>rollbackFixedBERelease(tx))).toEqual({deletedProfiles:547})
 expect((await pg.query('SELECT id,platform,picks,yield::text FROM tipsters')).rows).toEqual([{id:1,platform:'blogabet',picks:80,yield:'5.00'}])
 expect((await pg.query('SELECT slug FROM import_validation_log')).rows).toEqual([{slug:'later-external'}])
 expect((await pg.query('SELECT count(*)::int AS n FROM be_fixed_release')).rows).toEqual([{n:0}])
 }finally{await pg.close()}
},30000)

run('conflicting writer lock aborts before any inventory adoption or write',async()=>{
 const profiles=verifyReleaseProfiles(buildBEReleaseProfiles(process.env.BE_TEST_EVIDENCE_DIR!))
 const query=vi.fn(async(sql:string)=>{if(sql==='LOCK TABLE tipsters, import_validation_log, be_fixed_release IN SHARE ROW EXCLUSIVE MODE NOWAIT')throw Error('55P03 lock not available');throw Error('unexpected query')})
 await expect(installFixedBERelease({query}as any,{profiles,globalsBytes:readFileSync(process.env.BE_TEST_GLOBAL547_FILE!),codeRevision:'1ae42efbefeba955c36edd1e21950fb9ac892218'})).rejects.toThrow('55P03')
 expect(query).toHaveBeenCalledTimes(1)
})
