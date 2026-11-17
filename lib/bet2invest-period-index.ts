// Server-only exact identity lookup through the existing platform/slug index.
import { and,eq } from 'drizzle-orm'
import { db } from '@/db'
import { importValidationLog } from '@/db/schema'
import { ACTIVE_CLASS,ACTIVE_SLUG,decodeActiveIndex } from '@/crawler/platforms/bet2invest/active-period-index'
export async function loadDatabasePeriodAudits(now=new Date()){
 try{
  const records=await db.select({reason:importValidationLog.reason}).from(importValidationLog).where(and(eq(importValidationLog.platform,'bet2invest'),eq(importValidationLog.slug,ACTIVE_SLUG),eq(importValidationLog.klass,ACTIVE_CLASS))).limit(2)
  if(records.length!==1)throw Error('active index unavailable')
  return decodeActiveIndex(records[0].reason).filter(r=>r.capturedAt.slice(0,7)===now.toISOString().slice(0,7))
 }catch{
  console.error('Bet2Invest audit unavailable; period figures masked')
  return []
 }
}
