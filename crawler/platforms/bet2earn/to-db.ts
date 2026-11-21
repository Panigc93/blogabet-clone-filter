// Maps one consolidated Bet2Earn capture row (data/bet2earn/profiles.jsonl)
// to a tipsters-table insert record. Pure: performs no DB write. Applying it
// is gated (real import route + explicit owner approval; production DB).
//
// Unit discipline (evidence 2026-11-20/21, docs/bet2earn-import-mapping.md):
// - profit/stakes are Bet2Earn UNITS (fractional stakes 0.1-1); never money.
// - yield columns store the EXACT computed sum(profit)/sum(stakes)*100 (2
//   decimals), never the source display rounding. The published profile
//   yield is only a cross-check, with the tolerance implied by its own
//   published precision: integer -> uniform rounding interval +-0.5; two
//   decimals -> +-0.005. Per-pick figures arrive unrounded, so no
//   propagated rounding error exists beyond the published value itself.
// - yield3m/yield6m/yield12m are the last 3/6/12 COMPLETE calendar months
//   at capture time (created_at bucketing, the site's own monthly
//   criterion). The 12-complete-month definition reuses the owner-approved
//   ProTipster definition (WhatsApp 2026-11-20, "12 meses naturales
//   completos"); it is not a rolling window and never mixes with one.
// - A window with picks=0 imports yield NULL (true empty), never 0.
// - lastPickAt is a REAL per-pick date here (unlike Apuestes/ProTipster
//   month granularity): the max created_at of the captured history.
// - Fields Bet2Earn does not expose stay null (verifiedPct, countryCode in
//   the observed capture, resetCount 0 = none exposed).
//
// Holds (quarantined rows never write tipsters rows):
// - cuarentena[no-usable-content]: history empty or not exposed anonymously
// - cuarentena[history-incomplete]: captured expired picks != declared
//   tipsExpiredCount
// - cuarentena[yield-out-of-interval]: published yield vs exact computed
//   outside its own rounding interval
// - cuarentena[capture-inconsistency]: anything structurally off

import type { TipsterInsert } from '@/db/schema'
import {
  bet2earnAvatarUrl,
  type Bet2earnCaptureRow,
} from './types'

export type Bet2earnIdSource = 'source-captured' | 'internal-transactional' | 'isolated-fixture'

export interface Bet2earnDbMappingOptions {
  id: number
  idSource: Bet2earnIdSource
  slug: string // resolved collision-free within platform by the caller
  sourceUrl?: string | null
}

export type Bet2earnDbMapping =
  | { ok: true; insert: TipsterInsert }
  | { ok: false; klass: string; reason: string }

// Complete calendar months window ending the month before capture:
// a capture on 2026-11-21 with months=12 covers 2025-11..2026-10 inclusive.
export function completeMonthWindow(capturedAt: string, months: number): { from: string; through: string; keys: string[] } {
  const d = new Date(capturedAt)
  if (Number.isNaN(d.getTime())) throw new Error(`invalid capturedAt: ${capturedAt}`)
  const keys: string[] = []
  const cursor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1))
  for (let i = 0; i < months; i++) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return { from: keys[0], through: keys[keys.length - 1], keys }
}

// Tolerance implied by the published yield's own lexical precision.
// An integer-published yield (15) admits +-0.5 (uniform rounding interval);
// a two-decimal one (15.74) admits +-0.005. Per-pick source figures are
// unrounded, so there is no propagated error to add.
export function publishedYieldTolerance(published: number): number {
  const decimals = (String(published).split('.')[1] ?? '').length
  return decimals === 0 ? 0.5 : 10 ** -decimals / 2
}

export function publishedYieldMatches(published: number | null, exact: string): boolean {
  if (published === null) return true // no cross-check available
  return Math.abs(published - Number(exact)) <= publishedYieldTolerance(published) + 1e-9
}

function inRange(y: string | null): boolean {
  return y === null || Math.abs(Number(y)) < 10000 // numeric(6,2)
}

