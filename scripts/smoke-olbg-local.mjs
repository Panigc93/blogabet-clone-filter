import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
const state=JSON.parse(readFileSync('/tmp/olbg/local-smoke-state.json','utf8'))
if(!state.dir.startsWith('/tmp/olbg-disposable-review-') || process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT)throw Error('Disposable local database only')
const port=3317, root=`http://127.0.0.1:${port}`
const check=(x,m)=>{if(!x)throw Error(m)}
const results=[]
const OLBG_TOTAL=3+120, ALL_TOTAL=OLBG_TOTAL+4
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
  const fetchAll=async(q)=>{let page=0,out=[];for(;;){const d=await api(q+'&page='+page);out.push(...d.data);if(!d.hasMore)return out;page++;if(page>30)throw Error('pagination runaway')}}
  const first=await api('platform=olbg&sort=yield6m')
  if(enabled){
   // Pagination: 123 rows over PAGE_SIZE 50 → 50/50/23, hasMore true/true/false
   check(first.data.length===50&&first.hasMore===true,'page0 shape')
   const p1=await api('platform=olbg&sort=yield6m&page=1'),p2=await api('platform=olbg&sort=yield6m&page=2'),p3=await api('platform=olbg&sort=yield6m&page=3')
   check(p1.data.length===50&&p1.hasMore===true,'page1 shape')
   check(p2.data.length===23&&p2.hasMore===false,'page2 shape')
   check(p3.data.length===0,'page3 empty')
   const olbgAll=[...first.data,...p1.data,...p2.data]
   check(olbgAll.length===OLBG_TOTAL&&new Set(olbgAll.map(r=>r.slug)).size===OLBG_TOTAL,'olbg total, no duplicates across pages')
   const bySlug=Object.fromEntries(olbgAll.map(r=>[r.slug,r]))
   const pilots=['565069','535122','342919'].map(s=>bySlug[s]);check(pilots.every(Boolean),'pilots present')
   check(Math.abs(Number(pilots[0].yield6m)-33.03739715781601)<1e-8,'derived yield')
   check(pilots[2].yield6m===null,'missing month')
   // Filters and sort read the visible observed figures: every OLBG row with
   // current evidence exposes picks/profit/yield (never null-alltime).
   check(olbgAll.every(r=>typeof r.picks==='number'&&r.picks>0&&r.profit!==null&&r.yield!==null),'visible observed figures in alltime cells')
   const byYield=await fetchAll('platform=olbg&sort=yield')
   check(byYield.length===OLBG_TOTAL,'yield sort total')
   for(let i=1;i<byYield.length;i++)check(Number(byYield[i-1].yield)>=Number(byYield[i].yield)-1e-9,'yield sort order')
   const byPicks=await fetchAll('platform=olbg&sort=picks')
   for(let i=1;i<byPicks.length;i++)check(byPicks[i-1].picks>=byPicks[i].picks,'picks sort order')
   // Filter counts computed from the same visible figures the API returned.
   const picksVals=olbgAll.map(r=>r.picks).sort((a,b)=>a-b)
   const T=picksVals[Math.floor(picksVals.length/2)]
   const expP=olbgAll.filter(r=>r.picks>=T).length
   const fP=await fetchAll('platform=olbg&minPicks='+T)
   check(fP.length===expP&&fP.every(r=>r.picks>=T),'minPicks count matches visible picks')
   // Threshold in the widest gap between distinct values: avoids float-boundary
   // ambiguity between JS Number and SQL numeric comparison.
   const yv=olbgAll.map(r=>Number(r.yield)).sort((a,b)=>a-b)
   let gi=1;for(let i=1;i<yv.length;i++)if(yv[i]-yv[i-1]>yv[gi]-yv[gi-1])gi=i
   const Y=(yv[gi]+yv[gi-1])/2
   const expY=olbgAll.filter(r=>Number(r.yield)>=Y).length
   const fY=await fetchAll('platform=olbg&minYield='+Y)
   check(fY.length===expY,'minYield count matches visible yield')
   check((await api('platform=olbg&minPicks=1000000000')).data.length===0,'impossible filter empty')
   check(!JSON.stringify(olbgAll).includes('sha256')&&!JSON.stringify(olbgAll).includes('httpDate'),'private receipt fields')
   const filtered=await api('platform=olbg&minPicks=0');check(filtered.data.length===50,'minPicks=0 keeps visible rows')
   check((await fetch(root+'/api/tipsters?platform=olbg&periodAnchor=2026-11-01T00:00:00Z')).status===409,'same-month evidence update invalidates old continuation')
  }else check(first.data.length===0,'disabled gate')
  const all=await fetchAll('platform=all&sort=yield6m');check(all.length===(enabled?ALL_TOTAL:4),'combined count')
  for(const p of ['blogabet','tipstrr','golazobets','bet2invest']){
   const b=(await api('platform='+p)).data
   check(b.length===1,'baseline '+p)
   check(Number(b[0].yield)===10&&b[0].picks===100,'baseline untouched '+p)
  }
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
    const body=await page.locator('body').innerText()
    check(body.includes('Historial parcial'),'partial-history detail present')
    check(!body.includes('calculado aprox.'),'approx caption removed')
    check(!body.includes('no es sincronización'),'sync jargon removed')
    check(body.includes('captura 2026-11-17'),'capture date kept')
    await page.screenshot({path:`${process.env.OLBG_REVIEW_ARTIFACT_DIR || '/tmp/olbg'}/olbg-local-integration-${width}.png`,fullPage:true})
   }
  }
  results.push({enabled,olbg:enabled?OLBG_TOTAL:0,all:all.length,baselinePlatforms:4,rollover409:true,selectorGate:true,pagination:'50/50/23',filterCounts:'matched visible figures'})
 }finally{
  if(browser)await browser.close()
  server.kill('SIGTERM');await new Promise(r=>{if(server.exitCode!==null)r();else{server.once('exit',r);setTimeout(()=>{server.kill('SIGKILL');r()},2000)}});closeSync(fd)
 }
}
await run(true);await run(false)
writeFileSync('/tmp/olbg/local-smoke-result.json',JSON.stringify({scope:'disposable local only',syntheticBaseline:true,pilots:3,syntheticScale:120,results},null,2))
console.log(JSON.stringify(results))
