import {sql} from 'drizzle-orm'
import {db} from '@/db'
import {BE_RELEASE_ID,BE_RELEASE_SHA256,BE_RELEASE_POLICY,EVIDENCE_REVISION,verifyReleaseProfiles} from './bettingexpert-release-artifact'
export function beProductionReleaseEnabled(env:NodeJS.ProcessEnv=process.env){return env.NODE_ENV==='production'&&env.BE_FIXED_RELEASE===BE_RELEASE_ID}
export async function loadBEProductionRelease(){
 const rows=await db.select({releaseId:sql<string>`release_id`,revision:sql<string>`evidence_revision`,policy:sql<string>`policy`,digest:sql<string>`profiles_sha256`,profiles:sql<unknown>`profiles`}).from(sql`be_fixed_release`).where(sql`release_id=${BE_RELEASE_ID}`).limit(2)
 if(rows.length!==1||rows[0].revision!==EVIDENCE_REVISION||rows[0].policy!==BE_RELEASE_POLICY||rows[0].digest!==BE_RELEASE_SHA256)throw Error('Fixed BE release unavailable')
 return verifyReleaseProfiles(rows[0].profiles)
}
