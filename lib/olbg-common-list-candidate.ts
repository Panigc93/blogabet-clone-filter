// Inert common-list integration pipeline. Callers provide ALL baseline cards
// before pagination. Never append OLBG to an already paginated SQL page.
// Existing SSR/API use this only behind the disabled non-production gate.
import type {TipsterCardData} from '@/components/tipster-card-model'
import {fromPublishedOlbgMonth,fromEstimatedOlbgProfile} from '@/components/olbg-monthly-card-model'
import {latestAvailableMonth,queryPublishedMonths,type MonthlyQuery} from './olbg-published-monthly'
import type {MonthlySnapshot} from './olbg-published-monthly-loader'

export interface CommonMonthlyRequest {
 search?:string
 order:'name'|'yield-desc'|'olbg-roi-desc'|'olbg-profit-desc'|'olbg-picks-desc'|'profit'|'picks'|'followers'|'since_year'|'price'|'yield3m'|'yield6m'|'yield12m'|'picks6m_avg'
 monthly:Omit<MonthlyQuery,'order'>
 estimate?:boolean
 minCommonPicks?:number
 minCommonYield?:number
 maxCommonYield?:number
 excludeMonthly?:boolean
 // Activity evidence for the monthly source: a profile passes N months when
 // it has picks in any of the N complete months before its capture month;
 // activityUnknown keeps profiles WITHOUT picks in the latest complete month.
 activityMonths?:number
 activityUnknown?:boolean
 activityReferenceMonth?:string
 baselineFilterKey?:string
 pageSize:number
 cursor?:string
}
export interface CommonListEntry {key:string;card:TipsterCardData;sortValues?:Record<string,number|null>;profitUnit?:string;baselineRank?:number}
export interface CommonListPage {rows:CommonListEntry[];total:number;nextCursor:string|null;revision:string;scopeNote:string;availableMonths:string[]}
const key=(c:TipsterCardData)=>`${c.platform}:${c.sourceUrl}`
function queryIdentity(q:CommonMonthlyRequest):string{
 return JSON.stringify({estimateMethod:'global-midpoint-profit1-max2-v1',search:q.search??'',order:q.order,month:q.monthly.month,minResultMonths:q.monthly.minResultMonths??null,
  roiMin:q.monthly.roiMin??null,profitMin:q.monthly.profitMin??null,picksMin:q.monthly.picksMin??null,
  estimate:q.estimate??false,minCommonPicks:q.minCommonPicks??null,minCommonYield:q.minCommonYield??null,maxCommonYield:q.maxCommonYield??null,excludeMonthly:q.excludeMonthly??false,activityMonths:q.activityMonths??null,activityUnknown:q.activityUnknown??false,activityReferenceMonth:q.activityReferenceMonth??null,baselineFilterKey:q.baselineFilterKey??null,pageSize:q.pageSize})
}
export function commonMonthlyPage(baseline:CommonListEntry[],baselineRevision:string,snapshot:MonthlySnapshot,q:CommonMonthlyRequest):CommonListPage{
 if(!Number.isSafeInteger(q.pageSize)||q.pageSize<1||q.pageSize>200)throw Error('Invalid page size')
 if(q.minCommonYield!==undefined&&!Number.isFinite(q.minCommonYield))throw Error('Invalid common yield filter')
 if(!baselineRevision||!snapshot.revision)throw Error('Pinned revisions required')
 const revision=JSON.stringify([baselineRevision,snapshot.revision])
 const identity=queryIdentity(q)
 let start=0
 if(q.cursor){
  let cursor:{revision:string;query:string;offset:number}
  try{cursor=JSON.parse(q.cursor)}catch{throw Error('Invalid cursor')}
  if(cursor.revision!==revision||cursor.query!==identity)throw Error('Snapshot or query changed; restart pagination')
  if(!Number.isSafeInteger(cursor.offset)||cursor.offset<0)throw Error('Invalid cursor offset')
  start=cursor.offset
 }
 const monthlyOnly=q.order.startsWith('olbg-')||q.monthly.roiMin!==undefined||q.monthly.profitMin!==undefined||q.monthly.picksMin!==undefined||q.monthly.minResultMonths!==undefined&&q.monthly.minResultMonths>0
 const monthlyOrder:MonthlyQuery['order']=q.order==='olbg-roi-desc'?'roi-desc':q.order==='olbg-profit-desc'?'profit-desc':q.order==='olbg-picks-desc'?'picks-desc':'name'
 const selected0=queryPublishedMonths(snapshot.profiles,{...q.monthly,minResultMonths:q.estimate?undefined:q.monthly.minResultMonths,order:monthlyOrder}).filter(p=>!q.estimate||q.monthly.minResultMonths===undefined||p.months.filter(m=>m.month<p.capturedAt.slice(0,7)&&m.picks>0).length>=q.monthly.minResultMonths)
 // Activity over complete months before the capture month (never the capture
 // month itself: it may be partial). Months are 'YYYY-MM'; lexical shift is
 // exact for calendar months.
 const shiftMonth=(ym:string,delta:number)=>{const y=+ym.slice(0,4),m=+ym.slice(5,7)+delta;const t=new Date(Date.UTC(y,m-1,1));return t.toISOString().slice(0,7)}
 const activeInWindow=(p:(typeof selected0)[number],n:number)=>{const cap=p.capturedAt.slice(0,7);if(q.activityReferenceMonth&&cap!==q.activityReferenceMonth)return false;const lo=shiftMonth(cap,-n);return p.months.some(m=>m.picks>0&&m.month>=lo&&m.month<cap)}
 const selected=q.activityMonths!==undefined?selected0.filter(p=>activeInWindow(p,q.activityMonths!))
  :q.activityUnknown?selected0.filter(p=>!activeInWindow(p,1)):selected0
 let rows:CommonListEntry[]=[
  ...baseline.filter(x=>x.card.platform!=='olbg'&&!monthlyOnly),
  ...(q.excludeMonthly?[]:selected).map(p=>{const card=(q.estimate?fromEstimatedOlbgProfile:fromPublishedOlbgMonth)(p,q.monthly.month==='latest-available'?latestAvailableMonth(p):q.monthly.month);return {key:key(card),card,profitUnit:'olbg-published-unknown-scale',sortValues:{since_year:card.sinceYear,picks:card.picks,profit:card.olbgEstimates?.global.profitSource??null,yield6m:card.olbgEstimates?.six.centralPct??null,yield12m:card.olbgEstimates?.twelve.centralPct??null,picks6m_avg:card.olbgEstimates?.six.missingMonths.length===0&&card.olbgEstimates.six.monthsUsed.length===6?card.olbgEstimates.six.picks/6:null}}})
 ]
 if(q.minCommonPicks!==undefined){if(!Number.isFinite(q.minCommonPicks))throw Error('Invalid picks filter');rows=rows.filter(r=>q.baselineFilterKey!==undefined&&r.baselineRank!==undefined||r.card.picks!==null&&r.card.picks>=q.minCommonPicks!)}
 const unique=new Set<string>()
 for(const r of rows){if(unique.has(r.key))throw Error('Duplicate common-list key');unique.add(r.key)}
 if(q.search){const term=q.search.toLocaleLowerCase();rows=rows.filter(r=>q.baselineFilterKey!==undefined&&r.baselineRank!==undefined||r.card.name.toLocaleLowerCase().includes(term))}
 if(q.minCommonYield!==undefined)rows=rows.filter(r=>q.baselineFilterKey!==undefined&&r.baselineRank!==undefined||r.card.yieldPct!==null&&r.card.yieldPct>=q.minCommonYield!)
 if(q.maxCommonYield!==undefined){if(!Number.isFinite(q.maxCommonYield))throw Error('Invalid yield filter');rows=rows.filter(r=>q.baselineFilterKey!==undefined&&r.baselineRank!==undefined||r.card.yieldPct!==null&&r.card.yieldPct<=q.maxCommonYield!)}
 if(q.order==='name')rows.sort((a,b)=>a.card.name.localeCompare(b.card.name)||a.key.localeCompare(b.key))
 if(q.order==='yield-desc')rows.sort((a,b)=>{
  if(q.baselineFilterKey!==undefined&&a.baselineRank!==undefined&&b.baselineRank!==undefined)return a.baselineRank-b.baselineRank
  const av=a.card.yieldPct,bv=b.card.yieldPct
  if(av===null&&bv!==null)return 1
  if(av!==null&&bv===null)return -1
  return (av===null||bv===null?0:bv-av)||a.key.localeCompare(b.key)
 })
 if(!['name','yield-desc'].includes(q.order)&&!q.order.startsWith('olbg-'))rows.sort((a,b)=>{
  if(q.baselineFilterKey!==undefined&&a.baselineRank!==undefined&&b.baselineRank!==undefined)return a.baselineRank-b.baselineRank
  if(q.order==='profit'){const u=(a.profitUnit??'').localeCompare(b.profitUnit??'');if(u)return u}
  const av=a.sortValues?.[q.order]??null,bv=b.sortValues?.[q.order]??null
  if(av===null&&bv!==null)return 1
  if(av!==null&&bv===null)return -1
  return (av===null||bv===null?0:bv-av)||a.key.localeCompare(b.key)
 })
 const total=rows.length,hasMore=start+q.pageSize<total
 return {rows:rows.slice(start,start+q.pageSize),total,revision,availableMonths:Array.from(new Set(snapshot.profiles.flatMap(p=>p.months.map(m=>m.month)))).sort().reverse(),
  nextCursor:hasMore?JSON.stringify({revision,query:identity,offset:start+q.pageSize}):null,
  scopeNote:q.estimate?'':monthlyOnly?'Filtro y orden de resultados mensuales publicados OLBG, solo del mes indicado. No ranking cruzado de yield histórico.':'Listado común. Resultados OLBG mensuales con su mes visible; no son yield histórico común.'}
}
