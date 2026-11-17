// Server-only: a single metadata lookup on the existing app database.
import { activeManifestPredicate } from './bet2invest-active-manifests'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { importValidationLog } from '@/db/schema'
import { databaseAudits, MANIFEST_CLASS } from '@/crawler/platforms/bet2invest/database-manifest'
export async function loadDatabasePeriodAudits(now = new Date()) {
  try {
    return await readDatabasePeriodAudits(now)
  } catch {
    // Do not break Blogabet/other-platform pages on unavailable audit. No
    // private reason payload, SQL text or connection detail is logged.
    console.error('Bet2Invest audit unavailable; period figures masked')
    return []
  }
}
async function readDatabasePeriodAudits(now: Date) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const records = await db.select({ reason: importValidationLog.reason, runId: importValidationLog.runId })
    .from(importValidationLog).where(and(
      eq(importValidationLog.platform, 'bet2invest'), eq(importValidationLog.klass, MANIFEST_CLASS),
      activeManifestPredicate(),
      sql`${importValidationLog.capturedAt} >= ${from} AND ${importValidationLog.capturedAt} < ${to}`,
    )).limit(1001)
  if (records.length > 1000) throw new Error('current active manifest population requires review')
  return databaseAudits(records)
}
