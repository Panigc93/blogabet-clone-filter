// Maps one captured ProTipster profile row (data/protipster/profiles.jsonl
// shape) to a tipsters-table insert record. Pure: performs no DB write.
// Applying it is gated (real import route + owner approval).
//
// Unit discipline (evidence 2026-11-20, docs/protipster-import-mapping.md):
// - profit/stakes are ProTipster UNITS (the site decorates them with '$';
//   stake presets are 5..100). They are never converted to money.
// - yield columns store the EXACT computed value profit/stakes*100 (2
//   decimals), not the site's 1-decimal display rounding; the site figure is
//   used as a cross-check only (|diff| > 0.15pp -> hold).
// - yield3m/yield6m are the site's ROLLING windows (boundary months clipped).
// - yield12m is the last 12 COMPLETE calendar months at capture time,
//   sum(profit)/sum(stakes) over full months (user-approved definition,
//   2026-11-20). The label with exact dates belongs to the product layer;
//   the mapping records the window via statsUpdatedAt/capturedAt.
// - A window with picks=0 imports yield NULL (true empty), never 0.
// - Fields ProTipster does not expose stay null (verifiedPct, lastPickAt:
//   month granularity only, like Apuestes). resetCount 0 = none exposed.

import type { TipsterInsert } from '@/db/schema'
import {
  protipsterAvatarUrl,
  type ProtipsterCaptureRow,
  type ProtipsterPeriodStats,
} from './types'

export type ProtipsterIdSource = 'source-captured' | 'internal-transactional' | 'isolated-fixture'

export interface ProtipsterDbMappingOptions {
  id: number
  idSource: ProtipsterIdSource
  slug: string // usernameCanonical, resolved collision-free within platform by the caller
  sourceUrl?: string | null
}

export type ProtipsterDbMapping =
  | { ok: true; insert: TipsterInsert }
  | { ok: false; klass: string; reason: string }

// --- privacy -------------------------------------------------------------
// Same rule as Apuestes: email-shaped usernames are masked and never leak
// into slug or sourceUrl. ProTipster canonical usernames are URL slugs, so
// this is a guard, not an observed case (bounded sample 2026-11-20).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/

export function isEmailLike(username: string): boolean {
  return EMAIL_RE.test(username)
}

export function protipsterDisplayName(username: string): string {
  if (!isEmailLike(username)) return username
  return `${username.split('@')[0].slice(0, 3)}***`
}

// The 12 complete calendar months at capture time: a capture on
// 2026-11-20 covers 2025-11 .. 2026-10 inclusive.
export function twelveMonthWindow(capturedAt: string): { from: string; through: string; months: string[] } {
  const d = new Date(capturedAt)
  if (Number.isNaN(d.getTime())) throw new Error(`invalid capturedAt: ${capturedAt}`)
  const months: string[] = []
  const cursor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, 1))
  for (let i = 0; i < 12; i++) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return { from: months[0], through: months[11], months }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Exact yield from exact profit/stakes; null only for a true empty window.
// picks>0 with missing/zero stakes is a capture inconsistency (null would
// misreport an active window as empty): caller holds the row.
function exactYield(w: ProtipsterPeriodStats): { yield: string | null; inconsistent: boolean } {
  if (w.picks === 0) return { yield: null, inconsistent: false }
  const profit = num(w.profit)
  const stakes = num(w.stakes)
  if (profit === null || stakes === null || stakes <= 0) return { yield: null, inconsistent: true }
  return { yield: ((profit / stakes) * 100).toFixed(2), inconsistent: false }
}

// The site rounds window yields to 1 decimal; allow that plus storage
// rounding before calling the capture inconsistent.
function siteYieldMatches(w: ProtipsterPeriodStats, exact: string): boolean {
  const site = num(w.yield)
  if (site === null) return true // no cross-check available
  return Math.abs(site - Number(exact)) <= 0.15
}

function inRange(y: string | null): boolean {
  return y === null || Math.abs(Number(y)) < 10000 // numeric(6,2)
}

