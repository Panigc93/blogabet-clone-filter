import { sql, and, ne } from 'drizzle-orm'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { periodReadContext } from './bet2invest-period-read'
import { olbgReadContext } from './olbg-read-context'
import { decodeOlbgActiveRows, olbgActiveRange, unavailableOlbgRecords } from '@/crawler/platforms/olbg/active-read'
import { olbgRecordDigest } from '@/crawler/platforms/olbg/persistence-plan'
import type { PeriodAudit } from './bet2invest-period-contract'
import type { TipsterFilters } from './query'

// This review switch can only use the existing disposable local database path.
// It cannot enable OLBG on Neon. Production enablement remains a separate review.
export function olbgLocalReviewEnabled(env: { OLBG_LOCAL_REVIEW?: string; USE_PGLITE?: string } = { OLBG_LOCAL_REVIEW: process.env.OLBG_LOCAL_REVIEW, USE_PGLITE: process.env.USE_PGLITE }) {
  return env.OLBG_LOCAL_REVIEW === '1' && env.USE_PGLITE === '1'
}
async function loadLocalOlbgRecords(now: Date) {
  const [start,next,at]=olbgActiveRange(now)
  try {
    const rows=await db.select({profile_id:sql<string>`a.profile_id`,captured_at:sql<Date>`a.captured_at`,record:sql<unknown>`s.record`,record_sha256:sql<string>`s.record_sha256`})
      .from(sql`olbg_monthly_active a`).innerJoin(sql`olbg_monthly_snapshots s`,sql`s.profile_id=a.profile_id AND s.captured_at=a.captured_at`)
      .where(and(sql`a.captured_at >= ${start}::timestamptz`,sql`a.captured_at < ${next}::timestamptz`,sql`a.captured_at <= ${at}::timestamptz`))
    return decodeOlbgActiveRows(rows)
  } catch { return unavailableOlbgRecords() }
}
export async function tipsterReadContext(audits: PeriodAudit[], now: Date) {
  const base=periodReadContext(audits,now)
  const enabled=olbgLocalReviewEnabled()
  const state=enabled?await loadLocalOlbgRecords(new Date()):{status:'disabled' as const,records:[],rejected:0}
  const revision = (s: typeof state) => JSON.stringify([s.status,s.rejected,s.records.map(r=>[r.profileId,r.capturedAt,olbgRecordDigest(r)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])
  const initialRevision=revision(state)
  const changedSinceAnchor=enabled && state.records.some(r=>r.capturedAt > now.toISOString())
  const olbg=olbgReadContext(base,state.records,now)
  return {
    base, olbg, projection:olbg.projection, order:olbg.order, enabled, changedSinceAnchor,
    revisionUnchanged:async()=>!enabled || (now.toISOString().slice(0,7) === new Date().toISOString().slice(0,7) && initialRevision===revision(await loadLocalOlbgRecords(new Date()))),
    filters:(p:TipsterFilters)=>[...olbg.filters(p),...enabled?[]:[ne(tipsters.platform,'olbg')]],
    warnings:(p:TipsterFilters)=>enabled && (p.platform === undefined || p.platform === 'olbg')?[...olbg.warnings(p),...state.status==='ok'?[]:['OLBG: evidencia mensual no disponible o parcialmente inválida; valores no confirmados ocultos.']]:[],
    state:state.status,
  }
}
