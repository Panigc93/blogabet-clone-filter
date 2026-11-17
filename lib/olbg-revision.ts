import { olbgRecordDigest } from '@/crawler/platforms/olbg/persistence-plan'
import type { OlbgMonthlyRecord } from '@/crawler/platforms/olbg/monthly-record'
interface State { status:string; rejected:number; records:OlbgMonthlyRecord[] }
export function makeOlbgRevisionGuard(initial:State,anchor:Date,clock:()=>Date,load:()=>Promise<State>){
 const revision=(s:State)=>JSON.stringify([s.status,s.rejected,s.records.map(r=>[r.profileId,r.capturedAt,olbgRecordDigest(r)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])
 const first=revision(initial)
 return {
  changedSinceAnchor:initial.records.some(r=>r.capturedAt>anchor.toISOString()),
  revisionUnchanged:async()=>anchor.toISOString().slice(0,7)===clock().toISOString().slice(0,7)&&first===revision(await load()),
 }
}
