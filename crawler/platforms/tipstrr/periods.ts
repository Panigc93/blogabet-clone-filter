// Exact Blogabet-parity period stats for Tipstrr, computed from the source's
// own exact monthly figures (tips, staked, profit). Pure module: no DOM
// parsing, safe to import from app code.

export interface TipstrrMonthStateRow {
  year: number
  month: number // 1-12
  tips: number
  staked: number // exact units staked, from the source
  profit: number // exact units profit, from the source
  roiPct: number | null // display value, NOT used as a denominator source
  winPct: number | null
  avgOdds: number | null
  voidTips: number
}

export interface TipstrrPeriodStat {
  yieldPct: number
  tips: number
  staked: number
  profit: number
  months: number // closed months with an actual source row in this window
  complete: boolean // false when the window has fewer months than asked or calendar gaps; an absent month is never treated as 0
  from: string // 'YYYY-MM' oldest closed month included
  to: string // 'YYYY-MM' newest closed month included
}

export interface TipstrrPeriodStats {
  yield3m: TipstrrPeriodStat | null
  yield6m: TipstrrPeriodStat | null
  yield12m: TipstrrPeriodStat | null
  picks6mAvg: number | null
}

function isClosedMonth(row: { year: number; month: number }, now: Date): boolean {
  return row.year < now.getUTCFullYear() || (row.year === now.getUTCFullYear() && row.month < now.getUTCMonth() + 1)
}

function monthIndex(r: { year: number; month: number }): number {
  return r.year * 12 + r.month
}

// yield = total profit / total staked over the last N CLOSED months (same
// closed-month rule as the BB card), both figures summed from the source's
// exact monthly values. Zero-profit months count normally (the denominator
// does not depend on them). Percentages are never averaged. A period with
// no closed months is null. Coverage (from/to, months, complete) always
// comes out of this calculation, never a fixed label.
// Accepts any row shape with the five exact fields (full parser output or a
// minimal capture fixture).
export function computeExactPeriodStats(
  rows: Pick<TipstrrMonthStateRow, 'year' | 'month' | 'tips' | 'staked' | 'profit'>[],
  now: Date,
): TipstrrPeriodStats {
  const closed = rows
    .filter((r) => isClosedMonth(r, now))
    .sort((a, b) => b.year - a.year || b.month - a.month)
  const ym = (r: { year: number; month: number }) => `${r.year}-${String(r.month).padStart(2, '0')}`
  const over = (n: number): TipstrrPeriodStat | null => {
    const sel = closed.slice(0, n)
    if (sel.length === 0) return null
    const tips = sel.reduce((s, r) => s + r.tips, 0)
    const staked = sel.reduce((s, r) => s + r.staked, 0)
    const profit = sel.reduce((s, r) => s + r.profit, 0)
    if (staked === 0) return null
    // A month with an explicit row and 0 tips/0 staked is real coverage (a
    // month with no bets) and counts in `months`. A month with no row is
    // absent data: it is never zero-filled, and it makes the window
    // incomplete (fewer rows than asked, or a gap between from and to).
    const span = monthIndex(sel[0]) - monthIndex(sel[sel.length - 1]) + 1
    const complete = sel.length === n && sel.length === span
    return {
      yieldPct: (profit / staked) * 100,
      tips,
      staked,
      profit,
      months: sel.length,
      complete,
      from: ym(sel[sel.length - 1]),
      to: ym(sel[0]),
    }
  }
  const picksSel = closed.slice(0, 6)
  return {
    yield3m: over(3),
    yield6m: over(6),
    yield12m: over(12),
    picks6mAvg: picksSel.length > 0 ? picksSel.reduce((s, r) => s + r.tips, 0) / picksSel.length : null,
  }
}
