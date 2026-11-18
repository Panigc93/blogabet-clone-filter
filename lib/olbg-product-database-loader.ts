// Production reads only the immutable revision committed in this tiny manifest.
// No local-file fallback, latest-row lookup, snapshot endpoint or hidden cache.
import {eq} from 'drizzle-orm'
import {db} from '@/db'
import {olbgPublishedSnapshots} from '@/db/schema'
import manifestJson from '@/config/olbg-product-manifest.json'
import {verifyStoredSnapshot} from './olbg-product-storage'
import type {ProductManifest} from './olbg-product-snapshot'
export const publishedProductManifest=manifestJson as ProductManifest
export async function loadDatabasePublishedMonthlySnapshot(){
 const rows=await db.select({revision:olbgPublishedSnapshots.revision,contract_version:olbgPublishedSnapshots.contractVersion,profile_count:olbgPublishedSnapshots.profileCount,month_count:olbgPublishedSnapshots.monthCount,payload:olbgPublishedSnapshots.payload}).from(olbgPublishedSnapshots).where(eq(olbgPublishedSnapshots.revision,publishedProductManifest.revision)).limit(1)
 return verifyStoredSnapshot(rows[0],publishedProductManifest)
}
