// Conditional Profit +/-1 sensitivity. No per-tip stake bounds assumed.
// Each month is a convex polygon in (profit,stake); enumerate finite vertices.
// A zero-containing ROI strip has an unbounded stake ray, whose ratio limit is0.
import type {PublishedMonth} from './olbg-published-monthly'
export interface MidpointRange {lowerPct:number;upperPct:number;widthPP:number;stakeUpperUnbounded:boolean}
function vertices(m:PublishedMonth,nearest:boolean):Array<[number,number]>{
 const r=m.roiPublished!
 const lo=nearest?r-.5:r>0?r:r<0?r-1:-1
 const hi=nearest?r+.5:r>0?r+1:r<0?r:1
 const cs=[[1,0,m.profitPublished+1],[-1,0,-m.profitPublished+1],[100,-hi,0],[-100,lo,0],[0,-1,0]]
 const out:Array<[number,number]>=[]
 for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){
  const [a,b,c]=cs[i],[d,e,f]=cs[j],det=a*e-b*d
  if(Math.abs(det)<1e-12)continue
  const p=(c*e-b*f)/det,s=(a*f-c*d)/det
  if(cs.every(([x,y,z])=>x*p+y*s<=z+1e-7))out.push([p,Math.max(0,s)])
 }
 return out
}
function ratio(polys:Array<Array<[number,number]>>,maximize:boolean):number|null{
 let q=0
 for(let step=0;step<100;step++){
  let p=0,s=0
  for(const vs of polys){
   const best=vs.reduce((a,b)=>(maximize?1:-1)*((b[0]-q*b[1])-(a[0]-q*a[1]))>0?b:a)
   p+=best[0];s+=best[1]
  }
  if(s<=0)return null
  const next=p/s
  if(Math.abs(next-q)<1e-12)return 100*next
  q=next
 }
 return null
}
export function profitToleranceRange(rows:PublishedMonth[]):MidpointRange|null{
 const active=rows.filter(m=>m.picks>0)
 if(!active.length||rows.some(m=>m.picks===0&&m.profitPublished!==0)||active.some(m=>m.roiPublished===null))return null
 const ranges=[]
 for(const nearest of [true,false]){
  const polys=active.map(m=>vertices(m,nearest))
  if(polys.some(v=>!v.length))continue
  let low=ratio(polys,false),high=ratio(polys,true)
  if(low===null||high===null)continue
  const unbounded=active.some(m=>m.roiPublished===0)
  if(unbounded){low=Math.min(low,0);high=Math.max(high,0)}
  ranges.push({low,high,unbounded})
 }
 if(!ranges.length)return null
 const lowerPct=Math.min(...ranges.map(r=>r.low)),upperPct=Math.max(...ranges.map(r=>r.high))
 if(!Number.isFinite(lowerPct)||!Number.isFinite(upperPct))return null
 return {lowerPct,upperPct,widthPP:upperPct-lowerPct,stakeUpperUnbounded:ranges.some(r=>r.unbounded)}
}
