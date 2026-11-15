// Parser for Tipstrr's own hydration state on /tipster/<slug>/stats pages.
//
// Verified structure (2026-11-15, anonymous live read): every page embeds
// <script id="tipstrr-state" type="application/json"> with '"' encoded as
// &q;. PORTFOLIO["<slug>_"].overview carries BOTH stake bases:
//   profit / roi             (advised stakes)
//   levelStakeProfit / levelStakeROI
// plus tips, averageStake, winPercentage, period, dateGenerated.
//
// What was verified and what was not (one-off reads, no account):
// - StatMind (uniform 10/10 staking): roi = profit / total staked EXACTLY
//   (-59.13 / 291 = -20.32%), all live breakdown rows close, advised ==
//   level, and the stake table shows 291/291 tips in one band. Per-record
//   consistency held on every check below.
// - VB TIPS (variable stakes): live tables reconcile with each other
//   (profits and tip counts sum identically) but non-10/10 band rows close
//   under NO uniform stake mapping, and it is undetermined which basis the
//   ROI column shows. Field names alone prove nothing about the denominator.
// - Voids: no void in StatMind's record; treatment unverified.
// - Per-tip odds/profit require an account; aggregates only.
//
// Therefore MYS-Y is evaluated ONLY when every per-record consistency check
// passes (uniformity alone is necessary, not sufficient). Otherwise yield
// is NOT EVALUABLE and the source ROI is preserved as a labelled source
// metric. ROI >= 11 is never applied as a validated Y filter on its own.

import * as cheerio from 'cheerio'
import { evaluateMys, type MysResult } from '../mys'

export interface TipstrrOverview {
  slug: string
  tips: number | null
  profitUnits: number | null
  roiPct: number | null // advised basis, source's own figure
  levelStakeProfitUnits: number | null
  levelStakeRoiPct: number | null
  averageStakeUnits: number | null // in 10/10 units; 1 = always max stake
  winRatePct: number | null
  periodMonths: number | null
  dateGenerated: string | null
}

export interface StakeBand {
  band: string // e.g. '10 / 10'
  numerator: number // stake units, e.g. 10
  denominator: number // e.g. 10
  tips: number
}

export type StakeUniformity = 'uniform' | 'mixed' | 'unknown'

export interface TipstrrMysAssessment extends MysResult {
  yieldEvaluable: boolean
  yieldBasis: string
  sourceRoiPct: number | null // preserved even when not evaluable
  consistencyChecks: { name: string; passed: boolean }[]
  note: string
}

// Extracts and decodes the embedded tipstrr-state JSON. Returns null when
// the page has no such script (unexpected shape change -> caller treats
// everything as unknown, never as zero).
export function decodeTipstrrState(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html)
  const raw = $('#tipstrr-state').first().text()
  if (!raw) return null
  try {
    return JSON.parse(raw.replace(/&q;/g, '"')) as Record<string, unknown>
  } catch {
    return null
  }
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function parseOverview(html: string): TipstrrOverview | null {
  const state = decodeTipstrrState(html)
  if (!state || typeof state.PORTFOLIO !== 'object' || state.PORTFOLIO === null) return null
  const key = Object.keys(state.PORTFOLIO as object)[0]
  if (!key) return null
  const portfolio = (state.PORTFOLIO as Record<string, unknown>)[key]
  if (typeof portfolio !== 'object' || portfolio === null) return null
  const overview = (portfolio as Record<string, unknown>).overview
  if (typeof overview !== 'object' || overview === null) return null
  const o = overview as Record<string, unknown>
  return {
    slug: key.replace(/_$/, ''),
    tips: asNum(o.tips),
    profitUnits: asNum(o.profit),
    roiPct: asNum(o.roi),
    levelStakeProfitUnits: asNum(o.levelStakeProfit),
    levelStakeRoiPct: asNum(o.levelStakeROI),
    averageStakeUnits: asNum(o.averageStake),
    winRatePct: asNum(o.winPercentage),
    periodMonths: asNum(o.period),
    dateGenerated: typeof o.dateGenerated === 'string' ? o.dateGenerated : null,
  }
}

