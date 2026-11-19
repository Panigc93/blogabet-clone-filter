import {beProductionReleaseEnabled,loadBEProductionRelease} from './bettingexpert-release-database'
import {releaseDigest} from './bettingexpert-release-artifact'
import {beExistingReadContext} from './bettingexpert-existing-read'
import {beReadContext} from './bettingexpert-period-read'
import {loadBEPeriodIndex} from './bettingexpert-period-index'
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
async function beLocalSnapshotRevision(){
 const rows=await db.select({value:sql<string>`md5(COALESCE((SELECT string_agg(to_jsonb(t)::text,'' ORDER BY t.id) FROM tipsters t WHERE t.platform='bettingexpert'),'') || COALESCE((SELECT string_agg(to_jsonb(l)::text,'' ORDER BY l.id) FROM import_validation_log l WHERE l.platform='bettingexpert' AND l.class='accepted[profile-overall]'),''))`}).from(sql`(SELECT 1) be_snapshot`)
 if(rows.length!==1)throw Error('BE snapshot unavailable')
 return rows[0].value
}
export async function tipsterReadContext(audits:PeriodAudit[],now:Date){
 const beIndex=await loadBEPeriodIndex()
 const original=periodReadContext(audits,now),be=beReadContext(original,beIndex.rows,now)
 const base={...be,source:original.source,joinOn:original.joinOn},activation=olbgActivation(),enabled=activation!=='disabled'
 const state:OlbgRevision=enabled?await loadRevision():{status:'disabled',revision:'',changedAt:''}
 const guard=compactRevisionGuard(state,now,()=>new Date(),loadRevision)
 const olbg=olbgReadContext(base,enabled&&state.status==='ok',now)
 const releaseRequested=beProductionReleaseEnabled()
 const release=releaseRequested?await loadBEProductionRelease().catch(()=>undefined):undefined
 const unavailable=releaseRequested&&!release
 const research=beExistingReadContext(olbg,now,process.env,release,unavailable)
 const beSnapshot=research.enabled?await beLocalSnapshotRevision():null
 const beRevision=research.revision?research.revision+':'+beSnapshot:beIndex.revision
 return {
  base,be,olbg,research,beRevision,projection:research.projection,order:research.order,enabled,
  revisionToken:state.status==='ok'?state.revision:null,
  changedSinceAnchor:(enabled&&guard.changedSinceAnchor)||!!(beIndex.updatedAt&&new Date(beIndex.updatedAt)>now),
  revisionUnchanged:async()=>await (async()=>!enabled||guard.revisionUnchanged())() && (await loadBEPeriodIndex()).revision===beIndex.revision && research.unchanged() && (!release||releaseDigest(await loadBEProductionRelease())===releaseDigest(release)) && (!research.enabled || await beLocalSnapshotRevision()===beSnapshot),
  filters:(p:TipsterFilters)=>{const visibility=olbgVisibilityFilter(activation);return [...research.filters(p),...visibility?[visibility]:[]]},
  warnings:(p:TipsterFilters)=>unavailable&&(p.platform===undefined||p.platform==='bettingexpert')?['Bettingexpert: períodos no disponibles; Global conservado.']:enabled&&(p.platform===undefined||p.platform==='olbg')?[...olbg.warnings(p),...state.status==='ok'?[]:['OLBG: evidencia mensual no disponible; valores no confirmados ocultos.']]:[],
  state:state.status,
 }
}
