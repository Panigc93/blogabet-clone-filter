import { olbgRecordDigest } from './persistence-plan'
import { validMonthlyRecord, type OlbgMonthlyRecord } from './monthly-record'
export interface OlbgActiveRow { profile_id: string | number; captured_at: Date | string; record: unknown; record_sha256: string }
export interface OlbgReadDatabase { query<T>(text: string, params: unknown[]): Promise<{ rows: T[] }> }
export function olbgActiveRange(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid read date')
  return [new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(), new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(), now.toISOString()]
}
export function decodeOlbgActiveRows(rows: OlbgActiveRow[]) {
  const records: OlbgMonthlyRecord[] = []; let rejected = 0
  for(const row of rows) {
    const at = new Date(row.captured_at)
    if (!validMonthlyRecord(row.record) || row.record_sha256 !== olbgRecordDigest(row.record) || row.record.profileId !== Number(row.profile_id) || !Number.isFinite(at.getTime()) || row.record.capturedAt !== at.toISOString()) { rejected++; continue }
    records.push(row.record)
  }
  if(new Set(records.map(r=>r.profileId)).size!==records.length) throw new Error('Duplicate active identity')
  return { status: rejected ? 'partial-invalid' as const : 'ok' as const, records, rejected }
}
export const unavailableOlbgRecords = () => ({ status:'unavailable' as const, records:[] as OlbgMonthlyRecord[], rejected:0 })
export async function readOlbgActiveRecords(db: OlbgReadDatabase, now: Date) {
  const params=olbgActiveRange(now)
  try {
    // Exact active-pointer join. Historical captures are not scanned, returned
    // or aggregated. One statement observes a consistent active/snapshot pair.
    const result = await db.query<OlbgActiveRow>(
      'SELECT a.profile_id,a.captured_at,s.record,s.record_sha256 FROM olbg_monthly_active a JOIN olbg_monthly_snapshots s ON s.profile_id=a.profile_id AND s.captured_at=a.captured_at WHERE a.captured_at >= $1::timestamptz AND a.captured_at < $2::timestamptz AND a.captured_at <= $3::timestamptz', params,
    )
    return decodeOlbgActiveRows(result.rows)
  } catch { return unavailableOlbgRecords() }
}
