// Disposable DB only; imports product for production-runtime smoke. No live URL.
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {prepareProductSnapshot} from '../lib/olbg-product-snapshot'
import {importProductSnapshot,readStoredSnapshot,type SnapshotSQL} from '../lib/olbg-product-storage'
import {commonMonthlyPage} from '../lib/olbg-common-list-candidate'
import manifest from '../config/olbg-product-manifest.json'
async function main(){
 if(process.env.DATABASE_URL||process.env.DATABASE_URL_DIRECT)throw Error('Live DB URL forbidden')
 const [dir,file]=process.argv.slice(2)
 if(!dir?.startsWith('/tmp/')||!file)throw Error('Expected disposable /tmp DB and validated snapshot')
 const source=JSON.parse(fs.readFileSync(file,'utf8'))
 const product=prepareProductSnapshot(source.profiles)
 if(JSON.stringify(product.manifest)!==JSON.stringify(manifest))throw Error('Pinned Git manifest mismatch')
 const pg=new PGlite(dir)
 try{
  const first=await pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,product.payload,product.manifest))
  const second=await pg.transaction(tx=>importProductSnapshot(tx as SnapshotSQL,product.payload,product.manifest))
  const loaded=await readStoredSnapshot(pg as SnapshotSQL,product.manifest)
  if(JSON.stringify(loaded.profiles)!==JSON.stringify(JSON.parse(product.payload).profiles))throw Error('Full product roundtrip failed')
  let checks=0,pages=0
  for(const order of ['yield-desc','picks','name','yield6m','yield12m'] as const){
   const request={estimate:true,order,monthly:{month:'latest-available'},pageSize:200}
   let cursor:string|undefined
   do{
    const expected=commonMonthlyPage([],'baseline',{revision:product.manifest.revision,profiles:source.profiles},{...request,cursor})
    const actual=commonMonthlyPage([],'baseline',loaded,{...request,cursor})
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Product adapter equivalence failed')
    cursor=actual.nextCursor??undefined;pages++
   }while(cursor)
   checks++
  }
  console.log(JSON.stringify({localOnly:true,...product.manifest,payloadBytes:Buffer.byteLength(product.payload),idempotent:!second.inserted,firstInsert:first.inserted,equivalentSorts:checks,equivalentPages:pages,fullProductRoundtrip:true}))
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
