import { assertVerifiedProjection } from './projection-evidence'
import { createHash } from 'node:crypto'
import type { BEProjectionInput, BEProjectionParams, BENumericQuality } from './projection-contract'

const numericLabels: BENumericQuality[] = ['strictNumber', 'strictExperimentalNumber', 'Bnumber', 'unreconciledNumber']
const decimal = /^-?\d{1,12}(?:\.\d{1,28})?$/
export function validateProjectionParams(q: BEProjectionParams) {
  if (!['3m', '6m', '12m'].includes(q.period) || !['periodYield', 'globalYield', 'name'].includes(q.sort)
    || !q.policy || !Array.isArray(q.policy.allowedNumericLabels)
    || q.policy.allowedNumericLabels.some(x => !numericLabels.includes(x))
    || new Set(q.policy.allowedNumericLabels).size !== q.policy.allowedNumericLabels.length
    || !Number.isInteger(q.pageSize) || q.pageSize < 1 || q.pageSize > 100
    || typeof q.search !== 'string' || q.search.length > 100) throw Error('Invalid BE projection query')
  for (const x of [q.minimumPeriodYield, q.minimumGlobalYield]) if (x !== null && (typeof x !== 'string' || !decimal.test(x))) throw Error('Invalid decimal')
  for (const x of [q.minimumPeriodPicks, q.minimumGlobalPicks]) if (x !== null && (!Number.isSafeInteger(x) || x < 0)) throw Error('Invalid picks')
}
function fingerprint(input: BEProjectionInput, q: BEProjectionParams) {
  const params = { ...q, cursor: null }
  return createHash('sha256').update(JSON.stringify({ revision: input.revision, ...params,
    policy: [...q.policy.allowedNumericLabels].sort() })).digest('hex')
}
function offset(input: BEProjectionInput, q: BEProjectionParams) {
  if (q.cursor === null) return 0
  if (q.cursor.length > 256) throw Error('Invalid cursor')
  let c: { fingerprint: string; offset: number }
  try { c = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')) } catch { throw Error('Invalid cursor') }
  if (!c || c.fingerprint !== fingerprint(input, q) || !Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset % q.pageSize !== 0) throw Error('Stale or mismatched cursor')
  return c.offset
}
export function projectionCursor(input: BEProjectionInput, q: BEProjectionParams, nextOffset: number) {
  assertVerifiedProjection(input)
  validateProjectionParams(q)
  if (!Number.isSafeInteger(nextOffset) || nextOffset < 0 || nextOffset % q.pageSize !== 0) throw Error('Invalid next offset')
  return Buffer.from(JSON.stringify({ fingerprint: fingerprint(input, q), offset: nextOffset })).toString('base64url')
}
/** Isolated SELECT prototype, no schema/migration/importer or DB connection.
 * Input must come from loadSeparatedProjection; this builder is not a generic
 * source validator. A policy affects effective period values, never raw Global.
 */
export function buildBEProjectionSQL(input: BEProjectionInput, q: BEProjectionParams) {
  assertVerifiedProjection(input)
  validateProjectionParams(q)
  const start = offset(input, q)
  const text = `WITH source AS (
    SELECT p FROM jsonb_array_elements($1::jsonb) AS p
  ), selected AS (
    SELECT p->>'sourceGuid' AS guid, p->>'username' AS username,
      p->'global' AS global_observation, p->'windows'->$2::text AS w,
      p->>'incompleteAnnualWarning' AS annual_warning
    FROM source
  ), effective AS (
    SELECT guid, username, global_observation, annual_warning,
      w->>'acceptedClassLabel' AS quality, w->>'evidenceClass' AS evidence_class,
      w->>'state' AS raw_state, w->>'reason' AS raw_reason,
      w->>'startUtc' AS start_utc, w->>'endExclusiveUtc' AS end_exclusive_utc,
      CASE WHEN w->>'state' = 'number' AND w->>'acceptedClassLabel' = ANY($3::text[])
        THEN (w->>'yieldPct')::numeric END AS period_yield,
      CASE WHEN w->>'state' = 'number' AND w->>'acceptedClassLabel' = ANY($3::text[])
        THEN (w->>'picks')::integer END AS period_picks,
      CASE WHEN w->>'state' = 'number' AND w->>'acceptedClassLabel' = ANY($3::text[])
        THEN (w->>'profit')::numeric END AS period_profit,
      CASE WHEN w->>'state' = 'number' AND w->>'acceptedClassLabel' = ANY($3::text[])
        THEN (w->>'stake')::numeric END AS period_stake,
      CASE WHEN w->>'state' = 'number' AND NOT (w->>'acceptedClassLabel' = ANY($3::text[]))
        THEN 'quality_not_selected' ELSE w->>'reason' END AS effective_reason,
      CASE WHEN global_observation->>'state' = 'observed' THEN (global_observation->>'yieldPct')::numeric END AS global_yield,
      CASE WHEN global_observation->>'state' = 'observed' THEN (global_observation->>'picks')::integer END AS global_picks,
      CASE WHEN global_observation->>'state' = 'observed' THEN (global_observation->>'profit')::numeric END AS global_profit
    FROM selected
  ), filtered AS (
    SELECT * FROM effective WHERE
      ($4::numeric IS NULL OR period_yield >= $4::numeric)
      AND ($5::integer IS NULL OR period_picks >= $5::integer)
      AND ($6::numeric IS NULL OR global_yield >= $6::numeric)
      AND ($7::integer IS NULL OR global_picks >= $7::integer)
      AND strpos(lower(username COLLATE "C"), lower($8::text COLLATE "C")) > 0
  ), ordered AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN $9::text = 'periodYield' THEN period_yield END DESC NULLS LAST,
      CASE WHEN $9::text = 'globalYield' THEN global_yield END DESC NULLS LAST,
      username COLLATE "C" ASC, guid COLLATE "C" ASC) AS ordinal
    FROM filtered
  ), paged AS (
    SELECT guid, username, global_observation, annual_warning, quality, evidence_class,
      raw_state, raw_reason, start_utc, end_exclusive_utc, effective_reason,
      period_yield::text AS period_yield, period_picks, period_profit::text AS period_profit,
      period_stake::text AS period_stake, global_yield::text AS global_yield,
      global_picks, global_profit::text AS global_profit, ordinal
    FROM ordered ORDER BY ordinal LIMIT $10::integer OFFSET $11::integer
  ) SELECT (SELECT count(*)::integer FROM filtered) AS total,
    COALESCE((SELECT jsonb_agg(to_jsonb(paged) - 'ordinal' ORDER BY ordinal) FROM paged), '[]'::jsonb) AS items`
  return { text, values: [JSON.stringify(input.profiles), q.period, q.policy.allowedNumericLabels,
    q.minimumPeriodYield, q.minimumPeriodPicks, q.minimumGlobalYield, q.minimumGlobalPicks,
    q.search, q.sort, q.pageSize, start], revision: input.revision, productionReady: false as const }
}
