import {createHash} from 'node:crypto'
import type {BEVisiblePeriods,BEVisibleQuality} from './bettingexpert-visible-periods'
import {loadResearchEvidence,EVIDENCE_REVISION} from './bettingexpert-research/evidence'
export const BE_RELEASE_ID='be547-2026-11-v1'
export const BE_RELEASE_POLICY='max-supported-labeled-v1'
export type BEReleaseProfile={guid:string;slug:string;public:BEVisiblePeriods}
export function buildBEReleaseProfiles(directory:string):BEReleaseProfile[]{
 const data=loadResearchEvidence(directory)
 const quality:Record<string,BEVisibleQuality>={source_boundary_gate:'contrasted',source_boundary_experimental:'experimental',terminal_global_consistent:'global-consistent',cutoff_reconstruction:'reconstructed',held:'reconstructed'}
 return data.profiles.map(p=>{
  const windows={} as BEVisiblePeriods['windows']
  for(const n of ['3m','6m','12m']as const){const w=p.windows[n],numeric=w.state==='number';windows[n]={value:numeric?w.yieldPct:null,picks:numeric?w.picks:null,profit:numeric?w.profit:null,stake:numeric?w.stake:null,quality:quality[w.evidenceClass],state:w.state,reason:numeric?null:w.state==='held'?'source_validation_pending':'no_eligible_sample',from:w.startUtc.slice(0,7),to:new Date(Date.parse(w.endExclusiveUtc)-1).toISOString().slice(0,7)}}
  return {guid:p.sourceGuid,slug:p.username,public:{version:1,slug:p.username,windows}}
 })
}
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value}
export const releaseDigest=(profiles:BEReleaseProfile[])=>createHash('sha256').update(JSON.stringify(canonical(profiles))).digest('hex')
export {EVIDENCE_REVISION}
export const BE_RELEASE_SHA256='776c7616e84dd1719e7002db4d55c980d05f8419c4cee2412d55a21c7fe8fbd8'
const verified=new WeakSet<object>()
export function verifyReleaseProfiles(value:unknown):BEReleaseProfile[]{
 if(!Array.isArray(value)||releaseDigest(value)!==BE_RELEASE_SHA256)throw Error('Fixed BE release bytes mismatch')
 verified.add(value);return value
}
export function assertReleaseProfiles(value:BEReleaseProfile[]){if(!verified.has(value)||releaseDigest(value)!==BE_RELEASE_SHA256)throw Error('Unverified BE release instance')}
