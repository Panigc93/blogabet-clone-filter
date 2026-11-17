import { sql,ne,or,inArray } from 'drizzle-orm'
import { olbgActivation, OLBG_PILOT_IDS } from './olbg-activation'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { periodReadContext } from './bet2invest-period-read'
import { olbgReadContext } from './olbg-read-context'
import { compactRevisionGuard,type OlbgRevision } from './olbg-revision'
import type { PeriodAudit } from './bet2invest-period-contract'
import type { TipsterFilters } from './query'
export function olbgLocalReviewEnabled(env:{OLBG_LOCAL_REVIEW?:string;USE_PGLITE?:string}={OLBG_LOCAL_REVIEW:process.env.OLBG_LOCAL_REVIEW,USE_PGLITE:process.env.USE_PGLITE}){
 return env.OLBG_LOCAL_REVIEW==='1'&&env.USE_PGLITE==='1'
}
async function loadRevision():Promise<OlbgRevision>{
 try{
  const rows=await db.select({revision:sql<string>`revision::text`,changedAt:sql<Date>`changed_at`}).from(sql`olbg_revision`).where(sql`singleton=true`).limit(2)
  if(rows.length!==1||!/^\d+$/.test(rows[0].revision))throw Error('Revision unavailable')
  return {status:'ok',revision:rows[0].revision,changedAt:new Date(rows[0].changedAt).toISOString()}
 }catch{return {status:'unavailable',revision:'',changedAt:''}}
}
export function olbgVisibilityFilter(activation:ReturnType<typeof olbgActivation>){
 return activation==='disabled'?ne(tipsters.platform,'olbg'):activation==='pilot-three'?or(ne(tipsters.platform,'olbg'),inArray(tipsters.slug,[...OLBG_PILOT_IDS]))!:undefined
}
export async function tipsterReadContext(audits:PeriodAudit[],now:Date){
 const base=periodReadContext(audits,now),activation=olbgActivation(),enabled=activation!=='disabled'
 const state:OlbgRevision=enabled?await loadRevision():{status:'disabled',revision:'',changedAt:''}
 const guard=compactRevisionGuard(state,now,()=>new Date(),loadRevision)
 const olbg=olbgReadContext(base,enabled&&state.status==='ok',now)
 return {
  base,olbg,projection:olbg.projection,order:olbg.order,enabled,
  revisionToken:state.status==='ok'?state.revision:null,
  changedSinceAnchor:enabled&&guard.changedSinceAnchor,
  revisionUnchanged:async()=>!enabled||guard.revisionUnchanged(),
  filters:(p:TipsterFilters)=>{const visibility=olbgVisibilityFilter(activation);return [...olbg.filters(p),...visibility?[visibility]:[]]},
  warnings:(p:TipsterFilters)=>enabled&&(p.platform===undefined||p.platform==='olbg')?[...olbg.warnings(p),...state.status==='ok'?[]:['OLBG: evidencia mensual no disponible; valores no confirmados ocultos.']]:[],
  state:state.status,
 }
}