// Stake distribution from the rendered "How likely ... staking options"
// table: rows like "5 / 10 | 73 | ...".
export function parseStakeBands(html: string): StakeBand[] {
  const $ = cheerio.load(html)
  const bands: StakeBand[] = []
  $('table').each((_, table) => {
    const headers = $(table)
      .find('thead th')
      .map((__, th) => $(th).text().trim().toLowerCase())
      .get()
    if (!headers.some((h) => h.startsWith('stake'))) return
    $(table)
      .find('tbody tr')
      .each((__, tr) => {
        const cells = $(tr)
          .find('td, th')
          .map((___, c) => $(c).text().trim())
          .get()
        const m = cells[0]?.match(/^(\d+)\s*\/\s*(\d+)$/)
        const tips = parseInt((cells[1] ?? '').replace(/,/g, ''), 10)
        if (m && Number.isFinite(tips)) {
          bands.push({ band: cells[0], numerator: parseInt(m[1], 10), denominator: parseInt(m[2], 10), tips })
        }
      })
  })
  return bands
}

export function stakeUniformity(bands: StakeBand[]): StakeUniformity {
  const total = bands.reduce((s, b) => s + b.tips, 0)
  if (total === 0) return 'unknown'
  return bands.filter((b) => b.tips > 0).length === 1 ? 'uniform' : 'mixed'
}

// Per-record consistency checks. Uniformity alone is NOT enough: each must
// hold before the source ROI may be treated as Juan's yield.
export function consistencyChecks(overview: TipstrrOverview, bands: StakeBand[]): { name: string; passed: boolean }[] {
  const nonZero = bands.filter((b) => b.tips > 0)
  const bandTotal = bands.reduce((s, b) => s + b.tips, 0)
  const uniformBand = nonZero.length === 1 ? nonZero[0] : null
  const checks: { name: string; passed: boolean }[] = []

  checks.push({ name: 'stake table shows a single band', passed: uniformBand !== null })
  if (uniformBand && overview.tips !== null) {
    checks.push({ name: 'stake-table tip total matches overview tips', passed: bandTotal === overview.tips })
  }
  if (uniformBand && overview.averageStakeUnits !== null) {
    // averageStake is in 10/10 units: uniform k/10 must equal k/10
    const expected = uniformBand.numerator / uniformBand.denominator
    checks.push({ name: 'averageStake matches the uniform band', passed: Math.abs(overview.averageStakeUnits - expected) < 0.01 })
  }
  if (overview.profitUnits !== null && overview.levelStakeProfitUnits !== null) {
    checks.push({ name: 'advised profit equals level-stake profit', passed: Math.abs(overview.profitUnits - overview.levelStakeProfitUnits) < 0.01 })
  }
  if (overview.roiPct !== null && overview.levelStakeRoiPct !== null) {
    checks.push({ name: 'advised ROI equals level-stake ROI', passed: Math.abs(overview.roiPct - overview.levelStakeRoiPct) < 0.01 })
  }
  if (overview.tips && overview.averageStakeUnits && overview.profitUnits !== null && overview.roiPct !== null) {
    const staked = overview.tips * overview.averageStakeUnits
    const derived = (overview.profitUnits / staked) * 100
    checks.push({ name: 'roi = profit / total staked closes (±0.05)', passed: Math.abs(derived - overview.roiPct) < 0.05 })
  }
  return checks
}

// MYS assessment with per-record gating. When any check fails (or the data
// needed for a check is absent), yield is NOT evaluable: muestra may still
// be known, but yield and passesMY stay null and the source ROI is kept
// only as sourceRoiPct. Even when evaluable, void handling remains an
// open caveat recorded in the note.
export function assessTipstrrMys(overview: TipstrrOverview, bands: StakeBand[]): TipstrrMysAssessment {
  const checks = consistencyChecks(overview, bands)
  const evaluable = checks.length > 0 && checks.every((c) => c.passed)
  const base: TipstrrMysAssessment = {
    muestra: null,
    yield: null,
    passesMY: null,
    yieldEvaluable: evaluable,
    yieldBasis: evaluable
      ? 'profit/total staked; advised=level y cierre aritmético verificados en ESTE registro'
      : 'no evaluable: stake variable/desconocido o chequeos de consistencia fallidos',
    sourceRoiPct: overview.roiPct,
    consistencyChecks: checks,
    note: evaluable
      ? 'ROI verificado como yield (profit/total staked) para este registro; tratamiento de voids sin verificar'
      : 'ROI conservado solo como métrica de fuente; NO usar como yield ni filtro Y>=11',
  }
  if (!evaluable) {
    const m = evaluateMys({ picks: overview.tips, yieldPct: null })
    return { ...base, muestra: m.muestra, yield: null, passesMY: m.passesMY }
  }
  const m = evaluateMys({ picks: overview.tips, yieldPct: overview.roiPct })
  return { ...base, muestra: m.muestra, yield: m.yield, passesMY: m.passesMY }
}

