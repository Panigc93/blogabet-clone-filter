// Explicit local harness for the shared read pipeline. No DB or credentials.
import {fromTipstrrSnapshot} from '@/components/tipster-card-model'
import {STATMIND_SNAPSHOT} from '@/app/lab/tipstrr/ficha/fixtures'
import {loadPublishedMonthlySnapshot} from './olbg-published-monthly-loader'
import {commonMonthlyPage,type CommonMonthlyRequest} from './olbg-common-list-candidate'
export function commonMonthlyLocalEnabled(){return process.env.NODE_ENV!=='production'&&process.env.LAB_PREVIEW==='1'&&process.env.OLBG_MONTHLY_LOCAL==='1'}
export async function localCommonMonthlyRead(params:URLSearchParams){
 if(!commonMonthlyLocalEnabled())throw Error('Local monthly read disabled')
 const file=process.env.OLBG_MONTHLY_SNAPSHOT_FILE,digest=process.env.OLBG_MONTHLY_SNAPSHOT_SHA256
 if(!file||!digest)throw Error('Pinned local snapshot required')
 const snapshot=await loadPublishedMonthlySnapshot(file,digest)
 const order=params.get('order')??'name'
 if(!['name','yield-desc','olbg-roi-desc','olbg-profit-desc','olbg-picks-desc'].includes(order))throw Error('Invalid ordering')
 const number=(k:string)=>{const s=params.get(k);return s===null||s===''?undefined:Number(s)}
 const request:CommonMonthlyRequest={order:order as CommonMonthlyRequest['order'],monthly:{month:params.get('month')??'latest-available',roiMin:number('roiMin'),minResultMonths:number('minResultMonths')},minCommonYield:number('minCommonYield'),search:params.get('search')??undefined,pageSize:50,cursor:params.get('cursor')??undefined}
 const baseline=[{key:'tipstrr:statmind-retained',card:fromTipstrrSnapshot(STATMIND_SNAPSHOT)}]
 return commonMonthlyPage(baseline,'statmind-retained-20261115',snapshot,request)
}
