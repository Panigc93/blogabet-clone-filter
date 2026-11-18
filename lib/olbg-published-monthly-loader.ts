// Read-only candidate loader. Not imported by any production route.
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateMonthlyProfile,type PublishedMonthlyProfile} from './olbg-published-monthly'
export interface MonthlySnapshot {revision:string;profiles:PublishedMonthlyProfile[]}
export async function loadPublishedMonthlySnapshot(file:string,expectedSha256:string):Promise<MonthlySnapshot>{
 if(!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('Expected pinned snapshot digest')
 const bytes=await fs.readFile(file)
 const revision=createHash('sha256').update(bytes).digest('hex')
 if(revision!==expectedSha256)throw Error('Monthly snapshot revision mismatch')
 const doc=JSON.parse(bytes.toString())
 if(doc.version!==1||doc.basis!=='source-published-month-global-all-tips'||!Array.isArray(doc.profiles))throw Error('Unknown monthly snapshot contract')
 const ids=new Set<number>()
 for(const p of doc.profiles){validateMonthlyProfile(p);if(ids.has(p.id))throw Error('Duplicate profile identity');ids.add(p.id)}
 return {revision,profiles:doc.profiles}
}
