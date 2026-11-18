import fs from 'node:fs'
import {spawn,execFileSync} from 'node:child_process'
import {createHmac,randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
const [databaseDirectory,snapshot]=process.argv.slice(2)
if(!databaseDirectory||!snapshot)throw Error('Expected disposable PGlite directory and private snapshot')
if(process.env.DATABASE_URL||process.env.DATABASE_URL_DIRECT)throw Error('Live DB credentials forbidden for local runtime smoke')
execFileSync('npx',['tsx','scripts/check-olbg-product-local.ts',databaseDirectory,snapshot],{env:process.env,stdio:'inherit'})
const password=randomBytes(16).toString('hex'),secret=randomBytes(16).toString('hex')
const env={...process.env,NODE_ENV:'production',USE_PGLITE:'1',PGLITE_DIR:databaseDirectory,SITE_PASSWORD:password,AUTH_SECRET:secret,OLBG_PUBLISHED_ESTIMATES:'1',NEXT_TELEMETRY_DISABLED:'1'}
delete env.DATABASE_URL;delete env.DATABASE_URL_DIRECT;delete env.LAB_PREVIEW;delete env.OLBG_MONTHLY_LOCAL
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3753'],{env,stdio:['ignore',fs.openSync('/tmp/olbg-prod-smoke.log','w'),fs.openSync('/tmp/olbg-prod-smoke-error.log','w')]})
try{
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:3753/login');if(r.ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
 const cookie='auth_token='+createHmac('sha256',secret).update(password).digest('hex')
 const get=p=>fetch('http://127.0.0.1:3753'+p,{headers:{cookie}})
 const response=await get('/api/tipsters?platform=olbg&search=Niffler');assert.equal(response.status,200)
 const page=await response.json();assert.equal(page.rows.length,1);assert.ok(Math.abs(page.rows[0].card.yieldPct-12.030570863)<1e-7)
 const home=await get('/?platform=olbg&search=Niffler');assert.equal(home.status,200);assert.ok((await home.text()).includes('Historial parcial'))
 for(const path of ['/lab/olbg-common','/lab/olbg-monthly','/api/lab/olbg-common','/.private-data/olbg/published-monthly.json'])assert.equal((await get(path)).status,404,path)
 assert.equal((await fetch('http://127.0.0.1:3753/',{redirect:'manual'})).status,307)
 assert.equal((await fetch('http://127.0.0.1:3753/api/tipsters?platform=olbg',{redirect:'manual'})).status,200)
 console.log(JSON.stringify({productionBuild:true,productionRuntime:true,releaseFlagOnly:true,localDisposableDatabase:true,pinnedDatabaseProductSnapshot:true,rawSnapshotNotRequiredInBuild:true,rawSnapshotURL404:true,labs404:true,homeAuthRedirect307:true,existingAPIUnauthenticated200:true,nifflerEstimateCorrect:true}))
}finally{server.kill('SIGTERM');await new Promise(r=>server.once('close',r))}
