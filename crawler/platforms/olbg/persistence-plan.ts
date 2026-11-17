import { compactOlbg } from './compact'
import { createHash } from 'node:crypto'
import { validMonthlyRecord, type OlbgMonthlyRecord } from './monthly-record'

// Proposal only. These statements are not registered as migrations or executed
// by application startup. A later explicitly authorized executor must own the
// transaction, catalog row allocation, concurrency and final readback.
export const OLBG_LOCAL_SCHEMA = `
CREATE TABLE olbg_monthly_snapshots (
 profile_id bigint NOT NULL,
 captured_at timestamptz NOT NULL,
 record jsonb NOT NULL,
 record_sha256 text NOT NULL CHECK (record_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(profile_id,captured_at),
 CHECK (record->>'version' = '1'),
 CHECK (record->>'scope' = 'global-all-tips'),
 CHECK ((record->>'profileId')::bigint = profile_id),
 CHECK ((record->>'capturedAt')::timestamptz = captured_at)
);
CREATE TABLE olbg_monthly_active (
 profile_id bigint PRIMARY KEY,
 captured_at timestamptz NOT NULL,
 compact jsonb NOT NULL,
 compact_md5 text NOT NULL,
 FOREIGN KEY(profile_id,captured_at) REFERENCES olbg_monthly_snapshots(profile_id,captured_at)
);
CREATE INDEX olbg_active_capture ON olbg_monthly_active(captured_at);
CREATE TABLE olbg_revision (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision bigint NOT NULL, changed_at timestamptz NOT NULL);
INSERT INTO olbg_revision VALUES(true,0,'1970-01-01');
CREATE TABLE olbg_import_runs (
 run_id text PRIMARY KEY,
 input_sha256 text NOT NULL,
 summary jsonb NOT NULL,
 rolled_back_at timestamptz,
 committed_at timestamptz NOT NULL DEFAULT NOW()
);`
export interface OlbgPersistenceState {
  catalogSurrogateId: number
  activeCapturedAt: string | null
  sameSnapshot: OlbgMonthlyRecord | null
}
export function canonicalOlbgJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalOlbgJson).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalOlbgJson((value as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(value)
}
export function olbgRecordDigest(r: OlbgMonthlyRecord) {
  return createHash('sha256').update(canonicalOlbgJson(r)).digest('hex')
}
export function planOlbgPersistence(r: OlbgMonthlyRecord, state: OlbgPersistenceState) {
  if (!validMonthlyRecord(r)) throw new Error('Invalid record')
  if (!Number.isSafeInteger(state.catalogSurrogateId) || state.catalogSurrogateId === 0 || state.catalogSurrogateId < -2147483648 || state.catalogSurrogateId > 2147483647) throw new Error('Existing allocated catalog surrogate required; never use source ID as surrogate')
  if (state.activeCapturedAt !== null && (!Number.isFinite(Date.parse(state.activeCapturedAt)) || new Date(state.activeCapturedAt).toISOString() !== state.activeCapturedAt)) throw new Error('Invalid active timestamp')
  if (state.sameSnapshot && canonicalOlbgJson(state.sameSnapshot) !== canonicalOlbgJson(r)) throw new Error('Immutable snapshot identity conflict')
  if (state.activeCapturedAt && state.activeCapturedAt > r.capturedAt) return { action: 'skip-older' as const, statements: [] }
  if (state.activeCapturedAt === r.capturedAt && state.sameSnapshot) return { action: 'no-op' as const, statements: [] }
  return {
    action: 'proposed-transaction' as const,
    preconditions: ['Authority to write production still required', 'Schema explicitly provisioned', 'Lock exact catalog platform=olbg, slug=source numeric ID; re-read state under lock', 'Catalog fields are not an all-time statistic; reads and filters must use OLBG masks', 'All statements and catalog capturedAt update in one bounded transaction'],
    statements: [
      { text: 'UPDATE olbg_revision SET revision=revision+1,changed_at=clock_timestamp() WHERE singleton=true', params: [] },
      ...state.sameSnapshot ? [] : [{ text: 'INSERT INTO olbg_monthly_snapshots(profile_id,captured_at,record,record_sha256) VALUES ($1,$2,$3::jsonb,$4)', params: [r.profileId, r.capturedAt, JSON.stringify(r), olbgRecordDigest(r)] }],
      { text: 'INSERT INTO olbg_monthly_active(profile_id,captured_at,compact,compact_md5) VALUES ($1,$2,$3::jsonb,md5(($3::jsonb)::text)) ON CONFLICT(profile_id) DO UPDATE SET captured_at=EXCLUDED.captured_at,compact=EXCLUDED.compact,compact_md5=EXCLUDED.compact_md5 WHERE olbg_monthly_active.captured_at < EXCLUDED.captured_at', params: [r.profileId, r.capturedAt, JSON.stringify(compactOlbg(r,olbgRecordDigest(r)))] },
      { text: "UPDATE tipsters SET captured_at=$1 WHERE id=$2 AND platform='olbg' AND slug=$3", params: [r.capturedAt, state.catalogSurrogateId, String(r.profileId)] },
    ],
  }
}
