// Candidate mount for EXISTING home/API paths, non-production opt-in only.
// Reads complete baseline through normal read context; never writes DB.
import {and,ne} from 'drizzle-orm'
import {semanticBaselineRevision,publishedEstimateRoutesEnabled} from './olbg-release-read-guard'
import {db} from '@/db'
import {tipsters} from '@/db/schema'
import {tipsterReadContext} from './tipster-read-context'
import {loadDatabasePeriodAudits} from './bet2invest-period-index'
import {loadCommonPublishedMonthlyPage} from './olbg-common-list-loader'
import type {TipsterFilters,SortField} from './query'
import type {CommonMonthlyRequest} from './olbg-common-list-candidate'
import type {TipsterReadRow} from '@/components/tipster-card-model'
export const monthlyExistingRoutesEnabled=publishedEstimateRoutesEnabled
export function monthlyExistingRequest(p:URLSearchParams,filters:TipsterFilters,sort:SortField):CommonMonthlyRequest{
 const n=(k:string)=>p.has(k)&&p.get(k)!==''?Number(p.get(k)):undefined
 const estimate=p.get('olbgView')!=='monthly'&&!p.has('olbgMonthlyOrder')&&!p.has('olbgRoiMin')&&!p.has('olbgProfitMin')&&!p.has('olbgPicksMin')
 const order=p.get('olbgMonthlyOrder')
 if(order&&!['roi-desc','profit-desc','picks-desc'].includes(order))throw Error('Invalid monthly order')
 return {estimate,minCommonPicks:estimate?filters.minPicks:undefined,order:order?`olbg-${order}` as CommonMonthlyRequest['order']:sort==='yield'?'yield-desc':sort,
  monthly:{month:p.get('olbgMonth')??'latest-available',roiMin:n('olbgRoiMin'),profitMin:n('olbgProfitMin'),picksMin:n('olbgPicksMin'),minResultMonths:n('olbgResultMonths')},
  search:filters.search,minCommonYield:filters.minYield,maxCommonYield:filters.maxYield,pageSize:50,cursor:p.get('monthlyCursor')??undefined,
  baselineFilterKey:JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)))),
  // Monthly picks are not lifetime picks; unknown type/activity cannot pass.
  excludeMonthly:!!(filters.platform&&filters.platform!=='olbg'||filters.tipo&&filters.tipo!=='all'||!estimate&&filters.minPicks!==undefined||filters.activityMonths!==undefined)}
}
export async function readMonthlyExistingRoutes(p:URLSearchParams,filters:TipsterFilters,sort:SortField,at:Date){
 if(!monthlyExistingRoutesEnabled())throw Error('Existing-route monthly candidate disabled')
 const file=process.env.OLBG_MONTHLY_SNAPSHOT_FILE,digest=process.env.OLBG_MONTHLY_SNAPSHOT_SHA256
 if(!file||!digest)throw Error('Pinned monthly source required')
 const context=await tipsterReadContext(await loadDatabasePeriodAudits(at),at)
 if(context.changedSinceAnchor)throw Error('Evidence updated after pagination anchor')
 const read=async()=>{
  // SQL applies the existing filter contract to other platforms. Complete
  // matching baseline is loaded, never LIMIT/OFFSET before combined sorting.
  const conditions=[...context.filters(filters),ne(tipsters.platform,'olbg')]
  const rows=await db.select(context.projection).from(tipsters).leftJoin(context.base.source,context.base.joinOn).leftJoin(context.olbg.source,context.olbg.joinOn)
   .where(and(...conditions)).orderBy(...context.order(sort))
  const revision=semanticBaselineRevision(rows)
  return {rows:rows as TipsterReadRow[],revision,complete:true as const,readAt:at.toISOString()}
 }
 const request=monthlyExistingRequest(p,filters,sort)
 const page=await loadCommonPublishedMonthlyPage({monthlyFile:file,monthlySha256:digest,request,readBaseline:read,
  // One SELECT is a coherent PostgreSQL statement snapshot. The next page
  // performs a fresh SELECT and compares its semantic digest to the cursor.
  atomicStatementSnapshot:true,sourceContextUnchanged:()=>context.revisionUnchanged(),
  baselineUnchanged:async revision=>await context.revisionUnchanged()&&(await read()).revision===revision})
 return {page,estimated:request.estimate,warnings:context.warnings(filters)}
}
