// Server-side preparation adapter shared by future SSR/API wiring.
// Requires a complete revision-pinned baseline, not a database page.
import {createHash} from 'node:crypto'
import {fromDbTipster,type TipsterReadRow} from '@/components/tipster-card-model'
import {loadPublishedMonthlySnapshot} from './olbg-published-monthly-loader'
import {commonMonthlyPage,type CommonMonthlyRequest} from './olbg-common-list-candidate'
export interface BaselineReadSnapshot {rows:TipsterReadRow[];revision:string;complete:true;readAt:string}
export async function loadCommonPublishedMonthlyPage(input:{
 monthlyFile:string;monthlySha256:string;request:CommonMonthlyRequest
 readBaseline:()=>Promise<BaselineReadSnapshot>
 baselineUnchanged:(revision:string)=>Promise<boolean>
}){
 const [source,baseline]=await Promise.all([loadPublishedMonthlySnapshot(input.monthlyFile,input.monthlySha256),input.readBaseline()])
 if(baseline.complete!==true||!baseline.revision||!Number.isFinite(Date.parse(baseline.readAt)))throw Error('Complete pinned baseline required before merging')
 const num=(v:unknown)=>v==null?null:Number(v)
 const cards=baseline.rows.filter(r=>r.platform!=='olbg').map((r,baselineRank)=>({baselineRank,key:`${r.platform}:${r.id}`,card:fromDbTipster(r,new Date(baseline.readAt)),profitUnit:r.profitUnit,sortValues:{profit:num(r.profit),picks:r.picks,followers:r.followers,since_year:r.sinceYear,price:num(r.price),yield6m:num(r.yield6m),yield12m:num(r.yield12m),picks6m_avg:num(r.picks6mAvg)}}))
 // Digest actual values too, so a stale token cannot silently mask changed data.
 const baselineRevision=createHash('sha256').update(baseline.revision).update(JSON.stringify(baseline.rows)).digest('hex')
 const result=commonMonthlyPage(cards,baselineRevision,source,input.request)
 if(!await input.baselineUnchanged(baseline.revision))throw Error('Baseline changed during read; restart pagination')
 return result
}
