// ProTipster (protipster.es) source types. Capture route: cloud browser only
// (plain external HTTP got 403 on 2026-11-20 and that route stays stopped).
// One profile page GET embeds the whole preload state in a single <script>
// (tplConfig.preloadStateData): identity, followers, all-time cumulative
// stats and the default 6-month chart block. Each change of the UI period
// dropdown POSTs /tipster/<slug>/dashboard-graph and returns exact
// profit+stakes+picks for the selected period.
//
// Window semantics (proven 2026-11-20 on heroico, see
// docs/protipster-import-mapping.md):
// - 'lastThreeMonths' / 'lastSixMonths' are ROLLING windows that clip the
//   boundary calendar months (full May 2026 profit -2897 vs -1176 inside the
//   6m window). They are the site-native windows, stored as yield3m/yield6m.
// - 'year' is the ALL-TIME total, NOT the last 12 months (matches
//   cumulativeStats exactly, includes picks from 2020-04).
// - 'YYYY-MM' entries are FULL calendar months with exact profit and stakes,
//   so any range of closed calendar months gets an exact yield as
//   sum(profit)/sum(stakes). The user approved (2026-11-20, WhatsApp)
//   yield12m = the last 12 complete calendar months, labelled with dates.
// - 'Anual' is never imported as 12m.

export interface ProtipsterPeriodStats {
  profit: number | null
  stakes: number | null
  picks: number
  yield: number | null // rounded site figure; exact ratio is profit/stakes
  yieldResolution?: number // observed lexical step (155 -> 1; 155.0 -> 0.1), retained before numeric parsing
  hitRate: number | null
  averageOdds: number | null // decimal format in chart blocks (moneyline in cumulativeStats); not imported
}

export interface ProtipsterOverview {
  id: number
  username: string // display case, e.g. 'ALMO7TARIF'
  usernameCanonical: string // slug used in /tipster/<slug> URLs
  avatar: string | null // bare filename, e.g. 'V5BY8RD3yZUFEWX3.png'
  userJoinDate: string | null // 'YYYY-MM-DD HH:mm:ss', site timezone not exposed
  countryCode: string | null
}

export interface ProtipsterSummary {
  followersCount: number | null
  cumulativeStats: ProtipsterPeriodStats
}

export interface ProtipsterChartBlock {
  stats: ProtipsterPeriodStats // globalGraphData for defaultDateCriteria
  defaultDateCriteria: string // expected 'lastSixMonths' on initial page load
  activeMonths: string[] // 'YYYY-MM' entries from chartFilters.dateFilters (months with picks)
}

// One JSONL row per profile (data/protipster/profiles.jsonl, private, not
// committed). months covers every activeMonth inside the 12-complete-month
// window at capture time; absence of a month means zero picks, not missing
// data (the site's dateFilters only list months with activity).
export interface ProtipsterCaptureRow {
  slug: string
  capturedAt: string // ISO instant of the capture
  sourceUrl: string // exact profile URL
  overview: ProtipsterOverview | null
  summary: ProtipsterSummary | null
  chartDefault: ProtipsterChartBlock | null
  annualCoverage?: { criteria: string; years: string[]; activeMonths: string[] } // direct native-year response provenance
  periodAlltime?: ProtipsterPeriodStats | null // native year graph, if explicitly captured; never inferred from rolling windows
  period3m: ProtipsterPeriodStats | null // POST lastThreeMonths
  months: Record<string, ProtipsterPeriodStats> // 'YYYY-MM' -> full calendar month
  quarantine?: { reason: string } | null
}

export const PROTIPSTER_ORIGIN = 'https://www.protipster.es'

// Avatar filenames come as '<base>.png'; the site serves sized variants.
export function protipsterAvatarUrl(avatar: string | null): string | null {
  if (!avatar) return null
  const m = avatar.match(/^([\w-]+)\.png$/)
  if (!m) return null // unexpected shape: never fabricate a URL
  return `${PROTIPSTER_ORIGIN}/uploads/avatars/${m[1]}.120.png`
}

export function protipsterSourceUrl(slug: string): string {
  return `${PROTIPSTER_ORIGIN}/tipster/${encodeURIComponent(slug)}`
}
