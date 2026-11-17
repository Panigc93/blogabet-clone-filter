import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selectProfileIds, extractBankrollBlocks, parseMonthsResponse, monthsCloseWithTotals } from '@/crawler/platforms/bet2invest/api-months'
import { displayedStatNumber } from '@/crawler/platforms/bet2invest/parse'
import { windowYieldOrNull, buildOfflineRow, selectedBankrollMonthsClose } from '@/crawler/platforms/bet2invest/offline-import'
const f=(n:string)=>readFileSync(join(__dirname,'fixtures',n),'utf8')
const at=new Date('2026-11-17T16:27:00Z')
describe('same statistics-card identity, not og Picks badge',()=>{
 for(const [slug,picks] of [['LeGrec',230],['mattstph',410]] as const){
  it(`${slug}: selected default matches settled statistics card despite greater og tips`,()=>{
   const html=f(`b2i-card-${slug}.html`)
   expect(displayedStatNumber(html,'settledBetsNumber')).toBe(picks)
   expect(selectProfileIds(html).status).toBe('selected')
   expect(selectProfileIds(html.replace(/<meta[^>]*>/g,''))).toEqual(selectProfileIds(html))
   expect(selectProfileIds(html.replace(/data-testid="stats-settledBetsNumber"/g,'data-testid="missing"')).status).toBe('ambiguous')
  })
 }
 for(const slug of ['AnonymousPronos','Focusgoalaway']){
  it(`${slug}: distinct raw/settled counters remain valid with exact months corroboration`,()=>{
   const html=f(`b2i-card-${slug}.html`)
   const sel=selectProfileIds(html)
   expect(sel.status).toBe('selected')
   if(sel.status!=='selected')throw Error('selected')
   const cur=extractBankrollBlocks(html)!.find(b=>b.bankrollId===sel.ids.publicBankrollId)!.current!
   expect(cur.betsNumber).not.toBe(cur.settledBetsNumber)
   const m=parseMonthsResponse(JSON.parse(f(`b2i-months-${slug}.json`)))!
   expect(selectedBankrollMonthsClose(cur,m)).toBe(true)
   expect(selectedBankrollMonthsClose(cur,null)).toBe(false)
   expect(selectedBankrollMonthsClose(cur,m.map((r,i)=>i===0?{...r,bets:r.bets+1}:r))).toBe(false)
  })
 }
 it('does not broaden existing multi-bankroll identity gate for Gerganaana',()=>{
  expect(buildOfflineRow({ slug: 'Gerganaana', html: f('b2i-select-multi-candidate.html'), monthsJson: null, capturedAt: at, surrogateId: -1 }).status).toBe('not-selected')
 })
})
describe('verified payload ROI precision, not wider header tolerance',()=>{
 for(const slug of ['CLVEdge','Romeo1987']){
  it(`${slug}: selected bankroll settled/profit identity and four-decimal ROI interval`,()=>{
   const html=f(`b2i-card-${slug}.html`)
   const selected=selectProfileIds(html)
   if(selected.status!=='selected')throw Error('selected expected')
   const block=extractBankrollBlocks(html)!.find(b=>b.bankrollId===selected.ids.publicBankrollId)!
   const m=parseMonthsResponse(JSON.parse(f(`b2i-months-${slug}.json`)))!
   const current=block.current!
   expect(current.settledBetsNumber).toBe(displayedStatNumber(html,'settledBetsNumber'))
   expect(monthsCloseWithTotals(m,current.settledBetsNumber!,current.profit!,'full')).toBe(true)
   const ctx={headerRoiPct:displayedStatNumber(html,'roi'),lastReset:block.lastReset,selected:true}
   expect(windowYieldOrNull(m,12,at,ctx).reason).toBe('meses-no-reproducen-roi-de-cabecera')
   const verified=windowYieldOrNull(m,12,at,{...ctx,payloadRoiPct:current.roi})
   if(slug==='CLVEdge')expect(verified.reason).toBe('ventana-solapa-reinicio-semantica-no-verificada')
   else expect(verified.value).toBe('-3.14')
   expect(windowYieldOrNull(m,12,at,{...ctx,payloadRoiPct:current.roi!+0.0002}).value).toBeNull()
   expect(windowYieldOrNull(m,12,at,{...ctx,payloadRoiPct:null}).value).toBeNull()
  })
 }
})
