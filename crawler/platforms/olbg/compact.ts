import { recordSummaries, previousMonth, type OlbgMonthlyRecord } from './monthly-record'
export interface OlbgCompact {
 version:1; formula:'global-fixed-unit-v1'; profileId:number; profileUrl:string; capturedAt:string; sourceMonth:string; snapshotHash:string
 windows: { n:3|6|12; from:string; through:string; tips:number|null; lsp:number|null; present:number; missing:string[] }[]
}
export function compactOlbg(r:OlbgMonthlyRecord,snapshotHash:string):OlbgCompact {
 return {version:1,formula:'global-fixed-unit-v1',profileId:r.profileId,profileUrl:r.profileUrl,capturedAt:r.capturedAt,sourceMonth:r.sourceMonth,snapshotHash,
  windows:recordSummaries(r).map(s=>({n:s.closedMonths,from:s.fromMonth,through:s.throughMonth,tips:s.tips,lsp:s.levelStakeProfit,present:s.presentMonths.length,missing:[...s.missingMonths]}))}
}
export function validCompactOlbg(x:unknown, publicProjection=false):x is OlbgCompact {
 try{
  const c=x as OlbgCompact
  if(!c||c.version!==1||c.formula!=='global-fixed-unit-v1'||!Number.isSafeInteger(c.profileId)||c.profileId<=0||!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.sourceMonth)||new Date(c.capturedAt).toISOString()!==c.capturedAt||c.capturedAt.slice(0,7)!==c.sourceMonth||(!publicProjection&&!/^[a-f0-9]{64}$/.test(c.snapshotHash))||c.profileUrl!==`https://www.olbg.com/tipsters/about/${c.profileId}`||!Array.isArray(c.windows)||c.windows.length!==3)return false
  return ([3,6,12]as const).every((n,i)=>{
   const w=c.windows[i],end=previousMonth(c.sourceMonth),d=new Date(end+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-n+1)
   if(w.n!==n||w.from!==d.toISOString().slice(0,7)||w.through!==end||!Number.isSafeInteger(w.present)||w.present<0||w.present>n||!Array.isArray(w.missing)||w.missing.length!==n-w.present||new Set(w.missing).size!==w.missing.length)return false
   if(w.missing.some(m=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)||m<w.from||m>end))return false
   if(w.missing.length)return w.tips===null&&w.lsp===null
   return Number.isSafeInteger(w.tips)&&w.tips!>=0&&typeof w.lsp==='number'&&Number.isFinite(w.lsp)&&(w.tips!==0||w.lsp===0)
  })
 }catch{return false}
}
