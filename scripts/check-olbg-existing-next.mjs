// Exercises the EXISTING / and /api/tipsters, not a separate lab.
// Disposable local DB only. Synthetic BB rows are test fixtures, never source data.
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,createHmac,createHash} from 'node:crypto'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const file=process.argv[2];if(!file)throw Error('Expected monthly snapshot')
const dir=fs.mkdtempSync('/tmp/olbg-existing-db-')
const password=randomBytes(16).toString('hex'),secret=randomBytes(16).toString('hex')
const env={...process.env,USE_PGLITE:'1',PGLITE_DIR:dir,SITE_PASSWORD:password,AUTH_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1'}
delete env.DATABASE_URL;delete env.DATABASE_URL_DIRECT;delete env.OLBG_ACTIVATION;delete env.OLBG_LOCAL_REVIEW;delete env.OLBG_MONTHLY_LOCAL;delete env.LAB_PREVIEW
const seed=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/seed-isolated-db.ts'],{env,encoding:'utf8'})
assert.equal(seed.status,0,seed.stderr)
const cookie=createHmac('sha256',secret).update(password).digest('hex')
let server,browser
async function start(candidate){
 const e={...env,...candidate?{LAB_PREVIEW:'1',OLBG_MONTHLY_LOCAL:'1',OLBG_MONTHLY_SNAPSHOT_FILE:file,OLBG_MONTHLY_SNAPSHOT_SHA256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}: {}}
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','3751'],{env:e,stdio:['ignore',fs.openSync(`/tmp/olbg-existing-${candidate?'candidate':'baseline'}.log`,'w'),fs.openSync(`/tmp/olbg-existing-${candidate?'candidate':'baseline'}-error.log`,'w')]})
 for(let i=0;i<120;i++){try{const r=await fetch('http://127.0.0.1:3751/login');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,500))}
 throw Error('Server unavailable')
}
async function stop(){if(server){server.kill('SIGTERM');await new Promise(r=>server.once('close',r));server=undefined}}
async function read(p,candidate){
 const rows=[];let cursor,page=0,first
 for(;;){const q=new URLSearchParams(p);if(candidate&&cursor)q.set('monthlyCursor',cursor);if(!candidate)q.set('page',String(page))
 const response=await fetch('http://127.0.0.1:3751/api/tipsters?'+q,{headers:{cookie:'auth_token='+cookie}})
 assert.equal(response.status,200,await response.clone().text());const data=await response.json();first??=data
 rows.push(...candidate?data.rows:data.data)
 if(candidate?!data.nextCursor:!data.hasMore)break
 cursor=data.nextCursor;page++;assert.ok(page<30)
 }
 return {rows,first,pages:page+1}
}
try{
 const matrix=['yield','profit','picks','followers','since_year','price','yield6m','yield12m','picks6m_avg'].map(sort=>'platform=all&sort='+sort)
 matrix.push('platform=blogabet','platform=tipstrr','platform=all&minYield=10','platform=all&maxYield=10','platform=all&minPicks=300','platform=all&tipo=paid','platform=all&tipo=free','platform=all&activity=3','platform=all&activity=unknown','platform=all&search=bb-demo-001','platform=blogabet&tipo=paid&priceMin=20&priceMax=40','platform=blogabet&minYears=5&resetOlderThan=1&conPicksFree=1')
 await start(false)
 const normal=[];for(const q of matrix)normal.push((await read(q,false)).rows.map(r=>`${r.platform}:${r.id}`))
 await stop();await start(true)
 for(let i=0;i<matrix.length;i++){
  const candidate=await read(matrix[i],true)
  assert.deepEqual(candidate.rows.filter(r=>r.card.platform!=='olbg').map(r=>r.key),normal[i],matrix[i])
 }
 const all=await read('platform=all',true)
 const sourceEstimates=all.rows.filter(r=>r.card.platform==='olbg')
 assert.equal(sourceEstimates.filter(r=>r.card.olbgEstimates.global.status==='estimated').length,469)
 assert.equal(sourceEstimates.filter(r=>r.card.olbgEstimates.global.status==='interval-only'&&r.card.yieldPct===null).length,92)
 for(const query of ['minYield=10','maxYield=10','minPicks=300']){
  const filtered=await read('platform=olbg&'+query,true)
  const [field,value]=query.split('=');assert.ok(filtered.rows.every(r=>field==='minPicks'?r.card.picks>=Number(value):r.card.yieldPct!==null&&(field==='minYield'?r.card.yieldPct>=Number(value):r.card.yieldPct<=Number(value))))
 }
 assert.equal(all.first.total,620);assert.equal(all.rows.length,620);assert.equal(new Set(all.rows.map(r=>r.key)).size,620);assert.equal(all.pages,13)
 const october=await read('platform=olbg&olbgMonth=2026-10&olbgMonthlyOrder=roi-desc',true)
 assert.equal(october.rows.length,561)
 const octoberAvailable=await read('platform=olbg&olbgMonth=2026-10&olbgPicksMin=0',true)
 assert.equal(octoberAvailable.rows.length,511)
 const onlyMonthly=await read('platform=all&olbgMonth=2026-10&olbgRoiMin=0',true)
 assert.ok(onlyMonthly.rows.every(r=>r.card.platform==='olbg'&&r.card.olbgMonthly.selected.roiPublished>=0))
 const stale=await fetch('http://127.0.0.1:3751/api/tipsters?platform=all&sort=profit&monthlyCursor='+encodeURIComponent(all.first.nextCursor),{headers:{cookie:'auth_token='+cookie}})
 assert.equal(stale.status,409)
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
 const context=await browser.newContext({viewport:{width:1280,height:1000}})
 await context.addCookies([{name:'auth_token',value:cookie,domain:'127.0.0.1',path:'/'}])
 const page=await context.newPage()
 await page.goto('http://127.0.0.1:3751/?platform=olbg&olbgMonth=2026-10&olbgMonthlyOrder=roi-desc',{waitUntil:'networkidle'})
 assert.equal(await page.locator('.tipster-block').count(),50)
 for(let i=0;i<50;i++)assert.ok((await page.locator('.tipster-block').nth(i).innerText()).includes(october.first.rows[i].card.name))
 await page.screenshot({path:'/downloads/olbg-existing-desktop.png'})
 await page.setViewportSize({width:390,height:1000});await page.screenshot({path:'/downloads/olbg-existing-mobile.png'})
 // Exercise the real client continuation, not only API cursor reads.
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
 for(let i=0;i<40&&await page.locator('.tipster-block').count()===50;i++)await page.waitForTimeout(250)
 assert.ok(await page.locator('.tipster-block').count()>50,await page.locator('body').innerText())
 // Existing filter URL update must clear cursor and retain the selected source.
 await page.getByLabel('Mes publicado OLBG',{exact:true}).selectOption('2026-09')
 await page.waitForURL(/olbgMonth=2026-09/);await page.waitForLoadState('networkidle')
 assert.equal(new URL(page.url()).searchParams.get('monthlyCursor'),null)
 assert.equal(new URL(page.url()).searchParams.get('platform'),'olbg')
 await page.goto('http://127.0.0.1:3751/?platform=olbg&search=Niffler',{waitUntil:'networkidle'})
 assert.equal(await page.locator('.tipster-block').count(),1)
 assert.match(await page.locator('.tipster-block').innerText(),/est\./)
 assert.doesNotMatch(await page.locator('.tipster-block').innerText(),/meses disponibles/)
 assert.match(await page.locator('.tipster-block').innerText(),/12,0%/)
 assert.equal(await page.locator('.tipster-left img').evaluate(i=>i.complete&&i.naturalWidth>0),true)
 assert.equal(await page.locator('.tipster-right a').evaluate(a=>getComputedStyle(a).backgroundColor),'rgb(233, 138, 21)')
 await page.screenshot({path:'/downloads/olbg-estimated-mobile.png'})
 await page.setViewportSize({width:1280,height:1000})
 await page.screenshot({path:'/downloads/olbg-estimated-desktop.png'})
 await page.locator('.tipster-block summary').click()
 await page.screenshot({path:'/downloads/olbg-estimated-detail-desktop.png'})
 await page.setViewportSize({width:390,height:1100})
 await page.locator('.tipster-block details').scrollIntoViewIfNeeded()
 await page.screenshot({path:'/downloads/olbg-estimated-detail-mobile.png',fullPage:true})
 const result={existingHome:true,existingAPI:true,baselineRegressionQueries:matrix.length,syntheticBlogabetTestRows:57,retainedTipstrrRows:2,olbgProfiles:561,total:620,pages:all.pages,october:511,SSRandAPIOrderEqual:true,clientLoadMore:true,changedQuery409:true,noExternalDatabase:true,dbDirectory:dir}
 fs.writeFileSync('/tmp/olbg-existing-result.json',JSON.stringify(result,null,2));console.log(result)
}finally{if(browser)await browser.close();await stop()}
