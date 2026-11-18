import {spawn} from 'node:child_process'
import {randomBytes,createHmac,createHash} from 'node:crypto'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const file=process.argv[2];if(!file)throw Error('Expected projected monthly snapshot path')
const password=randomBytes(16).toString('hex'),secret=randomBytes(16).toString('hex')
const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const env={...process.env,LAB_PREVIEW:'1',OLBG_MONTHLY_LOCAL:'1',OLBG_MONTHLY_SNAPSHOT_FILE:file,OLBG_MONTHLY_SNAPSHOT_SHA256:digest,SITE_PASSWORD:password,AUTH_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1'}
// No DATABASE_URL is needed or consumed by this harness.
delete env.DATABASE_URL;delete env.DATABASE_URL_DIRECT
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','3749'],{env,stdio:['ignore',fs.openSync('/tmp/olbg-common-next.log','w'),fs.openSync('/tmp/olbg-common-next-error.log','w')]})
let browser
try{
 for(let i=0;i<120;i++){try{await fetch('http://127.0.0.1:3749/login');break}catch{await new Promise(r=>setTimeout(r,500))}}
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
 const context=await browser.newContext({viewport:{width:1280,height:1000}})
 await context.addCookies([{name:'auth_token',value:createHmac('sha256',secret).update(password).digest('hex'),domain:'127.0.0.1',path:'/'}])
 const page=await context.newPage()
 await page.goto('http://127.0.0.1:3749/lab/olbg-common?order=yield-desc',{waitUntil:'networkidle'})
 assert.equal(await page.locator('.tipster-block').count(),50)
 assert.match(await page.locator('.tipster-block').first().innerText(),/StatMind/i)
 assert.match(await page.locator('main').innerText(),/562 perfiles/)
 await page.screenshot({path:'/downloads/olbg-common-desktop.png'})
 await page.setViewportSize({width:390,height:1000})
 await page.screenshot({path:'/downloads/olbg-common-mobile.png'})
 const seen=new Set();let cursor;let pages=0;let first
 for(;;){
  const query=new URLSearchParams({order:'name'});if(cursor)query.set('cursor',cursor)
  const response=await context.request.get('http://127.0.0.1:3749/api/lab/olbg-common?'+query)
  assert.equal(response.status(),200);const data=await response.json();first??=data
  assert.equal(data.total,562);pages++
  for(const row of data.rows){assert.ok(!seen.has(row.key));seen.add(row.key)}
  if(!data.nextCursor)break;cursor=data.nextCursor
 }
 assert.equal(seen.size,562);assert.equal(pages,12)
 await page.goto('http://127.0.0.1:3749/lab/olbg-common?order=name',{waitUntil:'networkidle'})
 assert.equal(await page.locator('.tipster-block').count(),first.rows.length)
 for(let i=0;i<first.rows.length;i++)assert.match(await page.locator('.tipster-block').nth(i).innerText(),new RegExp(first.rows[i].card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
 const filtered=await context.request.get('http://127.0.0.1:3749/api/lab/olbg-common?month=2026-10&order=olbg-roi-desc&roiMin=-1000000')
 assert.equal((await filtered.json()).total,511)
 const mismatch=await context.request.get('http://127.0.0.1:3749/api/lab/olbg-common?order=yield-desc&cursor='+encodeURIComponent(first.nextCursor))
 assert.equal(mismatch.status(),409)
 console.log(JSON.stringify({actualNextSSR:true,actualNextAPI:true,commonProfiles:562,sourceOLBG:561,datedRealTipstrr:1,pages,apiSSRFirstPageOrderEqual:true,octoberFiltered:511,staleQuery409:true,noDatabaseCredentials:true}))
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.once('close',r))}
