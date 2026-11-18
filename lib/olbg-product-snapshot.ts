// Exact product projection only. No capture blobs, file paths or input hashes.
import {createHash} from 'node:crypto'
import {validateMonthlyProfile,type PublishedMonthlyProfile} from './olbg-published-monthly'
export interface ProductManifest {version:1;basis:'source-published-month-global-all-tips';revision:string;profileCount:number;monthCount:number}
export function decodeProductSnapshot(payload:string,expected:ProductManifest){
 if(expected.version!==1||expected.basis!=='source-published-month-global-all-tips'||!/^[a-f0-9]{64}$/.test(expected.revision))throw Error('Invalid product manifest')
 if(createHash('sha256').update(payload).digest('hex')!==expected.revision)throw Error('Product snapshot digest mismatch')
 const doc=JSON.parse(payload)
 if(doc.version!==expected.version||doc.basis!==expected.basis||!Array.isArray(doc.profiles)||Object.keys(doc).sort().join(',')!=='basis,profiles,version')throw Error('Invalid product snapshot contract')
 const ids=new Set<number>();let months=0
 for(const p of doc.profiles as PublishedMonthlyProfile[]){
  validateMonthlyProfile(p)
  if(Object.keys(p).sort().join(',')!=='avatarUrl,capturedAt,id,joinedAt,months,name,sourceUrl')throw Error('Unexpected product profile field')
  if(ids.has(p.id))throw Error('Duplicate product identity');ids.add(p.id);months+=p.months.length
  for(const m of p.months){
   if(Object.keys(m).sort().join(',')!=='month,picks,profitPublished,roiPublished,source'||Object.keys(m.source).sort().join(',')!=='date,profit,roi,tips')throw Error('Unexpected product month field')
  }
 }
 if(ids.size!==expected.profileCount||months!==expected.monthCount)throw Error('Product snapshot count mismatch')
 return {revision:expected.revision,profiles:doc.profiles as PublishedMonthlyProfile[]}
}
export function prepareProductSnapshot(profiles:PublishedMonthlyProfile[]){
 const projected=profiles.map(p=>({id:p.id,name:p.name,avatarUrl:p.avatarUrl??null,joinedAt:p.joinedAt,capturedAt:p.capturedAt,sourceUrl:p.sourceUrl,months:p.months.map(m=>({month:m.month,picks:m.picks,roiPublished:m.roiPublished,profitPublished:m.profitPublished,source:{date:m.source.date,tips:m.source.tips,roi:m.source.roi,profit:m.source.profit}}))}))
 const payload=JSON.stringify({version:1,basis:'source-published-month-global-all-tips',profiles:projected})
 const manifest:ProductManifest={version:1,basis:'source-published-month-global-all-tips',revision:createHash('sha256').update(payload).digest('hex'),profileCount:projected.length,monthCount:projected.reduce((n,p)=>n+p.months.length,0)}
 decodeProductSnapshot(payload,manifest)
 return {payload,manifest}
}
