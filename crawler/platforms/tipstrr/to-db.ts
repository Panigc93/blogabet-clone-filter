// Maps a loaded Tipstrr capture (FichaSnapshot from load-capture.ts) to a
// tipsters-table insert record. Pure: performs no DB write. Applying it is
// gated (migration + Neon + owner decision).
//
// Unit discipline:
// - profit is stored in Tipstrr UNITS with profitUnit='units' (never
//   converted to money; the EUR display is a view concern, x account stake).
// - price is the subscription price in GBP with priceCurrency='gbp'.
// - yield columns are unitless percentages. The all-time `yield` is stored
//   ONLY when every consistency check of this snapshot passes (roi =
//   profit/total staked verified on this record); otherwise null — never a
//   number we cannot defend. Period yields come from the source's exact
//   monthly figures (computeExactPeriodStats); incomplete windows are null.
// - Fields Tipstrr does not expose stay null (verifiedPct, followers,
//   resetCount stays 0 = "none exposed", sinceYear null in favor of
//   signupAt, lastPickAt null: month granularity is not a pick date).

import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import type { TipsterInsert } from '@/db/schema'
import { computeExactPeriodStats } from './periods'

export interface TipstrrDbMappingOptions {
  // tipsters.id is the source-provided PK (BB supplies its own numeric id).
  // Convention: Tipstrr rows use -portfolioId, so the two id spaces never
  // collide. portfolioId comes from the source's own data (e.g. captured
  // per-tip objects); never invent one.
  id: number
  slug: string
  subscriptionPriceGbp?: number | null // e.g. 39; null when unknown/free
  isPaid: boolean
}

export function tipstrrSnapshotToInsert(
  s: FichaSnapshot,
  opts: TipstrrDbMappingOptions
): TipsterInsert {
  const allConsistent = s.consistency.length > 0 && s.consistency.every((c) => c.passed)
  const periods = computeExactPeriodStats(s.monthState, new Date(s.capturedAtDate))

  const periodOrNull = (p: { yieldPct: number; complete: boolean } | null): string | null =>
    p && p.complete ? p.yieldPct.toFixed(2) : null

  return {
    id: opts.id,
    platform: 'tipstrr',
    slug: opts.slug,
    name: s.name,
    avatarUrl: s.avatarUrl,
    flagUrl: null,
    countryCode: null,
    isPaid: opts.isPaid,
    price: opts.subscriptionPriceGbp != null ? opts.subscriptionPriceGbp.toFixed(2) : null,
    profitUnit: 'units',
    priceCurrency: 'gbp',
    sinceYear: null,
    signupAt: s.signupDate ? new Date(`${s.signupDate}T00:00:00Z`) : null,
    capturedAt: new Date(s.capturedAtDate),
    picks: s.overview.tips ?? 0,
    profit: s.overview.tips !== null && s.monthState.length > 0
      ? s.monthState.reduce((acc, m) => acc + m.profit, 0).toFixed(3)
      : null,
    yield: allConsistent && s.overview.roiPct !== null ? s.overview.roiPct.toFixed(2) : null,
    verifiedPct: null,
    isVerified: false,
    followers: null,
    lastPickAt: null, // month granularity only; not a pick date
    resetCount: 0,
    lastResetAt: null,
    // Misma política que la ficha del laboratorio: la media de picks/mes
    // solo se guarda si la ventana de 6 meses cerrados está completa; con
    // ventana incompleta sería una media sobre menos meses aparentando 6.
    picks6mAvg: periods.yield6m !== null && periods.yield6m.complete && periods.picks6mAvg !== null
      ? periods.picks6mAvg.toFixed(2)
      : null,
    yield3m: periodOrNull(periods.yield3m),
    yield6m: periodOrNull(periods.yield6m),
    yield12m: periodOrNull(periods.yield12m),
    picksFree3mAvg: null, // free/paid monthly split: not evaluable (2026-11-15)
    yieldFree3m: null,
    statsUpdatedAt: new Date(s.capturedAtDate),
  }
}
