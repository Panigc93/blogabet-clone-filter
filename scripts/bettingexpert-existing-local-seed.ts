// Explicit disposable local-only seed. Never uses DATABASE_URL or db proxy.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {executeInsertBatch,batchDigest,type VerifiedRow} from '../crawler/platforms/bettingexpert/import'
async function main(){
 const [input,directory]=process.argv.slice(2)
 if(!input||!directory?.startsWith('/tmp/be547-existing-'))throw Error('Requires fixed Global subset and disposable /tmp/be547-existing-* directory')
 const bytes=readFileSync(input)
 if(createHash('sha256').update(bytes).digest('hex')!=='458589cd665e8f4b85a6c43d94ada776699c32f575bcce06647c931e81ec704e')throw Error('Global subset changed')
 const rows=JSON.parse(bytes.toString())as VerifiedRow[],pg=new PGlite(directory)
 try{
  for(const f of ['0000_sudden_jazinda.sql','0001_add_last_reset_at.sql','0002_add_is_verified.sql','0003_naive_dormammu.sql','0004_multi_platform.sql','0005_tipstrr_internal_pk.sql'])await pg.exec(readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').join('\n'))
  const groups=new Map<string,VerifiedRow[]>();for(const r of rows)groups.set(r.username.toLowerCase(),[...groups.get(r.username.toLowerCase())??[],r])
  const chunks:VerifiedRow[][]=[[]];for(const g of Array.from(groups.values())){if(chunks.at(-1)!.length+g.length>250)chunks.push([]);chunks.at(-1)!.push(...g)}
  for(const [i,chunk]of Array.from(chunks.entries()))await executeInsertBatch({transaction:fn=>pg.transaction(tx=>fn(tx))},{rows:chunk,runId:'local-existing-'+i,expectedSha256:batchDigest(chunk),codeRevision:'f9a0155febb58d6d5dbd625df3dfbb26f506acb1'})
  await pg.query("INSERT INTO tipsters(id,platform,slug,name,picks,yield,profit,yield_6m,profit_unit) VALUES(1,'blogabet','local-control','Control local Blogabet',80,5,8,3,'blogabet-units')")
  console.log(JSON.stringify({mode:'disposable-local-only',profiles:rows.length,chunks:chunks.length,remoteConnections:0,periodColumnWrites:0,syntheticOtherPlatformControls:1}))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
