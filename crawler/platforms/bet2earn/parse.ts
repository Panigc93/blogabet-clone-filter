// Parses the raw Bet2Earn API JSON (profile + settled history) into a
// consolidated capture row. The capture itself is plain JSON; this module
// validates shapes and derives the month aggregates from the per-pick
// created_at (the site's proven monthly bucketing, see
// docs/bet2earn-import-mapping.md). A malformed payload returns null/holds,
// never a guessed value.

import type {
  Bet2earnCaptureRow,
  Bet2earnPick,
  Bet2earnProfile,
} from './types'

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export function parseBet2earnProfile(body: unknown): Bet2earnProfile | null {
  if (!body || typeof body !== 'object') return null
  const users = (body as Record<string, unknown>).users
  if (!users || typeof users !== 'object') return null
  const u = users as Record<string, unknown>
  const id = str(u.id)
  const name = str(u.name)
  if (!id || !name) return null
  return {
    id,
    name,
    avatar: str(u.avatar),
    created_at: str(u.created_at),
    count_tips: num(u.count_tips),
    tipsExpiredCount: num(u.tipsExpiredCount),
    followers_count: num(u.followers_count),
    yield: num(u.yield),
    profit: num(u.profit),
  }
}

export function parseBet2earnHistory(body: unknown): Bet2earnPick[] | null {
  if (!body || typeof body !== 'object') return null
  const tips = (body as Record<string, unknown>).tipsFullExpired
  if (!Array.isArray(tips)) return null
  const picks: Bet2earnPick[] = []
  for (const t of tips) {
    if (!t || typeof t !== 'object') return null // one bad pick poisons the capture
    const p = t as Record<string, unknown>
    const id = str(p.id)
    if (!id) return null
    picks.push({
      id,
      created_at: str(p.created_at),
      validation_date: str(p.validation_date),
      profit: num(p.profit),
      stake: num(p.stake),
      odds: num(p.odds),
      sport: str(p.sport),
    })
  }
  return picks
}

const MONTH_RE = /^\d{4}-\d{2}/

// Aggregates by created_at month (publication date). A pick without a
// parseable created_at makes the whole aggregation null: partial month data
// would silently corrupt every window.
export function aggregateMonths(
  picks: Bet2earnPick[],
): { months: Record<string, { picks: number; profit: number; stakes: number }>; lastPickAt: string | null } | null {
  const months: Record<string, { picks: number; profit: number; stakes: number }> = {}
  let lastPickAt: string | null = null
  for (const p of picks) {
    const created = p.created_at
    if (!created || !MONTH_RE.test(created)) return null
    const ym = created.slice(0, 7)
    const m = (months[ym] = months[ym] ?? { picks: 0, profit: 0, stakes: 0 })
    m.picks += 1
    m.profit += p.profit ?? 0
    m.stakes += p.stake ?? 0
    if (lastPickAt === null || created > lastPickAt) lastPickAt = created
  }
  return { months, lastPickAt }
}

export interface Bet2earnConsolidateInput {
  slug: string
  capturedAt: string
  listSource: 'premium' | 'free'
  profileBody: unknown
  historyBody: unknown
}

export function consolidateBet2earnCapture(input: Bet2earnConsolidateInput): Bet2earnCaptureRow {
  const profile = parseBet2earnProfile(input.profileBody)
  const picks = parseBet2earnHistory(input.historyBody)
  if (!profile || picks === null) {
    return {
      slug: input.slug,
      capturedAt: input.capturedAt,
      sourceUrl: '',
      listSource: input.listSource,
      profile,
      expiredPicks: 0,
      months: {},
      totals: null,
      lastPickAt: null,
      quarantine: { reason: 'profile or history payload did not parse' },
    }
  }
  if (profile.name.toLowerCase() !== input.slug) {
    return {
      slug: input.slug,
      capturedAt: input.capturedAt,
      sourceUrl: '',
      listSource: input.listSource,
      profile,
      expiredPicks: 0,
      months: {},
      totals: null,
      lastPickAt: null,
      quarantine: { reason: `profile name '${profile.name}' does not match requested slug '${input.slug}'` },
    }
  }
  const agg = aggregateMonths(picks)
  if (!agg) {
    return {
      slug: input.slug,
      capturedAt: input.capturedAt,
      sourceUrl: '',
      listSource: input.listSource,
      profile,
      expiredPicks: picks.length,
      months: {},
      totals: null,
      lastPickAt: null,
      quarantine: { reason: 'pick without parseable created_at: month aggregation refused' },
    }
  }
  let profit = 0
  let stakes = 0
  for (const p of picks) {
    profit += p.profit ?? 0
    stakes += p.stake ?? 0
  }
  return {
    slug: input.slug,
    capturedAt: input.capturedAt,
    sourceUrl: '',
    listSource: input.listSource,
    profile,
    expiredPicks: picks.length,
    months: agg.months,
    totals: { picks: picks.length, profit, stakes },
    lastPickAt: agg.lastPickAt,
    quarantine: null,
  }
}
