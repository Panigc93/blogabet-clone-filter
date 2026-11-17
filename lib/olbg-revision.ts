export interface OlbgRevision { status:'ok'|'unavailable'|'disabled'; revision:string; changedAt:string }
export function compactRevisionGuard(initial:OlbgRevision,anchor:Date,clock:()=>Date,load:()=>Promise<OlbgRevision>){
 return {
  changedSinceAnchor:initial.status==='ok'&&initial.changedAt>anchor.toISOString(),
  revisionUnchanged:async()=>{
   if(anchor.toISOString().slice(0,7)!==clock().toISOString().slice(0,7))return false
   const next=await load()
   return initial.status===next.status&&initial.revision===next.revision
  },
 }
}
