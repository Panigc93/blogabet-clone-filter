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
 const cards=baseline.rows.filter(r=>r.platform!=='olbg').map(r=>({key:`${r.platform}:${r.id}`,card:fromDbTipster(r,new Date(baseline.readAt))}))
 // Digest actual values too, so a stale token cannot silently mask changed data.
 const baselineRevision=createHash('sha256').update(baseline.revision).update(JSON.stringify(baseline.rows)).digest('hex')
 const result=commonMonthlyPage(cards,baselineRevision,source,input.request)
 if(!await input.baselineUnchanged(baseline.revision))throw Error('Baseline changed during read; restart pagination')
 return result
}
