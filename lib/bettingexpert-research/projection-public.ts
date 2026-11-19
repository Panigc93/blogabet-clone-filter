import { loadSeparatedProjection } from './projection-evidence'
import { buildBEProjectionSQL, projectionCursor } from './projection-sql'
import type { BEProjectionParams } from './projection-contract'

type InternalRow = {
  guid: string; username: string; quality: string; evidence_class: string; raw_state: string
  effective_reason: string | null; start_utc: string; end_exclusive_utc: string
  period_yield: string | null; period_picks: number | null; period_profit: string | null; period_stake: string | null
  global_yield: string | null; global_picks: number | null; global_profit: string | null
  global_observation: { state: 'observed' | 'not_bound' }
}
type InternalPage = { total: number; items: InternalRow[] }
export type BEProjectionExecutor = (text: string, values: unknown[]) => Promise<{ rows: InternalPage[] }>
const qualities = ['strictNumber', 'strictExperimentalNumber', 'Bnumber', 'unreconciledNumber', 'strictEmpty', 'Bempty', 'unreconciledEmpty', 'incomplete', 'pending', 'statusHold', 'arithmeticHold']
function decimal(x: string | null) {
  if (x !== null && (typeof x !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(x))) throw Error('Invalid SQL decimal')
  return x
}
function picks(x: number | null) {
  if (x !== null && (!Number.isSafeInteger(x) || x < 0)) throw Error('Invalid SQL picks')
  return x
}
/** Explicit allowlist, never object-spread SQL rows or global_observation.
 * Private capture times, hashes, paths, source objects and raw reasons do not
 * cross this boundary. Window calendar bounds are intended public semantics.
 */
export function sanitizeProjectionPage(page: InternalPage, q: BEProjectionParams, nextCursor: string | null) {
  if (!Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.items) || page.items.length > q.pageSize) throw Error('Invalid SQL page')
  return { platform: 'bettingexpert' as const, period: q.period, total: page.total,
    productionReady: false as const, nextCursor,
    items: page.items.map(r => {
      if (!qualities.includes(r.quality) || !['number', 'held', 'no_eligible_sample'].includes(r.raw_state)
        || !['observed', 'not_bound'].includes(r.global_observation.state)
        || !/^[a-f0-9-]{36}$/.test(r.guid) || typeof r.username !== 'string'
        || !/^\d{4}-\d{2}-01T00:00:00Z$/.test(r.start_utc) || !/^\d{4}-\d{2}-01T00:00:00Z$/.test(r.end_exclusive_utc)) throw Error('Invalid SQL row')
      const selectedAllowed = r.raw_state === 'number' && q.policy.allowedNumericLabels.some(label => label === r.quality)
      if ((!selectedAllowed && [r.period_yield, r.period_picks, r.period_profit, r.period_stake].some(v => v !== null))
        || (r.global_observation.state === 'not_bound' && [r.global_yield, r.global_picks, r.global_profit].some(v => v !== null))) throw Error('Unexpected effective metrics')
      return { guid: r.guid, username: r.username,
        global: { state: r.global_observation.state, basis: 'provider_all_time' as const,
          yieldPct: decimal(r.global_yield), picks: picks(r.global_picks), profit: decimal(r.global_profit) },
        selected: { quality: r.quality, state: r.raw_state,
          reason: r.effective_reason === 'quality_not_selected' ? 'quality_not_selected'
            : r.raw_state === 'held' ? 'source_validation_pending'
              : r.raw_state === 'no_eligible_sample' ? 'no_eligible_sample' : null,
          range: { startUtc: r.start_utc, endExclusiveUtc: r.end_exclusive_utc },
          yieldPct: decimal(r.period_yield), picks: picks(r.period_picks), profit: decimal(r.period_profit), stake: decimal(r.period_stake) } }
    }) }
}
/** The only prepared client-facing orchestration. It always reloads and
 * verifies fixed evidence. No caller-supplied dataset and no public route.
 */
export async function querySanitizedProjection(evidenceDirectory: string, bindingFile: string,
  params: BEProjectionParams, execute: BEProjectionExecutor) {
  const q = structuredClone(params) // caller cannot change filters across await
  const input = loadSeparatedProjection(evidenceDirectory, bindingFile)
  const query = buildBEProjectionSQL(input, q)
  const result = await execute(query.text, query.values)
  if (result.rows.length !== 1) throw Error('Invalid SQL result')
  const page = result.rows[0]
  const offset = q.cursor === null ? 0 : (JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')) as {offset: number}).offset
  const next = offset + q.pageSize < page.total ? projectionCursor(input, q, offset + q.pageSize) : null
  return sanitizeProjectionPage(page, q, next)
}
