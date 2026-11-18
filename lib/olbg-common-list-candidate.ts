// Inert common-list integration pipeline. Callers provide ALL baseline cards
// before pagination. Never append OLBG to an already paginated SQL page.
// Production SSR/API do not import this module yet.
import type {TipsterCardData} from '@/components/tipster-card-model'
import {fromPublishedOlbgMonth} from '@/components/olbg-monthly-card-model'
import {latestAvailableMonth,queryPublishedMonths,type MonthlyQuery} from './olbg-published-monthly'
import type {MonthlySnapshot} from './olbg-published-monthly-loader'

export interface CommonMonthlyRequest {
 search?:string
 order:'name'|'yield-desc'|'olbg-roi-desc'|'olbg-profit-desc'|'olbg-picks-desc'
 monthly:Omit<MonthlyQuery,'order'>
 minCommonYield?:number
 pageSize:number
 cursor?:string
}
export interface CommonListEntry {key:string;card:TipsterCardData}
export interface CommonListPage {rows:CommonListEntry[];total:number;nextCursor:string|null;revision:string;scopeNote:string}
const key=(c:TipsterCardData)=>`${c.platform}:${c.sourceUrl}`
function queryIdentity(q:CommonMonthlyRequest):string{
 return JSON.stringify({search:q.search??'',order:q.order,month:q.monthly.month,minResultMonths:q.monthly.minResultMonths??null,
  roiMin:q.monthly.roiMin??null,profitMin:q.monthly.profitMin??null,picksMin:q.monthly.picksMin??null,
  minCommonYield:q.minCommonYield??null,pageSize:q.pageSize})
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
 const selected=queryPublishedMonths(snapshot.profiles,{...q.monthly,order:monthlyOrder})
 let rows:CommonListEntry[]=[
  ...baseline.filter(x=>x.card.platform!=='olbg'&&!monthlyOnly),
  ...selected.map(p=>{const card=fromPublishedOlbgMonth(p,q.monthly.month==='latest-available'?latestAvailableMonth(p):q.monthly.month);return {key:key(card),card}})
 ]
 const unique=new Set<string>()
 for(const r of rows){if(unique.has(r.key))throw Error('Duplicate common-list key');unique.add(r.key)}
 if(q.search){const term=q.search.toLocaleLowerCase();rows=rows.filter(r=>r.card.name.toLocaleLowerCase().includes(term))}
 if(q.minCommonYield!==undefined)rows=rows.filter(r=>r.card.yieldPct!==null&&r.card.yieldPct>=q.minCommonYield!)
 if(q.order==='name')rows.sort((a,b)=>a.card.name.localeCompare(b.card.name)||a.key.localeCompare(b.key))
 if(q.order==='yield-desc')rows.sort((a,b)=>{
  const av=a.card.yieldPct,bv=b.card.yieldPct
  if(av===null&&bv!==null)return 1
  if(av!==null&&bv===null)return -1
  return (av===null||bv===null?0:bv-av)||a.key.localeCompare(b.key)
 })
 const total=rows.length,hasMore=start+q.pageSize<total
 return {rows:rows.slice(start,start+q.pageSize),total,revision,
  nextCursor:hasMore?JSON.stringify({revision,query:identity,offset:start+q.pageSize}):null,
  scopeNote:monthlyOnly?'Filtro y orden de resultados mensuales publicados OLBG, solo del mes indicado. No ranking cruzado de yield histórico.':'Listado común. Resultados OLBG mensuales con su mes visible; no son yield histórico común.'}
}
