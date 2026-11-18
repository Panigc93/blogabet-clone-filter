// Conditional reconstruction, NOT an OLBG-published global yield.
// Profit exactness, common accounting basis and both rounding rules are
// hypotheses. The envelope measures those hypotheses, not actual error.
import {validateMonthlyProfile,type PublishedMonthlyProfile,type PublishedMonth} from './olbg-published-monthly'
export type EstimateScope='available-closed'|3|6|12
export interface ConditionalRange {lowerPct:number;upperPct:number;widthPP:number;stakeUpperUnbounded:boolean}
export interface GlobalYieldEstimate {
 version:1;scope:EstimateScope;status:'estimated'|'interval-only'|'unavailable'
 centralPct:number|null;range:ConditionalRange|null
 nearest:ConditionalRange|null;truncation:ConditionalRange|null
 from:string|null;to:string|null;monthsUsed:string[];missingMonths:string[]
 picks:number;profitSource:number;currentMonthExcluded:string
 reason:'ok'|'zero-roi'|'inconsistent-source'|'missing-months'|'no-closed-results'
}
const ym=(n:number)=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`
const ordinal=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1
export function estimateMonths(captureMonth:string,scope:3|6|12):string[]{const end=ordinal(captureMonth)-1;return Array.from({length:scope},(_,i)=>ym(end-scope+1+i))}
function conditionalRange(rows:PublishedMonth[],rule:'nearest'|'truncation'):ConditionalRange|null{
 let lowerStake=0,upperStake=0,total=0
 for(const m of rows){
  const p=m.profitPublished,r=m.roiPublished;total+=p
  if(m.picks===0){if(p!==0)return null;continue}
  if(r===null||r!==0&&(p===0||p*r<0))return null
  if(r===0){lowerStake+=(rule==='nearest'?200:100)*Math.abs(p);upperStake=Infinity;continue}
  const a=rule==='nearest'?Math.abs(r)-.5:Math.abs(r)
  const b=rule==='nearest'?Math.abs(r)+.5:Math.abs(r)+1
  lowerStake+=100*Math.abs(p)/b;upperStake+=100*Math.abs(p)/a
 }
 if(lowerStake===0){return total===0?{lowerPct:0,upperPct:0,widthPP:0,stakeUpperUnbounded:true}:null}
 const a=100*total/upperStake,b=100*total/lowerStake
 const lowerPct=Math.min(a,b)||0,upperPct=Math.max(a,b)||0
 if(!Number.isFinite(lowerPct)||!Number.isFinite(upperPct))return null
 return {lowerPct,upperPct,widthPP:upperPct-lowerPct,stakeUpperUnbounded:!Number.isFinite(upperStake)}
}
export function estimateGlobalYield(profile:PublishedMonthlyProfile,scope:EstimateScope='available-closed'):GlobalYieldEstimate{
 validateMonthlyProfile(profile)
 const capture=profile.capturedAt.slice(0,7)
 const closed=profile.months.filter(m=>m.month<capture).sort((a,b)=>a.month.localeCompare(b.month))
 const wanted=scope==='available-closed'?closed.map(m=>m.month):estimateMonths(capture,scope)
 const rows=closed.filter(m=>wanted.includes(m.month))
 const from=scope==='available-closed'?rows[0]?.month??null:wanted[0]
 const to=scope==='available-closed'?rows.at(-1)?.month??null:wanted.at(-1)!
 const period=from&&to?Array.from({length:ordinal(to)-ordinal(from)+1},(_,i)=>ym(ordinal(from)+i)):[]
 const missingMonths=period.filter(month=>!rows.some(m=>m.month===month))
 const result:GlobalYieldEstimate={version:1,scope,status:'unavailable',centralPct:null,range:null,nearest:null,truncation:null,from,to,monthsUsed:rows.map(m=>m.month),missingMonths,
  picks:rows.reduce((n,m)=>n+m.picks,0),profitSource:rows.reduce((n,m)=>n+m.profitPublished,0),currentMonthExcluded:capture,reason:'no-closed-results'}
 if(!rows.length||result.picks===0)return result
 // A fixed window is all-or-nothing. Available-closed deliberately estimates
 // only retained rows; gaps stay explicit, never treated as zero betting.
 if(scope!=='available-closed'&&missingMonths.length)return {...result,reason:'missing-months'}
 const nearest=conditionalRange(rows,'nearest'),truncation=conditionalRange(rows,'truncation')
 if(!nearest||!truncation)return {...result,reason:'inconsistent-source'}
 const lowerPct=Math.min(nearest.lowerPct,truncation.lowerPct),upperPct=Math.max(nearest.upperPct,truncation.upperPct)
 const range={lowerPct,upperPct,widthPP:upperPct-lowerPct,stakeUpperUnbounded:nearest.stakeUpperUnbounded||truncation.stakeUpperUnbounded}
 if(rows.some(m=>m.picks>0&&m.roiPublished===0))return {...result,nearest,truncation,range,status:'interval-only',reason:'zero-roi'}
 const stake=rows.reduce((n,m)=>n+(m.picks===0?0:100*m.profitPublished/m.roiPublished!),0)
 const centralPct=100*result.profitSource/stake
 if(!Number.isFinite(centralPct)||stake<=0)return {...result,reason:'inconsistent-source'}
 return {...result,nearest,truncation,range,centralPct:centralPct||0,status:'estimated',reason:'ok'}
}
