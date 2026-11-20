// Parses the ProTipster profile preload state and dashboard-graph responses.
//
// The profile page embeds one <script> with `var tplConfig = Object.freeze({
// ... preloadStateData: [ { mutation: 'NAME', args: [ <payload> ] }, ...] })`
// where each payload is JSON with JS-escaped quotes ({\"id\":136241,...}).
// Three mutations carry the import data:
//   UPP_DASHBOARD_OVERVIEW  -> identity (id, username, avatar, join date, country)
//   UPP_SUMMARY_ADD_DATA    -> followersCount + all-time cumulativeStats
//   UPP_CHART_DATA          -> default window stats + chartFilters.dateFilters
// The period dropdown POSTs /tipster/<slug>/dashboard-graph and returns the
// same chartData shape as UPP_CHART_DATA for the selected period.

import {
  ProtipsterChartBlock,
  ProtipsterOverview,
  ProtipsterPeriodStats,
  ProtipsterSummary,
} from './types'

// Same single-pass unescape discipline as crawler/platforms/apuestes/parse.ts:
// left-to-right, every backslash sequence decodes in one scan.
function unescapeJs(raw: string): string {
  return raw.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g, (_m, hex: string | undefined, ch: string) => {
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    switch (ch) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      default: return ch // \\ \" \' \/ and non-JSON escapes
    }
  })
}

// Extracts the args payload of one preload mutation. The observed formatting
// (2026-11-20, heroico + almo7tarif fixtures) is:
//   mutation: 'NAME',\n        args: [\n            <payload>\n        ],
// The terminator scan is anchored on that exact `\n        ],` sequence; if
// the site changes its formatting the parse returns null (hold), never a
// guessed payload.
function mutationPayload(html: string, name: string): unknown | null {
  const marker = `mutation: '${name}'`
  const mi = html.indexOf(marker)
  if (mi === -1) return null
  const ai = html.indexOf('args: [', mi)
  if (ai === -1) return null
  const start = ai + 'args: ['.length
  const end = html.indexOf('\n        ],', start)
  if (end === -1) return null
  const raw = html.slice(start, end).trim()
  try {
    return JSON.parse(unescapeJs(raw))
  } catch {
    return null
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function periodStats(src: unknown): ProtipsterPeriodStats | null {
  if (!src || typeof src !== 'object') return null
  const s = src as Record<string, unknown>
  const picks = num(s.picks)
  if (picks === null) return null
  return {
    profit: num(s.profit),
    stakes: num(s.stakes),
    picks,
    yield: num(s.yield),
    hitRate: num(s.hitRate),
    averageOdds: num(s.averageOdds),
  }
}

const MONTH_RE = /^\d{4}-\d{2}$/

export function parseDashboardGraph(body: string | unknown): ProtipsterChartBlock | null {
  const json = typeof body === 'string' ? body : JSON.stringify(body)
  let root: Record<string, unknown>
  try {
    root = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  const chartData = root.chartData as Record<string, unknown> | undefined
  const chartFilters = root.chartFilters as Record<string, unknown> | undefined
  const stats = periodStats(chartData?.globalGraphData)
  if (!stats || !chartFilters) return null
  const dateFilters = Array.isArray(chartFilters.dateFilters) ? chartFilters.dateFilters : []
  return {
    stats,
    defaultDateCriteria: String(chartFilters.defaultDateCriteria ?? ''),
    activeMonths: dateFilters.map(String).filter(d => MONTH_RE.test(d)),
  }
}

export interface ProtipsterProfileParse {
  overview: ProtipsterOverview | null
  summary: ProtipsterSummary | null
  chartDefault: ProtipsterChartBlock | null
}

export function parseProtipsterProfile(html: string): ProtipsterProfileParse {
  const ov = mutationPayload(html, 'UPP_DASHBOARD_OVERVIEW') as Record<string, unknown> | null
  const overview: ProtipsterOverview | null = ov
    ? {
        id: Number(ov.id),
        username: String(ov.username ?? ''),
        usernameCanonical: String(ov.usernameCanonical ?? ''),
        avatar: ov.avatar == null ? null : String(ov.avatar),
        userJoinDate: ov.userJoinDate == null ? null : String(ov.userJoinDate),
        countryCode: ov.countryCode == null ? null : String(ov.countryCode),
      }
    : null

  const sm = mutationPayload(html, 'UPP_SUMMARY_ADD_DATA') as Record<string, unknown> | null
  const smSummary = sm?.summary as Record<string, unknown> | undefined
  const cumulative = periodStats(sm?.cumulativeStats)
  const summary: ProtipsterSummary | null = smSummary && cumulative
    ? {
        followersCount: num(smSummary.followersCount),
        cumulativeStats: cumulative,
      }
    : null

  const ch = mutationPayload(html, 'UPP_CHART_DATA')
  const chartDefault = ch === null ? null : parseDashboardGraph(ch)

  return { overview, summary, chartDefault }
}