export function protipsterRowToInsert(row: ProtipsterCaptureRow, opts: ProtipsterDbMappingOptions): ProtipsterDbMapping {
  if (row.quarantine) {
    return { ok: false, klass: 'cuarentena[capture]', reason: `quarantined at capture: ${row.quarantine.reason}` }
  }
  const { overview, summary, chartDefault, period3m } = row
  if (!overview || !summary || !chartDefault || !period3m) {
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'missing overview, summary, default chart block or 3m period: capture inconsistency' }
  }
  if (!Number.isInteger(overview.id) || !overview.usernameCanonical) {
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'overview without numeric id or usernameCanonical' }
  }
  const cum = summary.cumulativeStats
  if (cum.picks <= 0) {
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'cumulative picks missing or 0: nothing importable' }
  }
  if (chartDefault.defaultDateCriteria !== 'lastSixMonths') {
    return {
      ok: false,
      klass: 'cuarentena[capture-inconsistency]',
      reason: `default chart block is '${chartDefault.defaultDateCriteria}', expected 'lastSixMonths': cannot treat it as the 6m window`,
    }
  }

  // 12 complete calendar months: every active month inside the window must
  // have its exact monthly capture (months absent from activeMonths are
  // true zero-pick months, not missing data).
  const win = twelveMonthWindow(row.capturedAt)
  const requiredMonths = chartDefault.activeMonths.filter(m => m >= win.from && m <= win.through)
  const missing = requiredMonths.filter(m => !row.months[m])
  if (missing.length) {
    return {
      ok: false,
      klass: 'cuarentena[months-incomplete]',
      reason: `active months inside ${win.from}..${win.through} without exact monthly capture: ${missing.join(', ')}`,
    }
  }
  const m12: ProtipsterPeriodStats = { picks: 0, profit: 0, stakes: 0, yield: null, hitRate: null, averageOdds: null }
  for (const m of win.months) {
    const w = row.months[m]
    if (!w) continue // month without activity: true zero, not missing data
    if (w.picks > 0 && (num(w.profit) === null || num(w.stakes) === null || num(w.stakes)! <= 0)) {
      return {
        ok: false,
        klass: 'cuarentena[capture-inconsistency]',
        reason: `month ${m}: picks=${w.picks} but profit/stakes missing or stakes<=0; never summing 0 for missing`,
      }
    }
    m12.picks += w.picks
    m12.profit = (m12.profit ?? 0) + (num(w.profit) ?? 0)
    m12.stakes = (m12.stakes ?? 0) + (num(w.stakes) ?? 0)
  }

  const windows: [string, ProtipsterPeriodStats][] = [
    ['alltime', cum],
    ['3m', period3m],
    ['6m', chartDefault.stats],
    ['12m', m12],
  ]
  const exact: Record<string, string | null> = {}
  for (const [label, w] of windows) {
    const r = exactYield(w)
    if (r.inconsistent) {
      return { ok: false, klass: 'cuarentena[capture-inconsistency]', reason: `${label}: picks>0 but profit/stakes missing or stakes<=0` }
    }
    if (r.yield !== null) {
      if (!inRange(r.yield)) {
        return { ok: false, klass: 'cuarentena[yield-out-of-schema-range]', reason: `${label} yield ${r.yield} exceeds numeric(6,2)` }
      }
      if (label !== '12m' && !siteYieldMatches(w, r.yield)) {
        return {
          ok: false,
          klass: 'cuarentena[capture-inconsistency]',
          reason: `${label}: site yield ${String(w.yield)} vs computed ${r.yield} (>${0.15}pp apart)`,
        }
      }
    }
    exact[label] = r.yield
  }

  const emailLike = isEmailLike(overview.username) || isEmailLike(overview.usernameCanonical)
  const joinYear = overview.userJoinDate ? Number(overview.userJoinDate.slice(0, 4)) : NaN
  const oldestActive = chartDefault.activeMonths.slice().sort()[0]
  const captured = new Date(row.capturedAt)
  // userJoinDate has no timezone on the site; stored as UTC by convention
  // (date-granularity provenance, hour not relied upon).
  const signupAt = overview.userJoinDate ? new Date(overview.userJoinDate.replace(' ', 'T') + 'Z') : null
  const m6 = chartDefault.stats

  return { ok: true, insert: {
    id: opts.id,
    platform: 'protipster',
    slug: opts.slug,
    name: protipsterDisplayName(overview.username || overview.usernameCanonical),
    avatarUrl: protipsterAvatarUrl(overview.avatar),
    flagUrl: null,
    countryCode: overview.countryCode,
    isPaid: false, // product rule approved 2026-11-20: no known paid signal stays Free; not proof of universal gratuity
    price: null,
    profitUnit: 'protipster-units',
    priceCurrency: 'eur',
    sinceYear: Number.isFinite(joinYear) ? joinYear : (oldestActive ? Number(oldestActive.slice(0, 4)) : null),
    signupAt,
    capturedAt: captured,
    picks: cum.picks,
    profit: num(cum.profit) !== null ? num(cum.profit)!.toFixed(3) : null,
    yield: exact.alltime,
    verifiedPct: null, // not exposed by ProTipster
    isVerified: false, // schema notNull; source exposes no verification
    followers: summary.followersCount,
    lastPickAt: null, // month granularity only; not a pick date
    resetCount: 0,
    lastResetAt: null,
    picks6mAvg: m6.picks > 0 ? (m6.picks / 6).toFixed(2) : null,
    yield3m: exact['3m'],
    yield6m: exact['6m'],
    yield12m: exact['12m'],
    picksFree3mAvg: null, // source has no separately verified free/paid statistics split
    yieldFree3m: null,
    statsUpdatedAt: captured,
    sourcePortfolioId: overview.id, // ProTipster numeric user id: natural key evidence
    sourceUrl: emailLike ? null : (opts.sourceUrl ?? null),
  } }
}

// Mirror of the apuestes guard: rejects isolated-fixture ids before any real
// write. No real callers yet (tests only).
export function assertProtipsterImportProvenance(idSource: ProtipsterIdSource, slug: string): void {
  if (idSource === 'isolated-fixture') {
    throw new Error(
      `import real rechazado para ${slug}: idSource '${idSource}' — los ids provisionales del entorno aislado no son payload importable`
    )
  }
}

// Upsert merge. Contrato de ausencia vs vacío idéntico a apuestes: el
// mapping NUNCA emite null por falta de dato (esa fila queda held); un null
// nuevo es un VACÍO VERDADERO (ventana con picks=0), así que la mezcla
// SOBREESCRIBE todas las columnas gestionadas, nulls incluidos. Identidad
// inmutable (id/platform/slug). Pura: no toca la DB.
export function mergeProtipsterUpdate(existing: TipsterInsert, next: TipsterInsert): TipsterInsert {
  return {
    ...next,
    id: existing.id,
    platform: existing.platform,
    slug: existing.slug,
  }
}
