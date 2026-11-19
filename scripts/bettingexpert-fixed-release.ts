import {createHash} from 'node:crypto'
import {assertBEOperatorContext} from '../lib/bettingexpert-release-operator-guard'
// Operator-only release artifact. Defaults to read-only plan. No automatic run.
import {Client} from 'pg'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {buildBEReleaseProfiles,verifyReleaseProfiles,BE_RELEASE_ID,BE_RELEASE_SHA256} from '../lib/bettingexpert-release-artifact'
import {BE_RELEASE_TABLE_SQL,installFixedBERelease,rollbackFixedBERelease} from '../lib/bettingexpert-release-install'
async function main(){
 const [mode,globalFile,evidenceDir,approvedHead,approvedPublicationHead]=process.argv.slice(2)
 if(!['plan','install','rollback'].includes(mode)||!globalFile||!evidenceDir)throw Error('mode globalFile evidenceDir [approvedLocalHead] required')
 const profiles=verifyReleaseProfiles(buildBEReleaseProfiles(evidenceDir)),globalsBytes=readFileSync(globalFile)
 const current=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
 const gitStatus=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trim()
 const artifactVerified=createHash('sha256').update(globalsBytes).digest('hex')==='458589cd665e8f4b85a6c43d94ada776699c32f575bcce06647c931e81ec704e'
 const remote=execFileSync('git',['ls-remote','https://github.com/Panigc93/blogabet-clone-filter.git','refs/heads/master'],{encoding:'utf8'}).split(/\s/)[0]
 assertBEOperatorContext({mode,head:current,remoteMaster:remote,gitStatus,approvedHead,approvedPublicationHead,artifactVerified,releaseId:BE_RELEASE_ID})
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000})
 try{await client.connect();await client.query(mode==='plan'?'BEGIN READ ONLY':'BEGIN');await client.query("SET LOCAL statement_timeout='30s'")
 if(mode==='plan'){
  const rows=await client.query("SELECT platform,count(*)::int AS count FROM tipsters GROUP BY platform ORDER BY platform")
  const collisions=await client.query("SELECT id,slug FROM tipsters WHERE platform='bettingexpert' AND lower(slug)=ANY($1::text[]) ORDER BY id",[profiles.map(p=>p.slug.toLowerCase())])
  console.log(JSON.stringify({mode,master:remote,codeHead:current,release:BE_RELEASE_ID,digest:BE_RELEASE_SHA256,platformCounts:rows.rows,collisions:collisions.rows,planned:{newGlobal:547,newLogs:547,newSnapshotRows:1,periodStates:1641,numericPeriods:485,updatesExisting:0}}));await client.query('ROLLBACK');return
 }
 if(mode==='install'){await client.query(BE_RELEASE_TABLE_SQL);console.log(JSON.stringify(await installFixedBERelease(client,{globalsBytes,profiles,codeRevision:current})))}
 else console.log(JSON.stringify(await rollbackFixedBERelease(client)))
 await client.query('COMMIT')
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{await client.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixed release failed');process.exitCode=1})
