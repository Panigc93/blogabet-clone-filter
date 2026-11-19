// Offline preparation only. No DB/network/env access, no automatic activation.
import {createHash} from 'node:crypto'
import {compactBEStaged} from './period-receipt'
import {encodeBE,decodeBE} from './period-index'
import {BE_PERIODS,type BEAudit} from '@/lib/bettingexpert-period-contract'
export const BE_WINDOW_BASIS='publication-cohort-closed-UTC-ledger-stake-v1' as const
export interface BEReviewedSource {slug:string;guid:string;stagedSha256:string}
export interface BEReviewedManifest {version:1;basis:typeof BE_WINDOW_BASIS;sourceMonth:string;expectedRows:number;expectedWindows:number;sources:BEReviewedSource[]}
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
/** Caller supplies the privately reviewed manifest AND exact original staged
 * bytes. Digests are custody, not permission or source authenticity. Never a
 * client payload. Unlisted catalogue identities have no period audit: NULL.
 */
export function prepareReviewedBEWindows(manifest:BEReviewedManifest,stagedBytes:string[],updatedAt:string){
 if(manifest.version!==1||manifest.basis!==BE_WINDOW_BASIS||!/^\d{4}-\d{2}$/.test(manifest.sourceMonth)||!Number.isSafeInteger(manifest.expectedRows)||manifest.expectedRows<1||manifest.expectedRows>20000||!Number.isSafeInteger(manifest.expectedWindows)||manifest.expectedWindows<1||manifest.sources.length!==manifest.expectedRows||stagedBytes.length!==manifest.expectedRows)throw Error('invalid BE reviewed manifest')
 if(new Set(manifest.sources.map(s=>s.slug)).size!==manifest.expectedRows||new Set(manifest.sources.map(s=>s.guid)).size!==manifest.expectedRows)throw Error('duplicate BE reviewed identity')
 const rows:BEAudit[]=manifest.sources.map((s,i)=>{
  if(!/^[a-f0-9]{64}$/.test(s.stagedSha256)||sha(stagedBytes[i])!==s.stagedSha256)throw Error('BE staged bytes differ from review')
  const audit=compactBEStaged(JSON.parse(stagedBytes[i]))
  if(audit.slug!==s.slug||audit.guid!==s.guid||audit.periodCapturedAt.slice(0,7)!==manifest.sourceMonth||audit.anchorCapturedAt.slice(0,7)!==manifest.sourceMonth)throw Error('BE reviewed source identity/month mismatch')
  if(!BE_PERIODS.some(n=>audit.windows[n].value!==null))throw Error('BE reviewed row has no accepted window')
  return audit
 })
 const windows=rows.reduce((sum,r)=>sum+BE_PERIODS.filter(n=>r.windows[n].value!==null).length,0)
 if(windows!==manifest.expectedWindows)throw Error('BE accepted window count mismatch')
 const encoded=encodeBE(rows,updatedAt),index=decodeBE(encoded)
 return {encoded,revision:index.revision,rows:index.rows,summary:{basis:manifest.basis,sourceMonth:manifest.sourceMonth,rows:rows.length,windows,absentWindowPolicy:'NULL' as const,productionReady:false as const}}
}