// ─── Blogabet-parity stat extraction ────────────────────────────────────────
// Fields the Superblogabet tipster card shows for Blogabet, mapped to what
// Tipstrr's public /stats page actually offers (verified 2026-11-15).

export interface TipstrrMonthRow {
  label: string // e.g. 'Nov 2026'
  year: number
  month: number // 1-12
  tips: number | null
  winRatePct: number | null
  profitLabel: string // currency as displayed, e.g. '-£189.74'
  profitAmount: number | null // parsed, in display currency
  roiPct: number | null
  avgOdds: number | null
}

export interface TipstrrProfileHeader {
  name: string | null
  sinceLabel: string | null // e.g. 'October 2026'
  avatarUrl: string | null
  isPaid: boolean | null // heuristic: any membership enabled in state
  activeTips: number | null
  dateCreated: string | null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export function parseMoneyLabel(label: string): number | null {
  const m = label.trim().match(/^(-?)[£$€]?([\d,]+(?:\.\d+)?)$/)
  if (!m) return null
  const v = parseFloat(m[2].replace(/,/g, ''))
  return m[1] === '-' ? -v : v
}

// "VB TIPS's historical monthly breakdown" table:
// Month | Tips | Win rate | Profit | ROI | Avg. odds
export function parseMonthlyBreakdown(html: string): TipstrrMonthRow[] {
  const $ = cheerio.load(html)
  const rows: TipstrrMonthRow[] = []
  $('table').each((_, table) => {
    const headers = $(table)
      .find('thead th')
      .map((__, th) => $(th).text().trim().toLowerCase())
      .get()
    if (!headers.some((h) => h.startsWith('month'))) return
    $(table)
      .find('tbody tr')
      .each((__, tr) => {
        const cells = $(tr)
          .find('td, th')
          .map((___, c) => $(c).text().trim())
          .get()
        const dm = cells[0]?.match(/^([A-Za-z]{3})\w*\s+(\d{4})$/)
        if (!dm) return
        const month = MONTHS[dm[1].toLowerCase()]
        const year = parseInt(dm[2], 10)
        if (!month || !Number.isFinite(year)) return
        const num = (s: string | undefined) => {
          const v = parseFloat((s ?? '').replace(/[%,\s]/g, ''))
          return Number.isFinite(v) ? v : null
        }
        rows.push({
          label: cells[0],
          year,
          month,
          tips: num(cells[1]),
          winRatePct: num(cells[2]),
          profitLabel: cells[3] ?? '',
          profitAmount: cells[3] ? parseMoneyLabel(cells[3]) : null,
          roiPct: num(cells[4]),
          avgOdds: num(cells[5] ?? ''),
        })
      })
  })
  return rows
}

function isClosedMonth(row: { year: number; month: number }, now: Date): boolean {
  return row.year < now.getUTCFullYear() || (row.year === now.getUTCFullYear() && row.month < now.getUTCMonth() + 1)
}

// ─── Exact monthly figures from the hydration state ─────────────────────────
// STATS_MONTH carries the source's own EXACT per-month figures, including
// `staked` (total units staked that month). This is what makes period yields
// exact: never derive a denominator as profit/roi from the ROUNDED display
// percentages when this field exists. Verified 2026-11-15 on
// the-least-expected: staked == tips every month (flat 1u), sum of staked and
// profit over all months closes exactly with the all-time overview.

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

export function parseMonthlyState(html: string): TipstrrMonthStateRow[] {
  const state = decodeTipstrrState(html)
  const sm = state?.STATS_MONTH
  if (!sm || typeof sm !== 'object') return []
  const rows: TipstrrMonthStateRow[] = []
  for (const list of Object.values(sm as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    for (const m of list) {
      if (!m || typeof m !== 'object') continue
      const r = m as Record<string, unknown>
      const d = typeof r.date === 'string' ? new Date(r.date) : null
      if (!d || !Number.isFinite(d.getTime())) continue
      const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
      const tips = num(r.tips)
      const staked = num(r.staked)
      const profit = num(r.profit)
      if (tips === null || staked === null || profit === null) continue
      rows.push({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        tips,
        staked,
        profit,
        roiPct: num(r.roi),
        winPct: num(r.winPercentage),
        avgOdds: num(r.averageOdds),
        voidTips: num(r.void) ?? 0,
      })
    }
  }
  rows.sort((a, b) => b.year - a.year || b.month - a.month)
  return rows
}

export interface TipstrrPeriodStat {
  yieldPct: number
  tips: number
  staked: number
  months: number
  from: string // 'YYYY-MM' oldest closed month included
  to: string // 'YYYY-MM' newest closed month included
}

// Blogabet-parity period stats, EXACT: yield = total profit / total staked
// over the last N CLOSED months (same closed-month rule as the BB card),
// both figures summed from the source's exact monthly values. Zero-profit
// months count normally (the denominator does not depend on them).
// Percentages are never averaged. A period with no closed months is null.
export function computeExactPeriodStats(
  rows: TipstrrMonthStateRow[],
  now: Date,
): { yield3m: TipstrrPeriodStat | null; yield6m: TipstrrPeriodStat | null; yield12m: TipstrrPeriodStat | null; picks6mAvg: number | null } {
  const closed = rows
    .filter((r) => isClosedMonth(r, now))
    .sort((a, b) => b.year - a.year || b.month - a.month)
  const ym = (r: TipstrrMonthStateRow) => `${r.year}-${String(r.month).padStart(2, '0')}`
  const over = (n: number): TipstrrPeriodStat | null => {
    const sel = closed.slice(0, n)
    if (sel.length === 0) return null
    const tips = sel.reduce((s, r) => s + r.tips, 0)
    const staked = sel.reduce((s, r) => s + r.staked, 0)
    const profit = sel.reduce((s, r) => s + r.profit, 0)
    if (staked === 0) return null
    return {
      yieldPct: (profit / staked) * 100,
      tips,
      staked,
      months: sel.length,
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

export function parseProfileHeader(html: string): TipstrrHeader {
  const $ = cheerio.load(html)
  const state = decodeTipstrrState(html)
  let isPaid: boolean | null = null
  let activeTips: number | null = null
  let dateCreated: string | null = null
  let avatarUrl: string | null = null
  let name: string | null = null
  if (state && typeof state.PORTFOLIO === 'object' && state.PORTFOLIO !== null) {
    const key = Object.keys(state.PORTFOLIO as object)[0]
    const p = key ? (state.PORTFOLIO as Record<string, unknown>)[key] : null
    if (p && typeof p === 'object') {
      const rec = p as Record<string, unknown>
      name = typeof rec.name === 'string' ? rec.name : null
      avatarUrl = typeof rec.profileImageUrl === 'string' ? rec.profileImageUrl : null
      dateCreated = typeof rec.dateCreated === 'string' ? rec.dateCreated : null
      activeTips = asNum(rec.activeTips)
      const membershipFlags = ['enableMembershipDay', 'enableMembershipTip', 'enableMembershipWeek', 'enableMembershipMonth', 'enableMembershipThreeMonth', 'enableMembershipSixMonth', 'enableMembershipYear']
      isPaid = membershipFlags.some((f) => rec[f] === true)
    }
  }
  const bodyText = $('body').text().replace(/\s+/g, ' ')
  const since = bodyText.match(/Since\s+([A-Z][a-z]+\s+\d{4})/)
  return {
    name,
    sinceLabel: since ? since[1] : null,
    avatarUrl,
    isPaid,
    activeTips,
    dateCreated,
  }
}

export type TipstrrHeader = TipstrrProfileHeader