export function bet2earnRowToInsert(row: Bet2earnCaptureRow, opts: Bet2earnDbMappingOptions): Bet2earnDbMapping {
  if (row.quarantine) {
    return { ok: false, klass: 'cuarentena[capture]', reason: `quarantined at capture: ${row.quarantine.reason}` }
  }
  const { profile, totals } = row
  if (!profile || !totals) {
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'missing profile or totals: capture inconsistency' }
  }
  if (row.expiredPicks === 0) {
    // Anonymous visibility gap (1619 free profiles) or genuinely empty:
    // never importable as a real zero; cause unproven, see mapping doc.
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'captured history empty; not evidence of zero picks' }
  }
  if (profile.tipsExpiredCount === null || row.expiredPicks !== profile.tipsExpiredCount) {
    return {
      ok: false,
      klass: 'cuarentena[history-incomplete]',
      reason: `captured ${row.expiredPicks} expired picks but profile declares tipsExpiredCount=${String(profile.tipsExpiredCount)}`,
    }
  }
  if (totals.stakes <= 0) {
    return { ok: false, klass: 'cuarentena[capture-inconsistency]', reason: 'picks>0 but total stakes<=0' }
  }
  const exactAll = ((totals.profit / totals.stakes) * 100).toFixed(2)
  if (!inRange(exactAll)) {
    return { ok: false, klass: 'cuarentena[yield-out-of-schema-range]', reason: `all-time yield ${exactAll} exceeds numeric(6,2)` }
  }
  if (!publishedYieldMatches(profile.yield, exactAll)) {
    return {
      ok: false,
      klass: 'cuarentena[yield-out-of-interval]',
      reason: `published yield ${String(profile.yield)} vs computed ${exactAll} outside its own rounding interval`,
    }
  }

  // Window yields from complete calendar months (created_at bucketing).
  const exactWindow = (months: number): { yield: string | null; picks: number } => {
    const win = completeMonthWindow(row.capturedAt, months)
    let picks = 0
    let profit = 0
    let stakes = 0
    for (const k of win.keys) {
      const m = row.months[k]
      if (!m) continue // month without picks: true zero, not missing data
      picks += m.picks
      profit += m.profit
      stakes += m.stakes
    }
    if (picks === 0) return { yield: null, picks: 0 }
    if (stakes <= 0) return { yield: null, picks } // caller treats as inconsistency below
    return { yield: ((profit / stakes) * 100).toFixed(2), picks }
  }
  const w3 = exactWindow(3)
  const w6 = exactWindow(6)
  const w12 = exactWindow(12)
  for (const [label, w] of [['3m', w3], ['6m', w6], ['12m', w12]] as const) {
    if (w.picks > 0 && w.yield === null) {
      return { ok: false, klass: 'cuarentena[capture-inconsistency]', reason: `${label}: picks>0 but stakes<=0` }
    }
    if (!inRange(w.yield)) {
      return { ok: false, klass: 'cuarentena[yield-out-of-schema-range]', reason: `${label} yield ${String(w.yield)} exceeds numeric(6,2)` }
    }
  }

  const captured = new Date(row.capturedAt)
  const joinYear = profile.created_at ? Number(profile.created_at.slice(0, 4)) : NaN
  // created_at has no timezone on the site; stored as UTC by convention
  // (same discipline as ProTipster's userJoinDate).
  const signupAt = profile.created_at ? new Date(profile.created_at.replace(' ', 'T') + 'Z') : null
  const lastPickAt = row.lastPickAt ? new Date(row.lastPickAt.replace(' ', 'T') + 'Z') : null

  return { ok: true, insert: {
    id: opts.id,
    platform: 'bet2earn',
    slug: opts.slug,
    name: profile.name,
    avatarUrl: bet2earnAvatarUrl(profile.avatar),
    flagUrl: null,
    countryCode: null, // null in the whole observed capture; never fabricated
    isPaid: row.listSource === 'premium', // listing provenance; free = owner product rule 2026-11-20 for unconfirmed
    price: null, // package prices not reliably exposed in the profile payload
    profitUnit: 'bet2earn-units',
    priceCurrency: 'eur',
    sinceYear: Number.isFinite(joinYear) ? joinYear : null,
    signupAt,
    capturedAt: captured,
    picks: totals.picks,
    profit: totals.profit.toFixed(3),
    yield: exactAll,
    verifiedPct: null, // not exposed by Bet2Earn
    isVerified: false, // schema notNull; source exposes no verification
    followers: profile.followers_count,
    lastPickAt, // real per-pick date (max created_at)
    resetCount: 0,
    lastResetAt: null,
    picks6mAvg: w6.picks > 0 ? (w6.picks / 6).toFixed(2) : null,
    yield3m: w3.yield,
    yield6m: w6.yield,
    yield12m: w12.yield,
    picksFree3mAvg: null, // no separately verified free/paid statistics split
    yieldFree3m: null,
    statsUpdatedAt: captured,
    sourcePortfolioId: null, // source key is a UUID; does not fit the integer column. UUID preserved in the private capture.
    sourceUrl: opts.sourceUrl ?? null,
  } }
}

// Mirror of the protipster guard: rejects isolated-fixture ids before any
// real write. No real callers yet (tests only).
export function assertBet2earnImportProvenance(idSource: Bet2earnIdSource, slug: string): void {
  if (idSource === 'isolated-fixture') {
    throw new Error(
      `import real rechazado para ${slug}: idSource '${idSource}' — los ids provisionales del entorno aislado no son payload importable`
    )
  }
}

// Upsert merge. Same absence-vs-empty contract as apuestes/protipster: the
// mapping NEVER emits null for missing data (that row is held); a new null
// is a TRUE EMPTY (window with picks=0), so the merge OVERWRITES every
// managed column, nulls included. Immutable identity (id/platform/slug).
export function mergeBet2earnUpdate(existing: TipsterInsert, next: TipsterInsert): TipsterInsert {
  return {
    ...next,
    id: existing.id,
    platform: existing.platform,
    slug: existing.slug,
  }
}
