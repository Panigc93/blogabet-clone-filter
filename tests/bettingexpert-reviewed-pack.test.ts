import {createHash}from 'node:crypto'
import {it,expect}from 'vitest'
import {prepareReviewedBEWindows,BE_WINDOW_BASIS,type BEReviewedManifest}from '@/crawler/platforms/bettingexpert/prepare-reviewed-windows'
import {fromDbTipster}from '@/components/tipster-card-model'
import {beClientAudit}from '@/lib/bettingexpert-period-contract'
const at='2026-11-18T08:00:00.000Z',anchor='2026-11-18T09:00:00.000Z',now=new Date('2026-11-18T10:00:00Z')
function fixture(i:number,accepted:number){
 const g={ok:true,guid:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,username:'Sample'+i,scope:'profile-overall',profitUnit:'bettingexpert-points',capturedAt:at}
 const windows:any={},reconciliation:any={};for(const [index,n]of [3,6,12].entries()){
  const valid=index<accepted;windows[n+'m']={reason:valid?null:'unresolved_source_count',picks:valid?2:null,profit:valid?'2':null,stake:valid?'10':null,yield:valid?'20':null,from:n===3?'2026-08':n===6?'2026-05':'2025-11',to:'2026-10'}
  if(valid)reconciliation[n+'m']={ledger_closed_count:2,official_anchor_count_delta:2,ledger_net_profit:'2',official_anchor_profit_delta:'2',period_captured_at:at,anchor_response_ended_utc:anchor}
 }
 return JSON.stringify({productionReady:false,captureScopesSeparate:true,identity:{guid:g.guid,username:g.username},global:g,periods:{user_guid:g.guid,username:g.username,scope:'published-closed-window',profitUnit:g.profitUnit,allTimePatch:null,isWinValidated:false,periodCapturedAt:at,evidenceSha256:'a'.repeat(64),audit:windows,windowReconciliation:reconciliation}})
}
function inputs(){const bytes=Array.from({length:18},(_,i)=>fixture(i+1,i<13?3:i<17?2:1));const manifest:BEReviewedManifest={version:1,basis:BE_WINDOW_BASIS,sourceMonth:'2026-11',expectedRows:18,expectedWindows:48,sources:bytes.map(s=>{const g=JSON.parse(s).global;return{slug:g.username,guid:g.guid,stagedSha256:createHash('sha256').update(s).digest('hex')}})};return{bytes,manifest}}
it('prepares an exact18-row48-window index without filling any held window or absent identity',()=>{
 const {bytes,manifest}=inputs();const r=prepareReviewedBEWindows(manifest,bytes,now.toISOString());expect(r.summary).toMatchObject({rows:18,windows:48,productionReady:false,absentWindowPolicy:'NULL'});expect(r.rows.find(x=>x.slug==='Sample18')!.windows[6].value).toBeNull();expect(r.rows.some(x=>x.slug==='Missing')).toBe(false)
 expect(prepareReviewedBEWindows(manifest,bytes,now.toISOString()).revision).toBe(r.revision)
})
it('rejects changed bytes, wrong identity/month, missing review source, duplicate identity and different accepted count',()=>{
 const {bytes,manifest}=inputs();expect(()=>prepareReviewedBEWindows(manifest,[bytes[0]+' ',...bytes.slice(1)],now.toISOString())).toThrow('bytes differ')
 expect(()=>prepareReviewedBEWindows({...manifest,expectedWindows:49},bytes,now.toISOString())).toThrow('count mismatch')
 expect(()=>prepareReviewedBEWindows({...manifest,sourceMonth:'2026-12'},bytes,now.toISOString())).toThrow('month mismatch')
 expect(()=>prepareReviewedBEWindows({...manifest,sources:manifest.sources.slice(1)},bytes,now.toISOString())).toThrow('manifest')
 const sources=[{...manifest.sources[0],slug:'Wrong'},...manifest.sources.slice(1)];expect(()=>prepareReviewedBEWindows({...manifest,sources},bytes,now.toISOString())).toThrow('identity/month')
 expect(()=>prepareReviewedBEWindows({...manifest,sources:[manifest.sources[0],manifest.sources[0],...manifest.sources.slice(2)]},bytes,now.toISOString())).toThrow('duplicate')
})
it('shows a faithful BE-only publication/UTC/stake explanation, no official-yield claim, no trace table',()=>{
 const {bytes,manifest}=inputs();const pack=prepareReviewedBEWindows(manifest,bytes,now.toISOString());const a=pack.rows.find(x=>x.slug==='Sample18')!;const row:any={platform:'bettingexpert',slug:a.slug,name:a.slug,capturedAt:at,profit:'2',yield:'20',picks:2,beAudit:beClientAudit(a)}
 const card=fromDbTipster(row,now);expect(card.yield3m.trace).toContain('stake aconsejado 10');expect(card.yield3m.trace).toContain('no yield')
 expect(card.periodBasisNote).toContain('Reconstrucción por publicación');expect(card.periodBasisNote).toContain('meses cerrados UTC');expect(card.periodBasisNote).toContain('No es el resultado mensual de competición');expect(card.yield6m.valuePct).toBeNull();expect(card.picks6mTrace).toBeNull();const full=fromDbTipster({...row,slug:pack.rows.find(x=>x.slug==='Sample1')!.slug,beAudit:beClientAudit(pack.rows.find(x=>x.slug==='Sample1')!)},now);expect(full.picks6mAvg).toBe(2/6);expect(full.picks6mTrace).toContain('2 apuestas cerradas / 6 meses completos UTC');expect(full.picks6mTrace).toContain('No son meses positivos')
 const masked=fromDbTipster({...row,beAudit:undefined},now);expect(masked.showPeriodRow).toBe(false);expect(masked.yield3m.valuePct).toBeNull()
 const other=fromDbTipster({...row,platform:'blogabet'},now);expect(other.periodBasisNote).toBeUndefined()
})
