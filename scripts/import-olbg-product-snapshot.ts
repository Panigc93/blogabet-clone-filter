// Defaults to OFFLINE dry-run. Live mutation requires explicit reviewed
// revision and hostname, supplied credential FILE, and operator authorization.
// These flags are mechanical guards, never a substitute for Juan's approval.
import fs from 'node:fs'
import {Client} from 'pg'
import {importProductSnapshot,readStoredSnapshot,type SnapshotSQL} from '../lib/olbg-product-storage'
import {decodeProductSnapshot,type ProductManifest} from '../lib/olbg-product-snapshot'
async function main(){
 const [payloadPath,manifestPath,...args]=process.argv.slice(2)
 if(!payloadPath||!manifestPath)throw Error('Expected product payload and manifest paths')
 const payload=fs.readFileSync(payloadPath,'utf8'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')) as ProductManifest
 decodeProductSnapshot(payload,manifest)
 const flag=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1]}
 if(!args.includes('--apply-approved')){console.log(JSON.stringify({dryRun:true,...manifest,payloadBytes:Buffer.byteLength(payload)}));return}
 if(flag('--approved-revision')!==manifest.revision)throw Error('Exact approved revision required')
 const credential=flag('--credential-file'),host=flag('--expected-host')
 if(!credential||!host)throw Error('Explicit credential file and expected hostname required')
 const url=fs.readFileSync(credential,'utf8').trim(),parsed=new URL(url)
 if(parsed.hostname!==host||!parsed.hostname.endsWith('.neon.tech')||parsed.pathname!=='/neondb')throw Error('Unexpected database target')
 const client=new Client({connectionString:url,connectionTimeoutMillis:15000,statement_timeout:30000})
 await client.connect()
 let committed=false
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'")
  const result=await importProductSnapshot(client as SnapshotSQL,payload,manifest)
  await client.query('COMMIT');committed=true
  await readStoredSnapshot(client as SnapshotSQL,manifest)
  console.log(JSON.stringify({committed:true,postCommitVerified:true,...result}))
 }catch(e){if(!committed)await client.query('ROLLBACK');throw e}finally{await client.end()}
}
// Never print PG error messages, SQL parameters, URLs or credential contents.
main().catch(e=>{console.error(JSON.stringify({failed:true,name:e?.name,code:e?.code}));process.exitCode=1})
