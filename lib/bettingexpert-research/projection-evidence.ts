import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { loadResearchEvidence, EVIDENCE_REVISION } from './evidence'
import type { BEProjectionInput, BEGlobalObservation } from './projection-contract'

// Fixed reviewed report, not a generic Global receipt validator. Independent
// review covers these immutable bytes. No network or arbitrary Global input.
export const B_BINDING_SHA256 = 'a3e2271ef8e2c3a4a794aa4b220232b8c6b5efff63ce359d36435ae94d0b8dc1'
const verified = new WeakSet<object>()
function freezeDeep(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
}
export function assertVerifiedProjection(input: BEProjectionInput): void {
  if (!input || !verified.has(input)) throw Error('Projection requires verified loader instance')
}
export function loadSeparatedProjection(evidenceDirectory: string, fixedBindingFile: string): BEProjectionInput {
  const data = loadResearchEvidence(evidenceDirectory)
  const bytes = readFileSync(fixedBindingFile)
  if (createHash('sha256').update(bytes).digest('hex') !== B_BINDING_SHA256) throw Error('Unreviewed B binding bytes')
  const report = JSON.parse(bytes.toString('utf8')) as { rows: { sourceGuid: string; username: string; globalBinding: {
    capturedAt: string; receiptSha256: string; rawSha256: string
    userStats: { yield: number; profit: number; tipsCount: number }
  } }[] }
  const byGuid = new Map(report.rows.map(r => [r.sourceGuid, r]))
  const result: BEProjectionInput = { revision: EVIDENCE_REVISION + ':' + B_BINDING_SHA256, productionReady: false,
    profiles: data.profiles.map(p => {
      const row = byGuid.get(p.sourceGuid)
      if (row && row.username !== p.username) throw Error('Global identity mismatch')
      const global: BEGlobalObservation = row ? {
        state: 'observed', basis: 'provider_all_time', yieldPct: String(row.globalBinding.userStats.yield),
        profit: String(row.globalBinding.userStats.profit), picks: row.globalBinding.userStats.tipsCount,
        capturedAt: row.globalBinding.capturedAt, receiptSha256: row.globalBinding.receiptSha256,
        rawSha256: row.globalBinding.rawSha256, independentPeriodAggregate: false,
      } : { state: 'not_bound', reason: 'global_not_bound_in_this_projection' }
      return { ...p, global }
    }) }
  freezeDeep(result)
  verified.add(result)
  return result
}
