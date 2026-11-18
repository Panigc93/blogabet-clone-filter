import {createHash} from 'node:crypto'
// statsUpdatedAt records crawler refresh time only. It is not rendered, filtered
// or sorted by current read paths. All other fields, row membership AND SQL
// order remain guarded, including capturedAt and audit/source evidence.
export function semanticBaselineRevision(rows:ReadonlyArray<Record<string,unknown>>):string{
 const stable=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='statsUpdatedAt').sort(([a],[b])=>a.localeCompare(b))))
 return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}
export interface PublishedEstimateEnv {NODE_ENV?:string;LAB_PREVIEW?:string;OLBG_MONTHLY_LOCAL?:string;OLBG_PUBLISHED_ESTIMATES?:string}
export function publishedEstimateRoutesEnabled(env:PublishedEstimateEnv=process.env):boolean{
 if(env.NODE_ENV==='production')return env.OLBG_PUBLISHED_ESTIMATES==='1'
 return env.LAB_PREVIEW==='1'&&env.OLBG_MONTHLY_LOCAL==='1'
}
