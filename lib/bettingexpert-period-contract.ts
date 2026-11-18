// Pure browser-safe compact contract. Private raw ledger/gate GUIDs never leave server.
export const BE_PERIODS=[3,6,12] as const
export type BEWindow={value:string|null;reason:string|null;picks:number|null;profit:string|null;stake:string|null;from:string;to:string}
export interface BEAudit{guid:string;slug:string;globalCapturedAt:string;periodCapturedAt:string;anchorCapturedAt:string;evidenceSha256:string;windows:Record<3|6|12,BEWindow>}
const iso=(s:unknown):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s
const number=(s:unknown):s is string=>typeof s==='string'&&/^-?\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))
export function beBounds(at:Date,n:number){const y=at.getUTCFullYear(),m=at.getUTCMonth();return{from:new Date(Date.UTC(y,m-n,1)).toISOString().slice(0,7),to:new Date(Date.UTC(y,m-1,1)).toISOString().slice(0,7)}}
export function validBEAudit(a:unknown):a is BEAudit{
 if(!a||typeof a!=='object')return false
 const r=a as BEAudit
 if(!/^[0-9a-f-]{36}$/.test(r.guid)||!r.slug?.trim()||!iso(r.globalCapturedAt)||!iso(r.periodCapturedAt)||!iso(r.anchorCapturedAt)||r.anchorCapturedAt<r.periodCapturedAt||!/^[a-f0-9]{64}$/.test(r.evidenceSha256)||!r.windows)return false
 return BE_PERIODS.every(n=>{const w=r.windows[n],b=beBounds(new Date(r.periodCapturedAt),n);if(!w||w.from!==b.from||w.to!==b.to)return false
 if(w.reason!==null)return typeof w.reason==='string'&&w.reason.length>0&&[w.value,w.picks,w.profit,w.stake].every(x=>x===null)
 return Number.isSafeInteger(w.picks)&&w.picks!>0&&number(w.profit)&&number(w.stake)&&Number(w.stake)>0&&number(w.value)&&Math.abs(Number(w.value)-100*Number(w.profit)/Number(w.stake))<1e-8
 })
}
export function beEligible(r:unknown,slug:string,globalAt:Date|string|null,now:Date):r is BEAudit{return validBEAudit(r)&&r.slug===slug&&!!globalAt&&Number.isFinite(new Date(globalAt).getTime())&&new Date(globalAt).toISOString()===r.globalCapturedAt&&r.globalCapturedAt<=now.toISOString()&&r.periodCapturedAt<=now.toISOString()&&r.anchorCapturedAt<=now.toISOString()&&r.periodCapturedAt.slice(0,7)===now.toISOString().slice(0,7)&&r.anchorCapturedAt.slice(0,7)===now.toISOString().slice(0,7)}
export function beClientAudit(r:BEAudit){return{slug:r.slug,globalCapturedAt:r.globalCapturedAt,periodCapturedAt:r.periodCapturedAt,anchorCapturedAt:r.anchorCapturedAt,windows:r.windows}}
export type BEClientAudit=ReturnType<typeof beClientAudit>
export function beClientEligible(r:BEClientAudit|undefined|null,slug:string,globalAt:Date|string|null,now:Date){return !!r&&beEligible({...r,guid:'00000000-0000-4000-8000-000000000000',evidenceSha256:'0'.repeat(64)},slug,globalAt,now)}
