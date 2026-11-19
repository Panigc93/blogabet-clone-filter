import type { BEPeriod, BEAcceptedClassLabel, BEProfileResearch } from './contract'

// Separate all-time provider output. Never filled from a 3/6/12m window, and no
// stake is derived from profit/yield. Missing custody stays a missing Global.
export type BEGlobalObservation = {
  state: 'observed'; yieldPct: string; profit: string; picks: number
  capturedAt: string; receiptSha256: string; rawSha256: string
  basis: 'provider_all_time'; independentPeriodAggregate: false
} | { state: 'not_bound'; reason: 'global_not_bound_in_this_projection' }
export type BESeparatedProfile = BEProfileResearch & { global: BEGlobalObservation }
export type BENumericQuality = Extract<BEAcceptedClassLabel,
  'strictNumber' | 'strictExperimentalNumber' | 'Bnumber' | 'unreconciledNumber'>
export type BEQualityPolicy = {
  // No default release policy. The caller must choose a set for local tests.
  allowedNumericLabels: BENumericQuality[]
}
export type BEProjectionParams = {
  period: BEPeriod; policy: BEQualityPolicy
  minimumPeriodYield: string | null; minimumPeriodPicks: number | null
  minimumGlobalYield: string | null; minimumGlobalPicks: number | null
  search: string; sort: 'periodYield' | 'globalYield' | 'name'
  pageSize: number; cursor: string | null
}
export type BEProjectionInput = {
  revision: string; profiles: BESeparatedProfile[]; productionReady: false
}
