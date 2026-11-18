import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
const state=JSON.parse(readFileSync('/tmp/olbg/local-smoke-state.json','utf8'))
if(!state.dir.startsWith('/tmp/olbg-disposable-review-') || process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT)throw Error('Disposable local database only')
const port=3317, root=`http://127.0.0.1:${port}`
const check=(x,m)=>{if(!x)throw Error(m)}
const results=[]
async function run(enabled){
 const password=randomBytes(24).toString('hex'),secret=randomBytes(24).toString('hex')
 const fd=openSync(`/tmp/olbg/local-web-${enabled}.log`,'w')
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,USE_PGLITE:'1',PGLITE_DIR:state.dir,OLBG_LOCAL_REVIEW:enabled?'1':'0',SITE_PASSWORD:password,AUTH_SECRET:secret},stdio:['ignore',fd,fd]})
 let browser
 try {
  for(let i=0;i<80;i++){
   try{if((await fetch(root+'/login')).ok)break}catch{}
   if(server.exitCode!==null)throw Error('local server exited')
   await new Promise(r=>setTimeout(r,250))
  }
  browser=await chromium.launch(process.env.LOCAL_CHROMIUM ? {executablePath:process.env.LOCAL_CHROMIUM} : {})
  const api=async(q)=>{const r=await fetch(root+'/api/tipsters?'+q);check(r.status===200,'API '+r.status);return r.json()}
  const data=await api('platform=olbg&sort=yield6m')
  if(enabled){
   check(data.data.length===3,'OLBG count')
   check(data.data.map(r=>r.slug).join(',')==='565069,535122,342919','OLBG order')
   check(data.data.every(r=>r.yield===null&&r.picks===null&&r.profit===null),'unknown alltime')
   check(data.data[2].yield6m===null,'missing month')
   check(Math.abs(Number(data.data[0].yield6m)-33.03739715781601)<1e-8,'derived yield')
   check(!JSON.stringify(data).includes('sha256')&&!JSON.stringify(data).includes('httpDate'),'private receipt fields')
   const filtered=await api('platform=olbg&minPicks=0');check(filtered.data.length===0&&filtered.warnings.length>0,'unknown total filter')
   check((await fetch(root+'/api/tipsters?platform=olbg&periodAnchor=2026-11-01T00:00:00Z')).status===409,'same-month evidence update invalidates old continuation')
  }else check(data.data.length===0,'disabled gate')
  const all=await api('platform=all&sort=yield6m');check(all.data.length===(enabled?7:4),'combined count')
  for(const p of ['blogabet','tipstrr','golazobets','bet2invest'])check((await api('platform='+p)).data.length===1,'baseline '+p)
  check((await fetch(root+'/api/tipsters?platform=olbg&periodAnchor=2026-10-17T12:00:00Z')).status===409,'rollover continuation')
  const page=await browser.newPage({viewport:{width:1280,height:1000}})
  const token=createHmac('sha256',secret).update(password).digest('hex')
  await page.context().addCookies([{name:'auth_token',value:token,url:root}])
  await page.goto(root+'/?platform=olbg&sort=yield6m');await page.waitForLoadState('networkidle')
  const options=await page.locator('select').first().locator('option').allTextContents()
  check(options.includes('OLBG')===enabled,'selector gate')
  if(enabled){
   for(const width of [1280,390]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(150)
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow')
    check((await page.locator('body').innerText()).includes('calculado aprox.'),'calculated label')
    await page.screenshot({path:`${process.env.OLBG_REVIEW_ARTIFACT_DIR || '/tmp/olbg'}/olbg-local-integration-${width}.png`,fullPage:true})
   }
  }
  results.push({enabled,olbg:data.data.length,all:all.data.length,baselinePlatforms:4,rollover409:true,selectorGate:true})
 }finally{
  if(browser)await browser.close()
  server.kill('SIGTERM');await new Promise(r=>{if(server.exitCode!==null)r();else{server.once('exit',r);setTimeout(()=>{server.kill('SIGKILL');r()},2000)}});closeSync(fd)
 }
}
await run(true);await run(false)
writeFileSync('/tmp/olbg/local-smoke-result.json',JSON.stringify({scope:'disposable local only',syntheticBaseline:true,pilots:3,results},null,2))
console.log(JSON.stringify(results))
