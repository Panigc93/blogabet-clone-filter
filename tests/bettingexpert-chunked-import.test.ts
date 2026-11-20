import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {executeInsertBatch,batchDigest,type VerifiedRow} from '@/crawler/platforms/bettingexpert/import'
import {executeChunkedInsertBatch} from '@/crawler/platforms/bettingexpert/import-chunked'
import {installFixedBERelease,BE_RELEASE_TABLE_SQL} from '@/lib/bettingexpert-release-install'
import {buildBEReleaseProfiles,verifyReleaseProfiles} from '@/lib/bettingexpert-release-artifact'
const run=process.env.BE_TEST_GLOBAL547_FILE&&process.env.BE_TEST_EVIDENCE_DIR?it:it.skip
async function setup(){const pg=new PGlite();for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql','0006_apuestes_source_url.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'));await pg.exec(BE_RELEASE_TABLE_SQL);await pg.query("INSERT INTO tipsters(id,platform,slug,name,picks,yield) VALUES(1,'blogabet','control','Control',80,5)");return pg}
run('chunk SQL matches original rows and provenance, uses two INSERT roundtrips',async()=>{
 const rows=JSON.parse(readFileSync(process.env.BE_TEST_GLOBAL547_FILE!,'utf8')).slice(0,120)as VerifiedRow[],a=await setup(),b=await setup()
 const input={rows,runId:'comparison',expectedSha256:batchDigest(rows),codeRevision:'92bf300b3deedc6942a340631dde8c99336e37cd'}
 try{
 await executeInsertBatch({transaction:fn=>a.transaction(tx=>fn(tx))},input)
 let inserts=0
 await executeChunkedInsertBatch({transaction:fn=>b.transaction(tx=>fn({query:async(text,params)=>{if(text.startsWith('INSERT'))inserts++;return tx.query(text,params)}}))},input)
 expect(inserts).toBe(2)
 expect((await b.query(`SELECT to_jsonb(t)-'updated_at' AS row FROM tipsters t ORDER BY id`)).rows).toEqual((await a.query(`SELECT to_jsonb(t)-'updated_at' AS row FROM tipsters t ORDER BY id`)).rows)
 expect((await b.query('SELECT platform,slug,captured_at,class,reason,run_id FROM import_validation_log ORDER BY id')).rows).toEqual((await a.query('SELECT platform,slug,captured_at,class,reason,run_id FROM import_validation_log ORDER BY id')).rows)
 await expect(executeChunkedInsertBatch({transaction:fn=>b.transaction(tx=>fn(tx))},input)).rejects.toThrow('existing-identity')
 await expect(executeChunkedInsertBatch({transaction:fn=>b.transaction(tx=>fn(tx))},{...input,expectedSha256:'0'.repeat(64)})).rejects.toThrow('invalid-provenance')
 }finally{await a.close();await b.close()}
},30000)
run('failure in second chunk log INSERT rolls back first chunk, current chunk and snapshot',async()=>{
 const pg=await setup(),input={globalsBytes:readFileSync(process.env.BE_TEST_GLOBAL547_FILE!),profiles:verifyReleaseProfiles(buildBEReleaseProfiles(process.env.BE_TEST_EVIDENCE_DIR!)),codeRevision:'92bf300b3deedc6942a340631dde8c99336e37cd'}
 try{
 let logs=0
 await expect(pg.transaction(tx=>installFixedBERelease({query:async(text,params)=>{if(text.startsWith('INSERT INTO import_validation_log')&&++logs===2)throw Error('injected second chunk log failure');return tx.query(text,params)}},input))).rejects.toThrow('injected second chunk')
 expect(logs).toBe(2)
 expect((await pg.query('SELECT id,platform FROM tipsters')).rows).toEqual([{id:1,platform:'blogabet'}])
 expect((await pg.query('SELECT count(*)::int AS n FROM import_validation_log')).rows).toEqual([{n:0}]);expect((await pg.query('SELECT count(*)::int AS n FROM be_fixed_release')).rows).toEqual([{n:0}])
 }finally{await pg.close()}
},30000)
run('missing or mismatched bulk return receipt aborts atomically',async()=>{
 const pg=await setup(),rows=JSON.parse(readFileSync(process.env.BE_TEST_GLOBAL547_FILE!,'utf8')).slice(0,2)as VerifiedRow[]
 try{await expect(executeChunkedInsertBatch({transaction:fn=>pg.transaction(tx=>fn({query:async(text,params)=>{const r=await tx.query(text,params);if(text.startsWith('INSERT INTO tipsters'))return {rows:r.rows.slice(0,1) as any};return r as any}}))},{rows,runId:'bad-receipt',expectedSha256:batchDigest(rows),codeRevision:'92bf300b3deedc6942a340631dde8c99336e37cd'})).rejects.toThrow('insert-receipt-mismatch');expect((await pg.query('SELECT count(*)::int AS n FROM tipsters')).rows).toEqual([{n:1}])}finally{await pg.close()}
},30000)
