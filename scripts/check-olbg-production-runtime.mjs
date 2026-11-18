import fs from 'node:fs'
import {spawn,execFileSync} from 'node:child_process'
import {createHmac,randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
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
 const freeResponse=await get('/api/tipsters?platform=olbg&tipo=free&search=Niffler');assert.equal(freeResponse.status,200)
 const freePage=await freeResponse.json();assert.equal(freePage.total,page.total);assert.deepEqual(freePage.rows,page.rows);assert.equal(freePage.rows[0].card.isPaid,false)
 const paidResponse=await get('/api/tipsters?platform=olbg&tipo=paid&search=Niffler');assert.equal(paidResponse.status,200)
 const paidPage=await paidResponse.json();assert.equal(paidPage.total,0);assert.equal(paidPage.rows.length,0)
 const home=await get('/?platform=olbg&search=Niffler');assert.equal(home.status,200);assert.ok((await home.text()).includes('Historial parcial'))
 for(const path of ['/lab/olbg-common','/lab/olbg-monthly','/api/lab/olbg-common','/.private-data/olbg/published-monthly.json'])assert.equal((await get(path)).status,404,path)
 assert.equal((await fetch('http://127.0.0.1:3753/',{redirect:'manual'})).status,307)
 assert.equal((await fetch('http://127.0.0.1:3753/api/tipsters?platform=olbg',{redirect:'manual'})).status,200)
 if(process.argv.includes('--midpoint-preview')){
  const a=await (await get('/api/tipsters?platform=olbg&tipo=free&search=Chester%20Copperpot')).json()
  assert.equal(a.rows[0].card.olbgEstimates.global.centralConvention,'interval-midpoint-profit-tolerance-1')
  const value=a.rows[0].card.yieldPct;assert.ok(value<0)
  assert.equal((await (await get('/api/tipsters?platform=olbg&search=Chester%20Copperpot&minYield=0')).json()).total,0)
  assert.equal((await (await get('/api/tipsters?platform=olbg&search=Chester%20Copperpot&minYield=-1&maxYield=0')).json()).total,1)
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
  try{
   const context=await browser.newContext({viewport:{width:1280,height:900}})
   await context.addCookies([{name:'auth_token',value:cookie.split('=')[1],domain:'127.0.0.1',path:'/'}])
   const preview=await context.newPage()
   await preview.goto('http://127.0.0.1:3753/?platform=olbg&tipo=free&search=Chester%20Copperpot',{waitUntil:'networkidle'})
   assert.equal(await preview.locator('.tipster-block').count(),1)
   await preview.screenshot({path:'/downloads/olbg-midpoint-desktop.png'})
   await preview.setViewportSize({width:390,height:1000})
   await preview.screenshot({path:'/downloads/olbg-midpoint-mobile.png'})
   await preview.locator('summary').click()
   assert.match(await preview.locator('details').innerText(),/punto medio del intervalo/)
   assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   await preview.screenshot({path:'/downloads/olbg-midpoint-detail-mobile.png',fullPage:true})
  }finally{await browser.close()}
 }
 console.log(JSON.stringify({productionBuild:true,productionRuntime:true,releaseFlagOnly:true,localDisposableDatabase:true,pinnedDatabaseProductSnapshot:true,rawSnapshotNotRequiredInBuild:true,rawSnapshotURL404:true,labs404:true,homeAuthRedirect307:true,existingAPIUnauthenticated200:true,nifflerEstimateCorrect:true,olbgFreeMatchesAll:true,olbgPaidEmpty:true}))
}finally{server.kill('SIGTERM');await new Promise(r=>server.once('close',r))}
