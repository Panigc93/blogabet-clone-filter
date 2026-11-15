// Shared types for platform adapters. Each platform module (tipstrr/,
// golazobets/) parses its own source shape and can map into these normalized
// records. Provenance is mandatory: a metric without its basis and period is
// not comparable across platforms and must not be presented as if it were.

export type PlatformId = 'blogabet' | 'golazobets' | 'tipstrr'

export type StakeBasis =
  | 'advised-stakes' // tipstrr default: the tipster's advised stake per tip
  | 'level-stakes' // every tip treated as staked with the max unit
  | 'platform-total-bet' // golazobets: profit over their total_bet figure
  | 'unknown'

export interface StatSample {
  picks: number | null
  profitUnits: number | null
  yieldPct: number | null // the platform's own yield/ROI figure, not translated
  yieldBasis: StakeBasis
  winRatePct: number | null
  avgOdds: number | null
  periodLabel: string | null // as shown by the source, e.g. 'last 12 months'
  scope: string // 'all_time' | 'month' | 'sport' | 'market' | 'bookie' | ...
  scopeKey: string | null // e.g. '2026-05', 'Football'
}

export interface NormalizedTipster {
  platform: PlatformId
  platformId: string
  username: string
  profileUrl: string
  accountType: 'free' | 'premium' | 'unknown'
  sportName: string | null
  followers: number | null
  samples: StatSample[]
}
