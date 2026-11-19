// Proposed isolated research contract, not the existing BEAudit importer.
// Values remain private and production eligibility is always false.
export type BEPeriod = '3m' | '6m' | '12m'
export type BEEvidenceClass =
  | 'source_boundary_gate'
  | 'source_boundary_experimental'
  | 'terminal_global_consistent'
  | 'cutoff_reconstruction'
  | 'held'
export type BEDecimal = string // strict finite decimal syntax; no float rounding at rest
export type BESourceRef = {
  artifact: string // server/private only, never sent to client
  sha256: string // custody only, not source authenticity or approval
  jsonPointer: string
}
export type BEAcceptedClassLabel = 'strictNumber' | 'strictExperimentalNumber' | 'strictEmpty'
  | 'Bnumber' | 'Bempty' | 'unreconciledNumber' | 'unreconciledEmpty'
  | 'incomplete' | 'pending' | 'statusHold' | 'arithmeticHold'
export type BEWindowResearchBase = {
  period: BEPeriod
  startUtc: string
  endExclusiveUtc: string
  evidenceClass: BEEvidenceClass
  acceptedClassLabel: BEAcceptedClassLabel
  state: 'number' | 'no_eligible_sample' | 'held'
  yieldPct: BEDecimal | null
  picks: number | null
  profit: BEDecimal | null
  stake: BEDecimal | null
  reason?: string | null
  independentPeriodAggregate: boolean
  globalLedgerConsistency: boolean
  atomicSnapshot: false
  historicalSettlementAtCutoffProven: false
  rankingEligibleDefault: false
  productionReady: false
  sources: BESourceRef[]
  globalCapturedAt?: string
  capturedAt?: string
  anchorCapturedAt?: string
  originalSourceEvidenceSha256?: string // preserved original source binding, not approval
  originalSlug?: string
}
export type BEWindowResearch =
  | (BEWindowResearchBase & {
      acceptedClassLabel: 'strictNumber'
      evidenceClass: 'source_boundary_gate'
      state: 'number'
      picks: number
      profit: BEDecimal
      stake: BEDecimal
      yieldPct: BEDecimal
      globalCapturedAt: string
      capturedAt: string
      anchorCapturedAt: string
      originalSourceEvidenceSha256: string
      originalSlug: string
    })
  | (BEWindowResearchBase & {
      acceptedClassLabel: Exclude<BEAcceptedClassLabel, 'strictNumber'>
    })
// Runtime must also bind to the separately reviewed EVIDENCE-MANIFEST digest
// and its exact dataset on every query. A structurally valid object is not
// evidence of its class. No optional strict metric/capture fallback exists.
export type BEProfileResearch = {
  platform: 'bettingexpert'
  sourceGuid: string // provider UUID, not sourcePortfolioId integer
  username: string // observed name; identity is not inferred from name
  latestObservedPublicationUtc: string
  latestPublicationBasis: 'retained discovery observation, not current activity'
  productionReady: false
  windows: Record<BEPeriod, BEWindowResearch>
  incompleteAnnualWarning: string | null
}
export type BEClientResearchWindow = Pick<BEWindowResearch,
  'period' | 'state' | 'productionReady'> & {
  valuePct: BEDecimal | null
  basisLabel: string
  range: { startUtc: string; endExclusiveUtc: string }
  note: string
  picks: number | null
  stake: BEDecimal | null
  metricDetailComplete: boolean
}
// Required future integration: explicit BE card branch; same effective values
// in SELECT, WHERE, ORDER BY, COUNT and cursor revision before LIMIT. Keep
// global minYield/minPicks separate from selected-period research filters.
// Do not cast this type into BEAudit or compactBEStaged to bypass their gates.
