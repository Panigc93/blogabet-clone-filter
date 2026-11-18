import {unknownOlbgCard} from './olbg-card-model'
import {selectPublishedMonth,type PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
import type {TipsterCardData} from './tipster-card-model'
// Explicit separate entry point, not wired to production fromDbTipster.
export function fromPublishedOlbgMonth(p:PublishedMonthlyProfile,month:string):TipsterCardData{
 const monthly=selectPublishedMonth(p,month)
 return {...unknownOlbgCard(p.name,String(p.id),p.joinedAt),
  sourceUrl:p.sourceUrl,sourceLabel:`olbg.com · ${p.id}`,capturedAt:p.capturedAt.slice(0,10),
  olbgMonthly:monthly,showPeriodRow:false,
  // Common global/all-time/3/6/12 fields remain null, not aliases of one month.
  picks:null,profitDisplay:null,yieldPct:null,mainScopeNote:undefined,mainBasisNote:undefined}
}
