// Server only, bounded active-index lookup. Never imported by client components.
import {and,eq} from 'drizzle-orm'
import {db} from '@/db'
import {importValidationLog} from '@/db/schema'
import {BE_CLASS,BE_SLUG,decodeBE} from '@/crawler/platforms/bettingexpert/period-index'
export async function loadBEPeriodIndex(){
 try{const records=await db.select({reason:importValidationLog.reason}).from(importValidationLog).where(and(eq(importValidationLog.platform,'bettingexpert'),eq(importValidationLog.slug,BE_SLUG),eq(importValidationLog.klass,BE_CLASS))).limit(2)
 if(records.length!==1)throw Error('unavailable')
 return decodeBE(records[0].reason)
 }catch{return{rows:[],revision:null,updatedAt:null}}
}
